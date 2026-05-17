import { Router, type Request, type Response, type NextFunction } from "express";
import { db, verifiedTokens } from "@workspace/db";
import { pool } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env["ADMIN_SECRET"];
  if (!secret) { res.status(503).json({ error: "Admin secret not configured" }); return; }
  const key = req.headers["x-admin-key"];
  if (!key || key !== secret) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

const router = Router();

// ── Ensure table exists on startup ────────────────────────────────────────────
export async function ensureTokensTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS verified_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      decimals INTEGER NOT NULL DEFAULT 18,
      logo_url TEXT NOT NULL DEFAULT '',
      coingecko_id TEXT NOT NULL DEFAULT '',
      contract_address TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// ── Public endpoint ────────────────────────────────────────────────────────────

router.get("/tokens", async (_req, res) => {
  const rows = await db.select().from(verifiedTokens)
    .where(eq(verifiedTokens.active, true))
    .orderBy(asc(verifiedTokens.sortOrder), asc(verifiedTokens.createdAt));
  res.json({ tokens: rows });
});

// ── Admin CRUD ─────────────────────────────────────────────────────────────────

router.get("/admin/tokens", adminAuth, async (_req, res) => {
  const rows = await db.select().from(verifiedTokens)
    .orderBy(asc(verifiedTokens.sortOrder), asc(verifiedTokens.createdAt));
  res.json({ tokens: rows });
});

router.post("/admin/tokens", adminAuth, async (req, res) => {
  const { symbol, name, decimals, logoUrl, coingeckoId, contractAddress, sortOrder, active } = req.body as {
    symbol: string; name: string; decimals?: number;
    logoUrl?: string; coingeckoId?: string; contractAddress?: string;
    sortOrder?: number; active?: boolean;
  };
  if (!symbol || !name) {
    res.status(400).json({ error: "symbol and name are required" });
    return;
  }
  const [row] = await db.insert(verifiedTokens).values({
    symbol: symbol.toUpperCase().trim(),
    name: name.trim(),
    decimals: decimals ?? 18,
    logoUrl: logoUrl ?? "",
    coingeckoId: coingeckoId ?? "",
    contractAddress: contractAddress ?? "",
    sortOrder: sortOrder ?? 0,
    active: active ?? true,
  }).returning();
  res.status(201).json({ token: row });
});

router.put("/admin/tokens/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  const { symbol, name, decimals, logoUrl, coingeckoId, contractAddress, sortOrder, active } = req.body as {
    symbol?: string; name?: string; decimals?: number;
    logoUrl?: string; coingeckoId?: string; contractAddress?: string;
    sortOrder?: number; active?: boolean;
  };
  const [row] = await db.update(verifiedTokens)
    .set({
      ...(symbol !== undefined && { symbol: symbol.toUpperCase().trim() }),
      ...(name !== undefined && { name: name.trim() }),
      ...(decimals !== undefined && { decimals }),
      ...(logoUrl !== undefined && { logoUrl }),
      ...(coingeckoId !== undefined && { coingeckoId }),
      ...(contractAddress !== undefined && { contractAddress }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(active !== undefined && { active }),
      updatedAt: new Date(),
    })
    .where(eq(verifiedTokens.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ token: row });
});

router.delete("/admin/tokens/:id", adminAuth, async (req, res) => {
  const { id } = req.params;
  await db.delete(verifiedTokens).where(eq(verifiedTokens.id, id));
  res.json({ ok: true });
});

export default router;
