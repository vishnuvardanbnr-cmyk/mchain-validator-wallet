import { Router } from "express";
import { pool } from "@workspace/db";
import { keccak_256 } from "@noble/hashes/sha3";
import { privateKeyToAddress } from "viem/accounts";
import { createPublicClient, http, parseAbiItem, type Hex } from "viem";
import Stripe from "stripe";

const router = Router();

// ── MChain config ────────────────────────────────────────────────────────────
const MCHAIN_RPC = "https://chain.mvault.pro/api/rpc";
const USDT_DECIMALS = 6;

const mchain = {
  id: 1888,
  name: "Mchain",
  nativeCurrency: { name: "MC", symbol: "MC", decimals: 18 },
  rpcUrls: { default: { http: [MCHAIN_RPC] } },
} as const;

function getUsdtContract(): `0x${string}` {
  const addr = process.env["USDT_CONTRACT_ADDRESS"];
  if (!addr) throw new Error("USDT_CONTRACT_ADDRESS is not configured");
  return addr.toLowerCase() as `0x${string}`;
}

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

function getPublicClient() {
  return createPublicClient({ chain: mchain as never, transport: http(MCHAIN_RPC) });
}

// ── Stripe helpers ───────────────────────────────────────────────────────────
async function getStripeKey(): Promise<string | null> {
  try {
    const res = await pool.query(
      "SELECT key_value FROM platform_api_keys WHERE key_name = 'stripe_secret_key'"
    );
    return (res.rows[0]?.key_value as string) ?? null;
  } catch {
    return null;
  }
}

async function getStripeClient(): Promise<Stripe | null> {
  const key = await getStripeKey();
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-04-30.basil" });
}

// ── Address derivation ───────────────────────────────────────────────────────
function getUserDepositAddress(ethAddress: string): string {
  const escrowKey = process.env["P2P_ESCROW_PRIVATE_KEY"] ?? "mchain-cards-no-key";
  const masterInput = new TextEncoder().encode(escrowKey + ":mchain-cards-v1");
  const masterSeed = keccak_256(masterInput);
  const masterSeedHex = Buffer.from(masterSeed).toString("hex");
  const userInput = new TextEncoder().encode(masterSeedHex + ":" + ethAddress.toLowerCase());
  const userSeed = keccak_256(userInput);
  const privKeyHex = ("0x" + Buffer.from(userSeed).toString("hex")) as `0x${string}`;
  return privateKeyToAddress(privKeyHex);
}

// ── Table setup ──────────────────────────────────────────────────────────────
export async function ensureCardsTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS card_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_address TEXT NOT NULL UNIQUE,
      deposit_address TEXT NOT NULL,
      balance_usdt NUMERIC(20, 6) NOT NULL DEFAULT 0,
      frozen BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'active',
      stripe_cardholder_id TEXT,
      stripe_card_id TEXT,
      cardholder_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE card_accounts ADD COLUMN IF NOT EXISTS stripe_cardholder_id TEXT;
    ALTER TABLE card_accounts ADD COLUMN IF NOT EXISTS stripe_card_id TEXT;
    ALTER TABLE card_accounts ADD COLUMN IF NOT EXISTS cardholder_name TEXT;
    CREATE TABLE IF NOT EXISTS card_deposits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_address TEXT NOT NULL,
      tx_hash TEXT NOT NULL UNIQUE,
      amount_usdt NUMERIC(20, 6) NOT NULL,
      from_address TEXT NOT NULL DEFAULT '',
      network TEXT NOT NULL DEFAULT 'mchain',
      status TEXT NOT NULL DEFAULT 'confirmed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS card_deposits_wallet_idx ON card_deposits(wallet_address);
  `);
}

// ── Stripe: create cardholder + card ─────────────────────────────────────────
async function provisionStripeCard(
  stripe: Stripe,
  name: string,
  walletAddress: string
): Promise<{ cardholderId: string; cardId: string }> {
  const cardholder = await stripe.issuing.cardholders.create({
    name: name || `MChain User ${walletAddress.slice(2, 8).toUpperCase()}`,
    type: "individual",
    billing: {
      address: {
        line1: "123 Main Street",
        city: "New York",
        state: "NY",
        postal_code: "10001",
        country: "US",
      },
    },
    status: "active",
  });

  const card = await stripe.issuing.cards.create({
    cardholder: cardholder.id,
    currency: "usd",
    type: "virtual",
    status: "active",
  });

  return { cardholderId: cardholder.id, cardId: card.id };
}

// ── Stripe: sync spending limit to current USDT balance ──────────────────────
async function syncStripeSpendingLimit(
  stripe: Stripe,
  cardId: string,
  balanceUsdt: number
): Promise<void> {
  const amountCents = Math.floor(balanceUsdt * 100);
  if (amountCents <= 0) {
    await stripe.issuing.cards.update(cardId, {
      spending_controls: { spending_limits: [] },
    });
    return;
  }
  await stripe.issuing.cards.update(cardId, {
    spending_controls: {
      spending_limits: [{ amount: amountCents, interval: "all_time" }],
    },
  });
}

// ── POST /cards/init ─────────────────────────────────────────────────────────
router.post("/cards/init", async (req, res): Promise<void> => {
  const { walletAddress, name } = req.body as { walletAddress?: string; name?: string };
  if (!walletAddress || typeof walletAddress !== "string") {
    res.status(400).json({ error: "walletAddress required" });
    return;
  }
  const addr = walletAddress.toLowerCase();
  try {
    const existing = await pool.query(
      "SELECT * FROM card_accounts WHERE wallet_address = $1",
      [addr]
    );
    if (existing.rows.length > 0) {
      res.json({ account: existing.rows[0] });
      return;
    }

    const depositAddress = getUserDepositAddress(addr);
    const displayName = name?.trim() || `MChain ${addr.slice(2, 8).toUpperCase()}`;

    // Provision Stripe cardholder + card if key is configured
    let cardholderId: string | null = null;
    let cardId: string | null = null;
    try {
      const stripe = await getStripeClient();
      if (stripe) {
        const provisioned = await provisionStripeCard(stripe, displayName, addr);
        cardholderId = provisioned.cardholderId;
        cardId = provisioned.cardId;
      }
    } catch (err) {
      console.warn("Stripe provisioning failed:", err instanceof Error ? err.message : err);
    }

    const result = await pool.query(
      `INSERT INTO card_accounts (wallet_address, deposit_address, stripe_cardholder_id, stripe_card_id, cardholder_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [addr, depositAddress.toLowerCase(), cardholderId, cardId, displayName]
    );
    res.json({ account: result.rows[0] });
  } catch {
    res.status(500).json({ error: "Failed to initialise card account" });
  }
});

// ── GET /cards/account/:walletAddress ────────────────────────────────────────
router.get("/cards/account/:walletAddress", async (req, res): Promise<void> => {
  const addr = (req.params["walletAddress"] ?? "").toLowerCase();
  if (!addr) { res.status(400).json({ error: "walletAddress required" }); return; }
  try {
    const result = await pool.query(
      "SELECT * FROM card_accounts WHERE wallet_address = $1",
      [addr]
    );
    if (result.rows.length === 0) { res.json({ account: null }); return; }
    res.json({ account: result.rows[0] });
  } catch {
    res.status(500).json({ error: "Failed to fetch card account" });
  }
});

// ── GET /cards/deposits/:walletAddress ───────────────────────────────────────
router.get("/cards/deposits/:walletAddress", async (req, res): Promise<void> => {
  const addr = (req.params["walletAddress"] ?? "").toLowerCase();
  if (!addr) { res.status(400).json({ error: "walletAddress required" }); return; }
  try {
    const result = await pool.query(
      "SELECT * FROM card_deposits WHERE wallet_address = $1 ORDER BY created_at DESC LIMIT 50",
      [addr]
    );
    res.json({ deposits: result.rows });
  } catch {
    res.status(500).json({ error: "Failed to fetch deposits" });
  }
});

// ── GET /cards/stripe-details/:walletAddress ─────────────────────────────────
// Returns real card number, CVC, expiry for secure display in app.
// Works in test mode; live mode requires PCI DSS SAQ-D compliance.
router.get("/cards/stripe-details/:walletAddress", async (req, res): Promise<void> => {
  const addr = (req.params["walletAddress"] ?? "").toLowerCase();
  if (!addr) { res.status(400).json({ error: "walletAddress required" }); return; }
  try {
    const accountRes = await pool.query(
      "SELECT stripe_card_id FROM card_accounts WHERE wallet_address = $1",
      [addr]
    );
    if (accountRes.rows.length === 0) {
      res.status(404).json({ error: "Card account not found" });
      return;
    }
    const cardId: string | null = accountRes.rows[0].stripe_card_id as string | null;
    if (!cardId) {
      res.status(404).json({ error: "No Stripe card issued yet — add your Stripe key in admin settings" });
      return;
    }

    const stripe = await getStripeClient();
    if (!stripe) {
      res.status(503).json({ error: "Stripe key not configured" });
      return;
    }

    const card = await stripe.issuing.cards.retrieve(cardId, {
      expand: ["number", "cvc"],
    });

    res.json({
      number: (card as unknown as { number?: string }).number ?? null,
      cvc: (card as unknown as { cvc?: string }).cvc ?? null,
      exp_month: card.exp_month,
      exp_year: card.exp_year,
      last4: card.last4,
      brand: card.brand,
      status: card.status,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Failed to fetch card details: ${msg}` });
  }
});

// ── POST /cards/verify-deposit ───────────────────────────────────────────────
router.post("/cards/verify-deposit", async (req, res): Promise<void> => {
  const { walletAddress } = req.body as { walletAddress?: string };
  if (!walletAddress || typeof walletAddress !== "string") {
    res.status(400).json({ error: "walletAddress required" });
    return;
  }
  const addr = walletAddress.toLowerCase();

  try {
    const accountResult = await pool.query(
      "SELECT * FROM card_accounts WHERE wallet_address = $1",
      [addr]
    );
    if (accountResult.rows.length === 0) {
      res.status(404).json({ error: "Card account not found" });
      return;
    }
    const account = accountResult.rows[0] as {
      deposit_address: string;
      stripe_card_id: string | null;
      balance_usdt: string;
    };
    const depositAddress = account.deposit_address as Hex;

    let usdtContract: Hex;
    try {
      usdtContract = getUsdtContract();
    } catch {
      res.status(503).json({ error: "USDT_CONTRACT_ADDRESS is not configured on the server" });
      return;
    }

    const client = getPublicClient();
    const latestBlock = await client.getBlockNumber();
    const fromBlock = latestBlock > 500_000n ? latestBlock - 500_000n : 0n;

    const logs = await client.getLogs({
      address: usdtContract,
      event: TRANSFER_EVENT,
      args: { to: depositAddress },
      fromBlock,
      toBlock: "latest",
    });

    if (logs.length === 0) {
      res.json({ credited: 0, newDeposits: 0, message: "No USDT deposits found on MChain" });
      return;
    }

    const hashes = logs.map((l) => l.transactionHash).filter(Boolean);
    const existingResult = await pool.query(
      `SELECT tx_hash FROM card_deposits WHERE tx_hash = ANY($1)`,
      [hashes]
    );
    const existingHashes = new Set(
      existingResult.rows.map((r: { tx_hash: string }) => r.tx_hash)
    );

    const newLogs = logs.filter(
      (l) => l.transactionHash && !existingHashes.has(l.transactionHash)
    );

    if (newLogs.length === 0) {
      res.json({ credited: 0, newDeposits: 0, message: "All deposits already credited" });
      return;
    }

    let totalCredited = 0;
    for (const log of newLogs) {
      if (!log.args?.value || !log.transactionHash) continue;
      const amountUsdt = Number(log.args.value) / Math.pow(10, USDT_DECIMALS);
      if (amountUsdt <= 0) continue;

      await pool.query(
        `INSERT INTO card_deposits (wallet_address, tx_hash, amount_usdt, from_address, network)
         VALUES ($1, $2, $3, $4, 'mchain')
         ON CONFLICT (tx_hash) DO NOTHING`,
        [addr, log.transactionHash, amountUsdt.toFixed(6), (log.args.from ?? "").toLowerCase()]
      );
      totalCredited += amountUsdt;
    }

    let newBalance = parseFloat(account.balance_usdt);
    if (totalCredited > 0) {
      const updatedAccount = await pool.query(
        `UPDATE card_accounts
         SET balance_usdt = balance_usdt + $1, updated_at = NOW()
         WHERE wallet_address = $2
         RETURNING balance_usdt, stripe_card_id`,
        [totalCredited.toFixed(6), addr]
      );

      newBalance = parseFloat(updatedAccount.rows[0].balance_usdt as string);
      const stripeCardId: string | null = updatedAccount.rows[0].stripe_card_id as string | null;

      // Push new spending limit to Stripe
      if (stripeCardId) {
        try {
          const stripe = await getStripeClient();
          if (stripe) {
            await syncStripeSpendingLimit(stripe, stripeCardId, newBalance);
          }
        } catch (stripeErr) {
          console.warn("Stripe limit sync failed:", stripeErr instanceof Error ? stripeErr.message : stripeErr);
        }
      }
    }

    res.json({
      credited: totalCredited,
      newDeposits: newLogs.length,
      message: totalCredited > 0
        ? `${totalCredited.toFixed(2)} USDT credited — card limit set to $${newBalance.toFixed(2)}`
        : "All deposits already credited",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Verification failed: ${msg}` });
  }
});

// ── POST /cards/freeze ───────────────────────────────────────────────────────
router.post("/cards/freeze", async (req, res): Promise<void> => {
  const { walletAddress } = req.body as { walletAddress?: string };
  if (!walletAddress || typeof walletAddress !== "string") {
    res.status(400).json({ error: "walletAddress required" }); return;
  }
  const addr = walletAddress.toLowerCase();
  try {
    const result = await pool.query(
      `UPDATE card_accounts
       SET frozen = NOT frozen, updated_at = NOW()
       WHERE wallet_address = $1
       RETURNING frozen, stripe_card_id`,
      [addr]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: "Account not found" }); return; }

    const { frozen, stripe_card_id: stripeCardId } = result.rows[0] as {
      frozen: boolean;
      stripe_card_id: string | null;
    };

    // Mirror freeze/unfreeze on the Stripe card
    if (stripeCardId) {
      try {
        const stripe = await getStripeClient();
        if (stripe) {
          await stripe.issuing.cards.update(stripeCardId, {
            status: frozen ? "inactive" : "active",
          });
        }
      } catch (stripeErr) {
        console.warn("Stripe freeze sync failed:", stripeErr instanceof Error ? stripeErr.message : stripeErr);
      }
    }

    res.json({ frozen });
  } catch {
    res.status(500).json({ error: "Failed to update freeze status" });
  }
});

export default router;
