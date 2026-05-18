import { Router } from "express";
import { pool } from "@workspace/db";
import { keccak_256 } from "@noble/hashes/sha3";
import { privateKeyToAddress } from "viem/accounts";

const router = Router();

const BSC_USDT_CONTRACT = "0x55d398326f99059fF775485246999027B3197955";
const BSCSCAN_API = "https://api.bscscan.com/api";
const USDT_DECIMALS = 18;

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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS card_deposits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_address TEXT NOT NULL,
      tx_hash TEXT NOT NULL UNIQUE,
      amount_usdt NUMERIC(20, 6) NOT NULL,
      from_address TEXT NOT NULL DEFAULT '',
      network TEXT NOT NULL DEFAULT 'bsc',
      status TEXT NOT NULL DEFAULT 'confirmed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS card_deposits_wallet_idx ON card_deposits(wallet_address);
  `);
}

// ── POST /cards/init ─────────────────────────────────────────────────────────
router.post("/cards/init", async (req, res): Promise<void> => {
  const { walletAddress } = req.body as { walletAddress?: string };
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
    const result = await pool.query(
      `INSERT INTO card_accounts (wallet_address, deposit_address)
       VALUES ($1, $2)
       RETURNING *`,
      [addr, depositAddress.toLowerCase()]
    );
    res.json({ account: result.rows[0] });
  } catch (err) {
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
      balance_usdt: string;
    };
    const depositAddress = account.deposit_address;

    // Fetch on-chain USDT transfers to this deposit address from BSCScan
    const bscscanUrl = new URL(BSCSCAN_API);
    bscscanUrl.searchParams.set("module", "account");
    bscscanUrl.searchParams.set("action", "tokentx");
    bscscanUrl.searchParams.set("contractaddress", BSC_USDT_CONTRACT);
    bscscanUrl.searchParams.set("address", depositAddress);
    bscscanUrl.searchParams.set("sort", "desc");
    bscscanUrl.searchParams.set("offset", "50");
    bscscanUrl.searchParams.set("page", "1");
    if (process.env["BSCSCAN_API_KEY"]) {
      bscscanUrl.searchParams.set("apikey", process.env["BSCSCAN_API_KEY"]);
    }

    const bscscanRes = await fetch(bscscanUrl.toString(), {
      signal: AbortSignal.timeout(10_000),
    });
    const bscscanData = await bscscanRes.json() as {
      status: string;
      result: Array<{
        hash: string;
        from: string;
        to: string;
        value: string;
        tokenSymbol: string;
        tokenDecimal: string;
        timeStamp: string;
      }> | string;
    };

    // No transactions found
    if (bscscanData.status !== "1" || !Array.isArray(bscscanData.result)) {
      res.json({ credited: 0, newDeposits: 0, message: "No deposits found on chain" });
      return;
    }

    // Filter to incoming transfers only
    const incoming = bscscanData.result.filter(
      (tx) => tx.to.toLowerCase() === depositAddress.toLowerCase()
    );

    if (incoming.length === 0) {
      res.json({ credited: 0, newDeposits: 0, message: "No incoming USDT deposits found" });
      return;
    }

    // Find which tx hashes we haven't credited yet
    const hashes = incoming.map((tx) => tx.hash);
    const existingResult = await pool.query(
      `SELECT tx_hash FROM card_deposits WHERE tx_hash = ANY($1)`,
      [hashes]
    );
    const existingHashes = new Set(existingResult.rows.map((r: { tx_hash: string }) => r.tx_hash));

    const newTxs = incoming.filter((tx) => !existingHashes.has(tx.hash));
    if (newTxs.length === 0) {
      res.json({ credited: 0, newDeposits: 0, message: "All deposits already credited" });
      return;
    }

    // Credit each new deposit
    let totalCredited = 0;
    for (const tx of newTxs) {
      const decimals = parseInt(tx.tokenDecimal) || USDT_DECIMALS;
      const amountUsdt = Number(BigInt(tx.value)) / Math.pow(10, decimals);
      if (amountUsdt <= 0) continue;

      await pool.query(
        `INSERT INTO card_deposits (wallet_address, tx_hash, amount_usdt, from_address, network)
         VALUES ($1, $2, $3, $4, 'bsc')
         ON CONFLICT (tx_hash) DO NOTHING`,
        [addr, tx.hash, amountUsdt.toFixed(6), tx.from.toLowerCase()]
      );
      totalCredited += amountUsdt;
    }

    if (totalCredited > 0) {
      await pool.query(
        `UPDATE card_accounts
         SET balance_usdt = balance_usdt + $1, updated_at = NOW()
         WHERE wallet_address = $2`,
        [totalCredited.toFixed(6), addr]
      );
    }

    res.json({
      credited: totalCredited,
      newDeposits: newTxs.length,
      message: totalCredited > 0
        ? `${totalCredited.toFixed(2)} USDT credited to your card`
        : "All deposits already credited",
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to verify deposit" });
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
       RETURNING frozen`,
      [addr]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: "Account not found" }); return; }
    res.json({ frozen: result.rows[0].frozen });
  } catch {
    res.status(500).json({ error: "Failed to update freeze status" });
  }
});

export default router;
