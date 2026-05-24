import { Router } from "express";
import { db, pool } from "@workspace/db";
import { validatorSubWallets } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

export async function ensureValidatorsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS validator_sub_wallets (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      validator_address   TEXT        NOT NULL,
      sub_wallet_address  TEXT        NOT NULL UNIQUE,
      status      TEXT        NOT NULL DEFAULT 'verified',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_vsw_validator ON validator_sub_wallets(validator_address);
  `);
}

function isValidAddress(addr: string): boolean {
  if (/^0x[0-9a-fA-F]{40}$/.test(addr)) return true;
  if (/^mxc1[0-9a-z]{38,}$/.test(addr)) return true;
  return false;
}

// GET /validators/:address/sub-wallets
router.get("/validators/:address/sub-wallets", async (req, res) => {
  try {
    const address = decodeURIComponent(req.params["address"] ?? "").toLowerCase();
    const rows = await db
      .select()
      .from(validatorSubWallets)
      .where(eq(validatorSubWallets.validatorAddress, address));
    res.json({ subWallets: rows });
  } catch {
    res.status(500).json({ error: "Failed to fetch sub wallets" });
  }
});

// POST /validators/:address/sub-wallets
router.post("/validators/:address/sub-wallets", async (req, res) => {
  try {
    const validatorAddress = decodeURIComponent(req.params["address"] ?? "").toLowerCase();
    const subWalletAddress = ((req.body as { subWalletAddress?: string }).subWalletAddress ?? "").toLowerCase().trim();

    if (!subWalletAddress) {
      res.status(400).json({ error: "subWalletAddress is required" });
      return;
    }
    if (!isValidAddress(subWalletAddress)) {
      res.status(400).json({ error: "Enter a valid mxc1... or 0x... address" });
      return;
    }
    if (subWalletAddress === validatorAddress) {
      res.status(400).json({ error: "Cannot add your own validator address as a sub wallet" });
      return;
    }

    const existing = await db
      .select()
      .from(validatorSubWallets)
      .where(eq(validatorSubWallets.subWalletAddress, subWalletAddress));

    if (existing.length > 0) {
      if (existing[0]!.validatorAddress === validatorAddress) {
        res.status(400).json({ error: "This wallet is already added" });
      } else {
        res.status(409).json({ error: "This wallet is already linked to another validator" });
      }
      return;
    }

    const [row] = await db
      .insert(validatorSubWallets)
      .values({ validatorAddress, subWalletAddress, status: "verified" })
      .returning();

    res.json({ subWallet: row });
  } catch {
    res.status(500).json({ error: "Failed to add sub wallet" });
  }
});

// DELETE /validators/:address/sub-wallets/:subAddress
router.delete("/validators/:address/sub-wallets/:subAddress", async (req, res) => {
  try {
    const validatorAddress = decodeURIComponent(req.params["address"] ?? "").toLowerCase();
    const subAddress = decodeURIComponent(req.params["subAddress"] ?? "").toLowerCase();

    await db
      .delete(validatorSubWallets)
      .where(
        and(
          eq(validatorSubWallets.validatorAddress, validatorAddress),
          eq(validatorSubWallets.subWalletAddress, subAddress)
        )
      );

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to remove sub wallet" });
  }
});

export default router;
