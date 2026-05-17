import { Router, type Request, type Response, type NextFunction } from "express";
import { pool } from "@workspace/db";

function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env["ADMIN_SECRET"];
  if (!secret) { res.status(503).json({ error: "Admin secret not configured" }); return; }
  const key = req.headers["x-admin-key"];
  if (!key || key !== secret) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

const router = Router();

export async function ensurePricesTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coin_prices (
      symbol TEXT PRIMARY KEY,
      price_type TEXT NOT NULL DEFAULT 'fixed',
      fixed_price NUMERIC,
      api_url TEXT,
      price_field TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Ensure MC native coin row exists with a default fixed price of 0
  await pool.query(`
    INSERT INTO coin_prices (symbol, price_type, fixed_price)
    VALUES ('MC', 'fixed', 0)
    ON CONFLICT (symbol) DO NOTHING
  `);
}

/** Extract a nested field from an object by dot-path, e.g. "data.price" */
function extractField(obj: unknown, path: string): number | null {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[part];
  }
  const n = Number(cur);
  return isNaN(n) ? null : n;
}

interface PriceRow {
  symbol: string;
  price_type: string;
  fixed_price: string | null;
  api_url: string | null;
  price_field: string | null;
}

async function resolveLivePrice(row: PriceRow): Promise<number> {
  if (row.price_type === "fixed") {
    return row.fixed_price !== null ? parseFloat(row.fixed_price) : 0;
  }
  // Auto: fetch from api_url and extract price_field
  if (!row.api_url) return 0;
  try {
    const resp = await fetch(row.api_url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return 0;
    const json = await resp.json();
    if (!row.price_field) {
      // If no field specified but it's a plain number, use it directly
      if (typeof json === "number") return json;
      return 0;
    }
    return extractField(json, row.price_field) ?? 0;
  } catch {
    return 0;
  }
}

// ── Public endpoint ────────────────────────────────────────────────────────────

router.get("/prices", async (_req, res) => {
  try {
    const { rows } = await pool.query<PriceRow>(
      `SELECT symbol, price_type, fixed_price, api_url, price_field FROM coin_prices ORDER BY symbol`
    );
    const prices = await Promise.all(
      rows.map(async (row) => ({
        symbol: row.symbol,
        priceType: row.price_type,
        priceUsd: await resolveLivePrice(row),
        apiUrl: row.api_url,
        priceField: row.price_field,
      }))
    );
    res.json({ prices });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ── Admin endpoints ────────────────────────────────────────────────────────────

router.get("/admin/prices", adminAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query<PriceRow>(
      `SELECT symbol, price_type, fixed_price, api_url, price_field FROM coin_prices ORDER BY symbol`
    );
    res.json({ prices: rows.map(r => ({
      symbol: r.symbol,
      priceType: r.price_type,
      fixedPrice: r.fixed_price !== null ? parseFloat(r.fixed_price) : null,
      apiUrl: r.api_url,
      priceField: r.price_field,
    })) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.put("/admin/prices/:symbol", adminAuth, async (req, res) => {
  const { symbol } = req.params;
  const { priceType, fixedPrice, apiUrl, priceField } = req.body as {
    priceType?: string; fixedPrice?: number | null; apiUrl?: string | null; priceField?: string | null;
  };
  const sym = symbol.toUpperCase().trim();
  try {
    const { rows } = await pool.query<PriceRow>(
      `INSERT INTO coin_prices (symbol, price_type, fixed_price, api_url, price_field, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (symbol) DO UPDATE SET
         price_type = EXCLUDED.price_type,
         fixed_price = EXCLUDED.fixed_price,
         api_url = EXCLUDED.api_url,
         price_field = EXCLUDED.price_field,
         updated_at = NOW()
       RETURNING *`,
      [
        sym,
        priceType ?? "fixed",
        priceType === "fixed" ? (fixedPrice ?? 0) : null,
        priceType === "auto" ? (apiUrl ?? null) : null,
        priceType === "auto" ? (priceField ?? null) : null,
      ]
    );
    const r = rows[0]!;
    res.json({ price: {
      symbol: r.symbol, priceType: r.price_type,
      fixedPrice: r.fixed_price !== null ? parseFloat(r.fixed_price) : null,
      apiUrl: r.api_url, priceField: r.price_field,
    }});
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Test an auto price URL before saving
router.post("/admin/prices/test", adminAuth, async (req, res) => {
  const { apiUrl, priceField } = req.body as { apiUrl?: string; priceField?: string };
  if (!apiUrl) { res.status(400).json({ error: "apiUrl required" }); return; }
  try {
    const resp = await fetch(apiUrl, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) { res.status(400).json({ error: `API responded with ${resp.status}` }); return; }
    const json = await resp.json();
    const extracted = priceField ? extractField(json, priceField) : (typeof json === "number" ? json : null);
    res.json({ ok: true, extracted, raw: json });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

export default router;
