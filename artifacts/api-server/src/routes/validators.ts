import { Router } from "express";
import { db, pool } from "@workspace/db";
import { validatorSubWallets } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { bech32 } from "bech32";

const CHAIN_BASE = "https://node.mymchain.com/api";
const MAX_SUB_WALLETS = 10;

const router = Router();

// ── Table migration ───────────────────────────────────────────────────────────

export async function ensureValidatorsTable() {
  // Create with full schema if not exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS validator_sub_wallets (
      id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      validator_address     TEXT        NOT NULL,
      sub_wallet_address    TEXT        NOT NULL UNIQUE,
      sub_wallet_eth_address TEXT       NOT NULL DEFAULT '',
      package_tier          TEXT,
      frozen_balance        TEXT        NOT NULL DEFAULT '0',
      available_balance     TEXT        NOT NULL DEFAULT '0',
      label                 TEXT,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_vsw_validator ON validator_sub_wallets(validator_address);
  `);
  // Graceful migration: add any missing columns to an older table
  await pool.query(`
    ALTER TABLE validator_sub_wallets ADD COLUMN IF NOT EXISTS sub_wallet_eth_address TEXT NOT NULL DEFAULT '';
    ALTER TABLE validator_sub_wallets ADD COLUMN IF NOT EXISTS package_tier TEXT;
    ALTER TABLE validator_sub_wallets ADD COLUMN IF NOT EXISTS frozen_balance TEXT NOT NULL DEFAULT '0';
    ALTER TABLE validator_sub_wallets ADD COLUMN IF NOT EXISTS available_balance TEXT NOT NULL DEFAULT '0';
    ALTER TABLE validator_sub_wallets ADD COLUMN IF NOT EXISTS label TEXT;
  `);
}

// ── Address utilities ─────────────────────────────────────────────────────────

function mxcToEth(mxcAddress: string): string {
  const decoded = bech32.decode(mxcAddress);
  const bytes = Uint8Array.from(bech32.fromWords(decoded.words));
  return "0x" + Buffer.from(bytes).toString("hex");
}

function ethToMxc(ethAddress: string): string {
  const hex = ethAddress.replace(/^0x/i, "");
  const bytes = Buffer.from(hex, "hex");
  const words = bech32.toWords(bytes);
  return bech32.encode("mxc", words);
}

/** Normalise any address to lowercase; return both forms. */
function resolveAddressPair(addr: string): { mxc: string; eth: string } | null {
  try {
    const lower = addr.toLowerCase();
    if (lower.startsWith("mxc1")) {
      return { mxc: lower, eth: mxcToEth(lower) };
    }
    if (/^0x[0-9a-f]{40}$/.test(lower)) {
      return { mxc: ethToMxc(lower), eth: lower };
    }
    return null;
  } catch {
    return null;
  }
}

// ── On-chain activation check ─────────────────────────────────────────────────

/** Returns "55", "130", or null (not yet activated). */
async function checkOnChainPackageTier(mxcAddress: string, ethAddress: string): Promise<string | null> {
  // Try the accounts endpoint first
  for (const addr of [mxcAddress, ethAddress]) {
    try {
      const res = await fetch(`${CHAIN_BASE}/accounts/${encodeURIComponent(addr)}`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        const account = (data.account ?? data) as Record<string, unknown>;
        if (account.packageTier && typeof account.packageTier === "string") {
          return account.packageTier;
        }
        if (account.package_tier && typeof account.package_tier === "string") {
          return account.package_tier;
        }
        if (account.isActive === true || account.is_active === true) {
          return "55"; // activated but tier unknown — default to entry tier
        }
      }
    } catch {
      // continue to next attempt
    }
  }
  // Try the validators endpoint
  try {
    const res = await fetch(`${CHAIN_BASE}/validators/${encodeURIComponent(mxcAddress)}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const data = await res.json() as Record<string, unknown>;
      const v = (data.validator ?? data) as Record<string, unknown>;
      if (v.packageTier && typeof v.packageTier === "string") return v.packageTier;
      if (v.package_tier && typeof v.package_tier === "string") return v.package_tier;
    }
  } catch {
    // ignore
  }
  return null;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /validators/:address/sub-wallets
router.get("/validators/:address/sub-wallets", async (req, res) => {
  try {
    const validatorAddress = decodeURIComponent(req.params["address"] ?? "").toLowerCase();
    const rows = await db
      .select()
      .from(validatorSubWallets)
      .where(eq(validatorSubWallets.validatorAddress, validatorAddress));

    // Lazy-verify any pending sub-wallets (packageTier === null)
    const pending = rows.filter(r => r.packageTier === null);
    if (pending.length > 0) {
      await Promise.all(
        pending.map(async (sw) => {
          const tier = await checkOnChainPackageTier(sw.subWalletAddress, sw.subWalletEthAddress);
          if (tier) {
            await db
              .update(validatorSubWallets)
              .set({ packageTier: tier })
              .where(eq(validatorSubWallets.id, sw.id));
            sw.packageTier = tier;
          }
        })
      );
    }

    res.json({
      validatorAddress,
      subWallets: rows,
      total: rows.length,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch sub wallets" });
  }
});

// POST /validators/:address/sub-wallets
router.post("/validators/:address/sub-wallets", async (req, res) => {
  try {
    const validatorAddress = decodeURIComponent(req.params["address"] ?? "").toLowerCase();
    const body = req.body as { subWalletAddress?: string; label?: string };
    const rawAddr = (body.subWalletAddress ?? "").trim();
    const label = body.label?.trim() || null;

    if (!rawAddr) {
      res.status(400).json({ error: "subWalletAddress is required" });
      return;
    }

    const pair = resolveAddressPair(rawAddr);
    if (!pair) {
      res.status(400).json({ error: "Enter a valid mxc1... or 0x... address" });
      return;
    }

    const validatorPair = resolveAddressPair(validatorAddress);
    if (
      pair.mxc === validatorPair?.mxc ||
      pair.eth === validatorPair?.eth
    ) {
      res.status(400).json({ error: "Cannot add your own validator address as a sub wallet" });
      return;
    }

    // Max 10 per validator
    const [{ total }] = await db
      .select({ total: count() })
      .from(validatorSubWallets)
      .where(eq(validatorSubWallets.validatorAddress, validatorAddress));
    if (Number(total) >= MAX_SUB_WALLETS) {
      res.status(400).json({ error: `Maximum ${MAX_SUB_WALLETS} sub wallets per validator` });
      return;
    }

    // Global uniqueness — check both mxc and eth forms
    const existing = await db
      .select()
      .from(validatorSubWallets)
      .where(eq(validatorSubWallets.subWalletAddress, pair.mxc));
    const existingEth = existing.length === 0
      ? await db
          .select()
          .from(validatorSubWallets)
          .where(eq(validatorSubWallets.subWalletEthAddress, pair.eth))
      : [];

    const found = existing[0] ?? existingEth[0];
    if (found) {
      if (found.validatorAddress === validatorAddress) {
        res.status(400).json({ error: "This wallet is already added" });
      } else {
        res.status(409).json({ error: "This wallet is already linked to another validator" });
      }
      return;
    }

    // Check on-chain activation
    const packageTier = await checkOnChainPackageTier(pair.mxc, pair.eth);

    const [row] = await db
      .insert(validatorSubWallets)
      .values({
        validatorAddress,
        subWalletAddress: pair.mxc,
        subWalletEthAddress: pair.eth,
        packageTier,
        frozenBalance: "0",
        availableBalance: "0",
        label,
      })
      .returning();

    res.status(201).json({ ok: true, subWallet: row });
  } catch {
    res.status(500).json({ error: "Failed to add sub wallet" });
  }
});

// DELETE /validators/:address/sub-wallets  (body: { subWalletAddress })
router.delete("/validators/:address/sub-wallets", async (req, res) => {
  try {
    const validatorAddress = decodeURIComponent(req.params["address"] ?? "").toLowerCase();
    const body = req.body as { subWalletAddress?: string };
    const rawAddr = (body.subWalletAddress ?? "").trim().toLowerCase();

    if (!rawAddr) {
      res.status(400).json({ error: "subWalletAddress is required" });
      return;
    }

    const pair = resolveAddressPair(rawAddr);

    // Try to delete by mxc address first, then by eth address
    const deleted = await db
      .delete(validatorSubWallets)
      .where(
        and(
          eq(validatorSubWallets.validatorAddress, validatorAddress),
          eq(validatorSubWallets.subWalletAddress, pair?.mxc ?? rawAddr)
        )
      )
      .returning();

    if (deleted.length === 0 && pair?.eth) {
      await db
        .delete(validatorSubWallets)
        .where(
          and(
            eq(validatorSubWallets.validatorAddress, validatorAddress),
            eq(validatorSubWallets.subWalletEthAddress, pair.eth)
          )
        );
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to remove sub wallet" });
  }
});

export default router;
