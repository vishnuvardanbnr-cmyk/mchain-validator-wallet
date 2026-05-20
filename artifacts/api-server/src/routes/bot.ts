import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

export const BOT_ADDRESS = "0x000000000000000000000000000000000000b077";
export const BOT_NAME    = "AlphaBot";

let botStartedAt: Date | null = null;

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

    CREATE TABLE IF NOT EXISTS bot_signals (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trade_id    UUID,
      asset       TEXT NOT NULL,
      direction   TEXT NOT NULL,
      confidence  INT  NOT NULL,
      ema_fast    FLOAT NOT NULL,
      ema_slow    FLOAT NOT NULL,
      rsi_value   FLOAT NOT NULL,
      bb_pos      FLOAT NOT NULL,
      reason      TEXT NOT NULL,
      duration    TEXT NOT NULL,
      placed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS bot_signals_trade ON bot_signals(trade_id);
    CREATE INDEX IF NOT EXISTS bot_signals_ts    ON bot_signals(placed_at);

    INSERT INTO card_accounts (wallet_address, deposit_address, balance_usdt)
    VALUES ('${BOT_ADDRESS}', '${BOT_ADDRESS}', 100000)
    ON CONFLICT (wallet_address) DO NOTHING;
  `);
}

// ── Signal engine ─────────────────────────────────────────────────────────────
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
  confidence: number;
  duration:   "30s" | "1m";
  emaFast:    number;
  emaSlow:    number;
  rsiValue:   number;
  bbPos:      number;
  reason:     string;
}

const priceHistory: Record<string, number[]> = {
  V100: [], V50: [], GOLD: [], EURUSD: [],
};

export function recordPrice(asset: string, price: number) {
  if (!priceHistory[asset]) priceHistory[asset] = [];
  priceHistory[asset].push(price);
  if (priceHistory[asset].length > 300) priceHistory[asset].shift();
}

export function getPriceHistoryLength(asset: string): number {
  return priceHistory[asset]?.length ?? 0;
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

  const emaDiff  = (fast - slow) / slow * 100;
  const trendUp  = fast > slow;
  const momentum = (cur - prev) / prev * 100;

  let confidence = 50;
  let direction: "UP" | "DOWN";
  const reasons: string[] = [];

  if (trendUp) {
    direction = "UP";
    confidence += Math.min(15, Math.abs(emaDiff) * 50);
    reasons.push(`EMA9(${fast.toFixed(3)}) > EMA21(${slow.toFixed(3)})`);
    if (rsiVal < 70 && rsiVal > 40) { confidence += 12; reasons.push(`RSI ${rsiVal.toFixed(1)} (neutral)`); }
    if (bbPos < 0.6)  { confidence += 8; reasons.push("Price below BB midline"); }
    if (momentum > 0) { confidence += 5; reasons.push("Positive momentum"); }
    if (rsiVal > 75)  { confidence -= 20; reasons.push("RSI overbought — caution"); }
  } else {
    direction = "DOWN";
    confidence += Math.min(15, Math.abs(emaDiff) * 50);
    reasons.push(`EMA9(${fast.toFixed(3)}) < EMA21(${slow.toFixed(3)})`);
    if (rsiVal > 30 && rsiVal < 60) { confidence += 12; reasons.push(`RSI ${rsiVal.toFixed(1)} (neutral)`); }
    if (bbPos > 0.4)  { confidence += 8; reasons.push("Price above BB midline"); }
    if (momentum < 0) { confidence += 5; reasons.push("Negative momentum"); }
    if (rsiVal < 25)  { confidence -= 20; reasons.push("RSI oversold — caution"); }
  }

  confidence = Math.min(95, Math.max(10, confidence));

  return {
    asset, direction, confidence,
    duration: confidence >= 80 ? "30s" : "1m",
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

// ── Internal trade placer ─────────────────────────────────────────────────────
async function placeBotTrade(signal: Signal, walletAddress: string, amount: number): Promise<string> {
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
  const data = await r.json() as { tradeId: string };
  return data.tradeId;
}

// ── Store signal metadata alongside a trade ───────────────────────────────────
async function storeSignal(signal: Signal, tradeId: string) {
  await pool.query(`
    INSERT INTO bot_signals (trade_id, asset, direction, confidence, ema_fast, ema_slow, rsi_value, bb_pos, reason, duration)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  `, [tradeId, signal.asset, signal.direction, signal.confidence,
      signal.emaFast, signal.emaSlow, signal.rsiValue, signal.bbPos,
      signal.reason, signal.duration]);
}

// ── Copy-trade follower execution ─────────────────────────────────────────────
async function executeCopyTrades(signal: Signal) {
  const { rows } = await pool.query<{ follower_address: string; stake_usdt: string }>(
    `SELECT follower_address, stake_usdt FROM bot_followers
     WHERE leader_address = $1 AND active = true`,
    [BOT_ADDRESS]
  );
  await Promise.allSettled(rows.map(async (f: { follower_address: string; stake_usdt: string }) => {
    const stake = parseFloat(f.stake_usdt);
    try {
      await placeBotTrade(signal, f.follower_address, stake);
    } catch { /* insufficient balance — skip */ }
  }));
}

// ── Bot trading loop (every 62 s) ─────────────────────────────────────────────
export function startBotLoop() {
  if (botRunning) return;
  botRunning    = true;
  botStartedAt  = new Date();

  async function tick() {
    try {
      const asset  = Math.random() < 0.7 ? "V100" : "V50";
      const signal = generateSignal(asset);
      if (!signal || signal.confidence < 65) return;

      lastSignal = { ...signal, ts: Date.now() };

      const tradeId = await placeBotTrade(signal, BOT_ADDRESS, 5);
      await storeSignal(signal, tradeId);
      await executeCopyTrades(signal);
    } catch { /* continue loop */ }
  }

  void tick();
  setInterval(() => { void tick(); }, 62_000);
}

// ── Price feed poller ─────────────────────────────────────────────────────────
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
  setTimeout(() => {
    void poll();
    setInterval(() => { void poll(); }, 3_000);
  }, 10_000);
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/bot/status", (_req, res) => {
  res.json(getBotStatus());
});

router.get("/bot/signal/:asset", (req, res) => {
  const asset  = req.params["asset"] ?? "V100";
  const signal = generateSignal(asset);
  const history = getPriceHistoryLength(asset);
  res.json(signal
    ? { ...signal, pricePoints: history }
    : { confidence: 0, reason: "Collecting data…", pricePoints: history }
  );
});

// GET /bot/analytics — full session analytics with per-trade reasons
router.get("/bot/analytics", async (req, res) => {
  try {
    const hours = Math.min(24, Math.max(1, parseInt(String(req.query.hours ?? "2"))));

    // Joined trades + signals for the bot
    const { rows: tradeRows } = await pool.query<{
      id: string; asset: string; direction: string; amount_usdt: string;
      payout_usdt: string; status: string; entry_price: string | null;
      exit_price: string | null; opened_at: string; resolved_at: string | null;
      confidence: number | null; ema_fast: number | null; ema_slow: number | null;
      rsi_value: number | null; bb_pos: number | null; reason: string | null; duration: string | null;
    }>(`
      SELECT
        t.id, t.asset, t.direction, t.amount_usdt, t.payout_usdt,
        t.status, t.entry_price, t.exit_price, t.opened_at, t.resolved_at,
        s.confidence, s.ema_fast, s.ema_slow, s.rsi_value, s.bb_pos,
        s.reason, s.duration
      FROM trades t
      LEFT JOIN bot_signals s ON s.trade_id = t.id
      WHERE t.wallet_address = $1
        AND t.opened_at >= NOW() - ($2 || ' hours')::INTERVAL
      ORDER BY t.opened_at DESC
      LIMIT 200
    `, [BOT_ADDRESS, hours]);

    // Session summary
    const wins   = tradeRows.filter(t => t.status === "won").length;
    const losses = tradeRows.filter(t => t.status === "lost").length;
    const open   = tradeRows.filter(t => t.status === "open").length;
    const total  = tradeRows.length;
    const settled = wins + losses;

    let totalPnl = 0;
    for (const t of tradeRows) {
      if (t.status === "won")  totalPnl += parseFloat(t.payout_usdt) - parseFloat(t.amount_usdt);
      if (t.status === "lost") totalPnl -= parseFloat(t.amount_usdt);
    }

    const avgConfidence = tradeRows.filter(t => t.confidence != null).length > 0
      ? tradeRows.reduce((s, t) => s + (t.confidence ?? 0), 0) / tradeRows.filter(t => t.confidence != null).length
      : 0;

    // Per-asset breakdown
    const byAsset: Record<string, { total: number; wins: number; losses: number; winRate: number; pnl: number }> = {};
    for (const t of tradeRows) {
      if (!byAsset[t.asset]) byAsset[t.asset] = { total: 0, wins: 0, losses: 0, winRate: 0, pnl: 0 };
      byAsset[t.asset].total++;
      if (t.status === "won")  { byAsset[t.asset].wins++;   byAsset[t.asset].pnl += parseFloat(t.payout_usdt) - parseFloat(t.amount_usdt); }
      if (t.status === "lost") { byAsset[t.asset].losses++; byAsset[t.asset].pnl -= parseFloat(t.amount_usdt); }
    }
    for (const a of Object.keys(byAsset)) {
      const b = byAsset[a];
      const s = b.wins + b.losses;
      b.winRate = s > 0 ? Math.round((b.wins / s) * 100) : 0;
      b.pnl     = Math.round(b.pnl * 100) / 100;
    }

    // P&L over time (resolved trades only, ascending)
    const resolved = tradeRows
      .filter(t => (t.status === "won" || t.status === "lost") && t.resolved_at)
      .sort((a, b) => new Date(a.resolved_at!).getTime() - new Date(b.resolved_at!).getTime());
    let cum = 0;
    const pnlOverTime = resolved.map(t => {
      const pnl = t.status === "won"
        ? parseFloat(t.payout_usdt) - parseFloat(t.amount_usdt)
        : -parseFloat(t.amount_usdt);
      cum += pnl;
      return { ts: t.resolved_at, tradeId: t.id, pnl: Math.round(pnl * 100) / 100, cumPnl: Math.round(cum * 100) / 100 };
    });

    // Bot balance
    const balRes = await pool.query<{ balance_usdt: string }>(
      "SELECT balance_usdt FROM card_accounts WHERE wallet_address = $1", [BOT_ADDRESS]
    );
    const botBalance = parseFloat(balRes.rows[0]?.balance_usdt ?? "100000");

    // Indicator signal breakdown
    const withSignal = tradeRows.filter(t => t.reason != null);
    const emaAligned = withSignal.filter(t => t.reason?.includes("EMA")).length;
    const rsiFiltered = withSignal.filter(t => t.reason?.includes("RSI")).length;
    const bbFiltered  = withSignal.filter(t => t.reason?.includes("BB")).length;

    res.json({
      session: {
        startedAt:     botStartedAt?.toISOString() ?? null,
        durationMs:    botStartedAt ? Date.now() - botStartedAt.getTime() : 0,
        totalTrades:   total,
        wins,
        losses,
        openTrades:    open,
        winRate:       settled > 0 ? Math.round((wins / settled) * 100) : 0,
        totalPnl:      Math.round(totalPnl * 100) / 100,
        avgConfidence: Math.round(avgConfidence),
        botBalance:    Math.round(botBalance * 100) / 100,
        hours,
      },
      byAsset,
      indicators: {
        emaAligned:   withSignal.length > 0 ? Math.round((emaAligned / withSignal.length) * 100) : 0,
        rsiFiltered:  withSignal.length > 0 ? Math.round((rsiFiltered / withSignal.length) * 100) : 0,
        bbFiltered:   withSignal.length > 0 ? Math.round((bbFiltered / withSignal.length) * 100) : 0,
        avgConfidence: Math.round(avgConfidence),
      },
      trades: tradeRows.map(t => ({
        tradeId:    t.id,
        asset:      t.asset,
        direction:  t.direction,
        amount:     parseFloat(t.amount_usdt),
        payout:     parseFloat(t.payout_usdt),
        status:     t.status,
        entryPrice: t.entry_price ? parseFloat(t.entry_price) : null,
        exitPrice:  t.exit_price  ? parseFloat(t.exit_price)  : null,
        openedAt:   t.opened_at,
        resolvedAt: t.resolved_at,
        pnl: t.status === "won"  ? Math.round((parseFloat(t.payout_usdt) - parseFloat(t.amount_usdt)) * 100) / 100
           : t.status === "lost" ? -parseFloat(t.amount_usdt) : null,
        signal: t.confidence != null ? {
          confidence: t.confidence,
          emaFast:    t.ema_fast,
          emaSlow:    t.ema_slow,
          rsiValue:   t.rsi_value != null ? Math.round(t.rsi_value * 10) / 10 : null,
          bbPos:      t.bb_pos    != null ? Math.round(t.bb_pos * 100) / 100    : null,
          reason:     t.reason,
          duration:   t.duration,
          reasons:    t.reason?.split(" · ") ?? [],
        } : null,
      })),
      pnlOverTime,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Analytics failed" });
  }
});

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

    const leaderboard = rows.map((r, i) => {
      const total = parseInt(r.total);
      const wins  = parseInt(r.wins);
      const isBot = r.wallet_address === BOT_ADDRESS;
      return {
        rank: i + 1, walletAddress: r.wallet_address,
        displayName: isBot ? BOT_NAME : `${r.wallet_address.slice(0, 6)}…${r.wallet_address.slice(-4)}`,
        isBot, total, wins,
        losses:  parseInt(r.losses),
        draws:   parseInt(r.draws),
        winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
        totalPnl: parseFloat(r.total_pnl),
      };
    });

    const hasBot = leaderboard.some(l => l.isBot);
    if (!hasBot) {
      const botRow = await pool.query<{
        total: string; wins: string; losses: string; draws: string; total_pnl: string;
      }>(`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'won')  AS wins,
          COUNT(*) FILTER (WHERE status = 'lost') AS losses,
          COUNT(*) FILTER (WHERE status = 'draw') AS draws,
          COALESCE(SUM(payout_usdt - amount_usdt) FILTER (WHERE status = 'won'), 0)
            - COALESCE(SUM(amount_usdt) FILTER (WHERE status = 'lost'), 0) AS total_pnl
        FROM trades WHERE wallet_address = $1 AND status IN ('won','lost','draw')
      `, [BOT_ADDRESS]);
      const b = botRow.rows[0];
      const total = parseInt(b?.total ?? "0");
      const wins  = parseInt(b?.wins  ?? "0");
      leaderboard.unshift({
        rank: 1, walletAddress: BOT_ADDRESS, displayName: BOT_NAME, isBot: true,
        total, wins, losses: parseInt(b?.losses ?? "0"), draws: parseInt(b?.draws ?? "0"),
        winRate: total > 0 ? Math.round((wins / total) * 100) : 72,
        totalPnl: parseFloat(b?.total_pnl ?? "0"),
      });
    }

    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Leaderboard failed" });
  }
});

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

router.get("/trading/copy-history/:address", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM trades WHERE wallet_address = $1 ORDER BY opened_at DESC LIMIT 30`,
      [req.params.address.toLowerCase()]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Query failed" });
  }
});

export default router;
