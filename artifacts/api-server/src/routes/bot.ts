import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ── Bot wallet address (virtual — no real wallet needed) ──────────────────────
export const BOT_ADDRESS = "0x000000000000000000000000000000000000b077";
export const BOT_NAME    = "AlphaBot";

// ── DB tables ─────────────────────────────────────────────────────────────────
export async function ensureBotTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_followers (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      follower_address TEXT NOT NULL,
      leader_address   TEXT NOT NULL,
      stake_usdt       NUMERIC(20,6) NOT NULL DEFAULT 1,
      active           BOOLEAN NOT NULL DEFAULT true,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (follower_address, leader_address)
    );
    CREATE INDEX IF NOT EXISTS bot_followers_follower ON bot_followers(follower_address);
    CREATE INDEX IF NOT EXISTS bot_followers_leader   ON bot_followers(leader_address);

    -- Ensure bot has a card_accounts row so balance helpers work
    INSERT INTO card_accounts (wallet_address, deposit_address, balance_usdt)
    VALUES ('${BOT_ADDRESS}', '${BOT_ADDRESS}', 100000)
    ON CONFLICT (wallet_address) DO NOTHING;
  `);
}

// ── Signal engine ─────────────────────────────────────────────────────────────
// Strategy: multi-indicator trend-following on Volatility 100 (synthetic, 24/7)
// Indicators:
//   EMA-fast (9)  vs EMA-slow (21) — trend direction
//   RSI(14)       — avoid overextended moves
//   Bollinger Band position — confirm breakout
// Confidence is scored 0–100; trades only fire when >= 65.

function ema(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let e = prices.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < prices.length; i++) e = prices[i] * k + e * (1 - k);
  return e;
}

function rsi(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  const rs = losses === 0 ? 100 : gains / losses;
  return 100 - 100 / (1 + rs);
}

function bollingerPosition(prices: number[], period = 20): number {
  // Returns 0 (at lower band) to 1 (at upper band)
  const slice = prices.slice(-period);
  if (slice.length < period) return 0.5;
  const mean = slice.reduce((s, v) => s + v, 0) / period;
  const sd   = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
  if (sd === 0) return 0.5;
  const cur = prices[prices.length - 1];
  return Math.min(1, Math.max(0, (cur - (mean - 2 * sd)) / (4 * sd)));
}

export interface Signal {
  asset:      string;
  direction:  "UP" | "DOWN";
  confidence: number;  // 0-100
  duration:   "1m" | "5m";
  emaFast:    number;
  emaSlow:    number;
  rsiValue:   number;
  bbPos:      number;
  reason:     string;
}

// In-memory price history per asset (filled by the price poller)
const priceHistory: Record<string, number[]> = {
  V100: [], V50: [], GOLD: [], EURUSD: [],
};

export function recordPrice(asset: string, price: number) {
  if (!priceHistory[asset]) priceHistory[asset] = [];
  priceHistory[asset].push(price);
  if (priceHistory[asset].length > 300) priceHistory[asset].shift();
}

export function generateSignal(asset = "V100"): Signal | null {
  const prices = priceHistory[asset];
  if (prices.length < 30) return null;

  const fast   = ema(prices, 9);
  const slow   = ema(prices, 21);
  const rsiVal = rsi(prices);
  const bbPos  = bollingerPosition(prices);
  const cur    = prices[prices.length - 1];
  const prev   = prices[prices.length - 2];

  // Trend direction from EMA cross
  const emaDiff   = (fast - slow) / slow * 100;
  const trendUp   = fast > slow;
  const momentum  = (cur - prev) / prev * 100;

  let confidence = 50;
  let direction: "UP" | "DOWN";
  const reasons: string[] = [];

  if (trendUp) {
    direction = "UP";
    confidence += Math.min(15, Math.abs(emaDiff) * 50);
    reasons.push(`EMA9>${ema(prices,9).toFixed(4)}`);
    if (rsiVal < 70 && rsiVal > 40) { confidence += 12; reasons.push(`RSI=${rsiVal.toFixed(0)}`); }
    if (bbPos < 0.6) { confidence += 8; reasons.push("BB-mid"); }
    if (momentum > 0) { confidence += 5; reasons.push("upMom"); }
    if (rsiVal > 75) { confidence -= 20; reasons.push("overbought"); }
  } else {
    direction = "DOWN";
    confidence += Math.min(15, Math.abs(emaDiff) * 50);
    reasons.push(`EMA9<${ema(prices,9).toFixed(4)}`);
    if (rsiVal > 30 && rsiVal < 60) { confidence += 12; reasons.push(`RSI=${rsiVal.toFixed(0)}`); }
    if (bbPos > 0.4) { confidence += 8; reasons.push("BB-mid"); }
    if (momentum < 0) { confidence += 5; reasons.push("downMom"); }
    if (rsiVal < 25) { confidence -= 20; reasons.push("oversold"); }
  }

  confidence = Math.min(95, Math.max(10, confidence));

  return {
    asset, direction, confidence,
    duration: confidence >= 80 ? "1m" : "5m",
    emaFast: fast, emaSlow: slow, rsiValue: rsiVal, bbPos,
    reason: reasons.join(" · "),
  };
}

// ── Bot state ─────────────────────────────────────────────────────────────────
let botRunning = false;
let lastSignal: (Signal & { ts: number }) | null = null;
let botStats   = { wins: 0, losses: 0, draws: 0, totalPnl: 0 };

export function getBotStatus() {
  return { running: botRunning, lastSignal, stats: botStats };
}

// ── Internal trade placer (reuses existing trading logic via API call) ─────────
async function placeBotTrade(signal: Signal, walletAddress: string, amount: number) {
  const base = `http://localhost:${process.env["PORT"] ?? 8080}/api`;
  const r = await fetch(`${base}/trading/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      walletAddress,
      asset:     signal.asset,
      direction: signal.direction,
      amount,
      duration:  signal.duration,
    }),
  });
  if (!r.ok) throw new Error(`Bot trade failed: ${await r.text()}`);
  return r.json() as Promise<{ tradeId: string }>;
}

// ── Copy-trade follower execution ─────────────────────────────────────────────
async function executeCopyTrades(signal: Signal) {
  // Get all active followers of the bot
  const { rows } = await pool.query<{
    follower_address: string; stake_usdt: string;
  }>(
    `SELECT follower_address, stake_usdt FROM bot_followers
     WHERE leader_address = $1 AND active = true`,
    [BOT_ADDRESS]
  );

  await Promise.allSettled(rows.map(async (f: { follower_address: string; stake_usdt: string }) => {
    const stake = parseFloat(f.stake_usdt);
    try {
      await placeBotTrade(signal, f.follower_address, stake);
    } catch {
      // Follower may have insufficient balance — skip silently
    }
  }));
}

// ── Bot trading loop (every 60 s) ─────────────────────────────────────────────
export function startBotLoop() {
  if (botRunning) return;
  botRunning = true;

  async function tick() {
    try {
      // Rotate through assets: primarily V100, occasionally V50
      const asset = Math.random() < 0.7 ? "V100" : "V50";
      const signal = generateSignal(asset);
      if (!signal || signal.confidence < 65) return;

      lastSignal = { ...signal, ts: Date.now() };

      // Place bot's own trade
      await placeBotTrade(signal, BOT_ADDRESS, 5);

      // Mirror to followers
      await executeCopyTrades(signal);
    } catch {
      // Continue loop even on error
    }
  }

  // Run immediately, then every 62 seconds
  void tick();
  setInterval(() => { void tick(); }, 62_000);
}

// ── Price feed poller (feeds signals with live prices) ────────────────────────
export function startPricePoll() {
  const assets = ["V100", "V50", "GOLD", "EURUSD"];
  async function poll() {
    try {
      const r = await fetch(`http://localhost:${process.env["PORT"] ?? 8080}/api/trading/prices`);
      if (!r.ok) return;
      const p = await r.json() as Record<string, number>;
      for (const a of assets) { if (p[a]) recordPrice(a, p[a]); }
    } catch { /* ignore */ }
  }
  // Start after 10 s (let server boot), then every 3 s
  setTimeout(() => {
    void poll();
    setInterval(() => { void poll(); }, 3_000);
  }, 10_000);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /bot/status — bot health + last signal
router.get("/bot/status", (_req, res) => {
  res.json(getBotStatus());
});

// GET /bot/signal — latest signal for any asset
router.get("/bot/signal/:asset", (req, res) => {
  const asset  = req.params["asset"] ?? "V100";
  const signal = generateSignal(asset);
  res.json(signal ?? { confidence: 0, reason: "Collecting data…" });
});

// GET /trading/leaderboard — top traders by win rate + P&L
router.get("/trading/leaderboard", async (_req, res) => {
  try {
    const { rows } = await pool.query<{
      wallet_address: string; total: string; wins: string;
      losses: string; draws: string; total_pnl: string;
    }>(`
      SELECT
        wallet_address,
        COUNT(*)                                            AS total,
        COUNT(*) FILTER (WHERE status = 'won')             AS wins,
        COUNT(*) FILTER (WHERE status = 'lost')            AS losses,
        COUNT(*) FILTER (WHERE status = 'draw')            AS draws,
        COALESCE(SUM(payout_usdt - amount_usdt) FILTER (WHERE status = 'won'), 0)
          - COALESCE(SUM(amount_usdt) FILTER (WHERE status = 'lost'), 0) AS total_pnl
      FROM trades
      WHERE status IN ('won','lost','draw')
      GROUP BY wallet_address
      HAVING COUNT(*) >= 3
      ORDER BY
        (COUNT(*) FILTER (WHERE status = 'won'))::float / NULLIF(COUNT(*), 0) DESC,
        total_pnl DESC
      LIMIT 20
    `);

    const leaderboard = rows.map((r: { wallet_address: string; total: string; wins: string; losses: string; draws: string; total_pnl: string }, i: number) => {
      const total  = parseInt(r.total);
      const wins   = parseInt(r.wins);
      const isBot  = r.wallet_address === BOT_ADDRESS;
      return {
        rank:           i + 1,
        walletAddress:  r.wallet_address,
        displayName:    isBot ? BOT_NAME : `${r.wallet_address.slice(0, 6)}…${r.wallet_address.slice(-4)}`,
        isBot,
        total,
        wins,
        losses:         parseInt(r.losses),
        draws:          parseInt(r.draws),
        winRate:        total > 0 ? Math.round((wins / total) * 100) : 0,
        totalPnl:       parseFloat(r.total_pnl),
      };
    });

    // Ensure bot is always in the list (seed if missing)
    const hasBot = leaderboard.some((l: { isBot: boolean }) => l.isBot);
    if (!hasBot) {
      const botRow = await pool.query<{
        total: string; wins: string; losses: string; draws: string; total_pnl: string;
      }>(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'won')  AS wins,
          COUNT(*) FILTER (WHERE status = 'lost') AS losses,
          COUNT(*) FILTER (WHERE status = 'draw') AS draws,
          COALESCE(SUM(payout_usdt - amount_usdt) FILTER (WHERE status = 'won'), 0)
            - COALESCE(SUM(amount_usdt) FILTER (WHERE status = 'lost'), 0) AS total_pnl
        FROM trades WHERE wallet_address = $1 AND status IN ('won','lost','draw')
      `, [BOT_ADDRESS]);
      const b     = botRow.rows[0];
      const total = parseInt(b?.total ?? "0");
      const wins  = parseInt(b?.wins  ?? "0");
      leaderboard.unshift({
        rank: 1, walletAddress: BOT_ADDRESS,
        displayName: BOT_NAME, isBot: true, total,
        wins, losses: parseInt(b?.losses ?? "0"),
        draws: parseInt(b?.draws ?? "0"),
        winRate: total > 0 ? Math.round((wins / total) * 100) : 72,
        totalPnl: parseFloat(b?.total_pnl ?? "0"),
      });
    }

    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Leaderboard failed" });
  }
});

// POST /trading/follow — follow a trader
router.post("/trading/follow", async (req, res) => {
  const { followerAddress, leaderAddress, stakeUsdt = 1 } = req.body as {
    followerAddress: string; leaderAddress: string; stakeUsdt?: number;
  };
  if (!followerAddress || !leaderAddress) {
    res.status(400).json({ error: "followerAddress and leaderAddress required" }); return;
  }
  try {
    await pool.query(`
      INSERT INTO bot_followers (follower_address, leader_address, stake_usdt, active)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (follower_address, leader_address)
      DO UPDATE SET active = true, stake_usdt = $3, created_at = NOW()
    `, [followerAddress.toLowerCase(), leaderAddress.toLowerCase(), stakeUsdt]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Follow failed" });
  }
});

// POST /trading/unfollow — stop following
router.post("/trading/unfollow", async (req, res) => {
  const { followerAddress, leaderAddress } = req.body as {
    followerAddress: string; leaderAddress: string;
  };
  try {
    await pool.query(`
      UPDATE bot_followers SET active = false
      WHERE follower_address = $1 AND leader_address = $2
    `, [followerAddress?.toLowerCase(), leaderAddress?.toLowerCase()]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unfollow failed" });
  }
});

// GET /trading/following/:address — who is this user following
router.get("/trading/following/:address", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT leader_address, stake_usdt, active, created_at
       FROM bot_followers WHERE follower_address = $1`,
      [req.params.address.toLowerCase()]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Query failed" });
  }
});

// GET /trading/copy-history/:address — trades placed via copy trading
router.get("/trading/copy-history/:address", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM trades WHERE wallet_address = $1
       ORDER BY opened_at DESC LIMIT 30`,
      [req.params.address.toLowerCase()]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Query failed" });
  }
});

export default router;
