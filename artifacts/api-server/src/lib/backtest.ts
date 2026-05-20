import WebSocket from "ws";
import { pool } from "@workspace/db";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Candle {
  epoch: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MartingaleStat {
  grossPnl: number;
  maxDrawdown: number;
  maxStakeUsed: number;
  longestLossStreak: number;
  monthly: MonthlyStat[];
  equity: EquityPoint[];
}

export interface EnhancedStat {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  grossPnl: number;
  maxDrawdown: number;
  maxStakeUsed: number;   // paroli max
  longestLossStreak: number;
  monthly: MonthlyStat[];
  equity: EquityPoint[];
}

export interface AssetBacktestResult {
  asset: string;
  totalCandles: number;
  signalsFired: number;
  newsFiltered: number;
  spikeFiltered: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  grossPnl: number;
  maxDrawdown: number;
  byHour: HourStat[];
  byConfidence: ConfStat[];
  monthly: MonthlyStat[];
  equity: EquityPoint[];
  martingale: MartingaleStat;
  enhanced: EnhancedStat;
}

interface HourStat   { hour: number; trades: number; wins: number; winRate: number; }
interface ConfStat   { range: string; trades: number; wins: number; winRate: number; }
interface MonthlyStat{ month: string; trades: number; wins: number; losses: number; pnl: number; }
interface EquityPoint{ epoch: number; balance: number; }

// ── News / high-impact event windows (UTC minutes since midnight) ─────────────
// Covers NFP, CPI, PPI, Retail Sales (13:30 UTC), ECB (12:45 UTC), BOE (12:00 UTC)
const NEWS_WINDOWS: Array<[number, number]> = [
  [13 * 60 + 20, 14 * 60 + 10],
  [12 * 60 + 40, 13 * 60 +  5],
  [11 * 60 + 55, 12 * 60 + 25],
  [ 6 * 60 + 55,  7 * 60 + 15],
  [20 * 60 + 55, 21 * 60 + 15],
];

function isNewsTime(epochSec: number): boolean {
  const d = new Date(epochSec * 1000);
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return NEWS_WINDOWS.some(([s, e]) => mins >= s && mins <= e);
}

function isVolatilitySpike(candles: Candle[], i: number): boolean {
  const lookback = 20;
  if (i < lookback + 3) return false;
  const ranges  = candles.slice(i - lookback, i).map(c => c.high - c.low);
  const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  if (avgRange === 0) return false;
  for (let j = Math.max(0, i - 3); j <= Math.min(candles.length - 1, i + 3); j++) {
    if ((candles[j].high - candles[j].low) > avgRange * 3) return true;
  }
  return false;
}

// ── Deriv WS helpers ──────────────────────────────────────────────────────────
// ticks_history uses the old public Deriv WS (ws.derivws.com) with a numeric
// app_id — completely separate from the newer REST trading API.
const DERIV_LEGACY_WS = "wss://ws.derivws.com/websockets/v3?app_id=1089";

function fetchCandlePage(symbol: string, endEpoch: number): Promise<Candle[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(DERIV_LEGACY_WS);
    const timer = setTimeout(() => { ws.terminate(); reject(new Error("WS timeout")); }, 35000);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        ticks_history: symbol,
        style: "candles",
        granularity: 300,
        count: 5000,
        end: endEpoch,
        req_id: 1,
      }));
    });

    ws.on("message", (data) => {
      clearTimeout(timer);
      ws.terminate();
      try {
        const msg = JSON.parse(data.toString()) as {
          error?: { message: string };
          candles?: Array<{ epoch: number; open: string; high: string; low: string; close: string }>;
        };
        if (msg.error) { reject(new Error(msg.error.message)); return; }
        const candles: Candle[] = (msg.candles ?? []).map(c => ({
          epoch: c.epoch,
          open:  parseFloat(c.open),
          high:  parseFloat(c.high),
          low:   parseFloat(c.low),
          close: parseFloat(c.close),
        }));
        resolve(candles);
      } catch (e) { reject(e); }
    });

    ws.on("error", e => { clearTimeout(timer); reject(e); });
  });
}

async function fetchAllCandles(symbol: string, months: number): Promise<Candle[]> {
  const cutoffEpoch = Math.floor(Date.now() / 1000) - months * 30 * 24 * 3600;
  let endEpoch = Math.floor(Date.now() / 1000);
  const pages: Candle[][] = [];
  const MAX_ITER = 25;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const page = await fetchCandlePage(symbol, endEpoch);
    if (page.length === 0) break;
    pages.unshift(page);
    const earliest = page[0].epoch;
    if (earliest <= cutoffEpoch) break;
    endEpoch = earliest - 1;
    await new Promise(r => setTimeout(r, 600));
  }

  const all = pages.flat().filter(c => c.epoch >= cutoffEpoch);
  all.sort((a, b) => a.epoch - b.epoch);
  return all;
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

// ── Legacy signal (Standard strategy — kept for comparison) ───────────────────
function computeSignal(prices: number[]): { direction: "UP" | "DOWN"; confidence: number } | null {
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

  if (trendUp) {
    direction = "UP";
    confidence += Math.min(15, Math.abs(emaDiff) * 50);
    if (rsiVal < 70 && rsiVal > 40) confidence += 12;
    if (bbPos < 0.6)  confidence += 8;
    if (momentum > 0) confidence += 5;
    if (rsiVal > 75)  confidence -= 20;
  } else {
    direction = "DOWN";
    confidence += Math.min(15, Math.abs(emaDiff) * 50);
    if (rsiVal > 30 && rsiVal < 60) confidence += 12;
    if (bbPos > 0.4)  confidence += 8;
    if (momentum < 0) confidence += 5;
    if (rsiVal < 25)  confidence -= 20;
  }

  confidence = Math.min(95, Math.max(10, confidence));
  return { direction, confidence };
}

// ── Enhanced signal (EMA triple-stack + tight RSI + candle confirmation) ──────
// Hard gates — ALL must pass or signal is skipped:
//   1. EMA9 > EMA21 > EMA50 (UP) or EMA9 < EMA21 < EMA50 (DOWN) — trend alignment
//   2. |EMA9 − EMA50| / EMA50 > 0.05% — trend must be strong, not noise
//   3. RSI 38–62 — avoid overbought/oversold traps
//   4. Last candle closes in signal direction — candle-body confirmation
// Paroli staking: $5 → $10 → $20 after consecutive wins, reset on any loss
function computeEnhancedSignal(
  prices: number[],
  lastCandleBullish: boolean,
): { direction: "UP" | "DOWN"; confidence: number } | null {
  if (prices.length < 55) return null;

  const fast = ema(prices, 9);
  const mid  = ema(prices, 21);
  const slow = ema(prices, 50);

  // Gate 1: strict triple-stack alignment
  const stackUp   = fast > mid && mid > slow;
  const stackDown = fast < mid && mid < slow;
  if (!stackUp && !stackDown) return null;

  const direction: "UP" | "DOWN" = stackUp ? "UP" : "DOWN";

  // Gate 2: minimum trend divergence (eliminates borderline crossovers)
  const divergencePct = Math.abs(fast - slow) / slow * 100;
  if (divergencePct < 0.05) return null;

  // Gate 3: tight RSI zone — no extremes
  const rsiVal = rsi(prices);
  if (rsiVal < 38 || rsiVal > 62) return null;

  // Gate 4: last candle must close in signal direction
  if (direction === "UP"   && !lastCandleBullish) return null;
  if (direction === "DOWN" &&  lastCandleBullish) return null;

  // Confidence — base 65 (already heavily filtered)
  let confidence = 65;

  // EMA spread strength
  confidence += Math.min(18, divergencePct * 180);

  // RSI sweet spot (50 ± 8)
  if (rsiVal >= 42 && rsiVal <= 58) confidence += 10;

  // BB support
  const bbPos = bollingerPosition(prices);
  if (direction === "UP"   && bbPos < 0.5) confidence += 7;
  if (direction === "DOWN" && bbPos > 0.5) confidence += 7;

  confidence = Math.min(95, Math.max(65, confidence));
  return { direction, confidence };
}

// ── Per-asset backtest (standard + martingale + enhanced/paroli in one pass) ──
function runAssetBacktest(candles: Candle[], asset: string): AssetBacktestResult {
  const BASE_STAKE   = 5;
  const MAX_STAKE    = 640;
  const PAYOUT_RATIO = 1.85;
  const THRESHOLD    = 75;
  const WINDOW       = 200;

  // ── Standard state ─────────────────────────────────────────────────────────
  let signalsFired = 0, newsFiltered = 0, spikeFiltered = 0;
  let wins = 0, losses = 0, balance = 0, peak = 0, maxDrawdown = 0;
  const hourMap:  Record<number, { wins: number; losses: number }> = {};
  const confMap:  Record<string, { wins: number; losses: number }> = {
    "75–79": { wins: 0, losses: 0 },
    "80–84": { wins: 0, losses: 0 },
    "85–89": { wins: 0, losses: 0 },
    "90+":   { wins: 0, losses: 0 },
  };
  const monthMap: Record<string, { wins: number; losses: number; pnl: number }> = {};
  const equity:   EquityPoint[] = [];

  // ── Martingale state ───────────────────────────────────────────────────────
  let mgBalance = 0, mgPeak = 0, mgMaxDD = 0;
  let mgStake = BASE_STAKE, mgStreak = 0, mgMaxStreak = 0, mgMaxStakeUsed = BASE_STAKE;
  const mgMonthMap: Record<string, { wins: number; losses: number; pnl: number }> = {};
  const mgEquity:   EquityPoint[] = [];

  // ── Enhanced + Paroli state ────────────────────────────────────────────────
  // Paroli: 3-step positive progression  $5 → $10 → $20, reset on loss or after step 3 win
  const PAROLI_STEPS = [5, 10, 20];
  let enWins = 0, enLosses = 0, enBalance = 0, enPeak = 0, enMaxDD = 0;
  let enParoliStep = 0, enMaxStakeUsed = 5, enLossStreak = 0, enMaxLossStreak = 0;
  const enMonthMap: Record<string, { wins: number; losses: number; pnl: number }> = {};
  const enEquity:   EquityPoint[] = [];

  for (let i = 55; i < candles.length - 1; i++) {
    const c    = candles[i];
    const next = candles[i + 1];

    if (isNewsTime(c.epoch))           { newsFiltered++;  continue; }
    if (isVolatilitySpike(candles, i)) { spikeFiltered++; continue; }

    const window = candles.slice(Math.max(0, i - WINDOW), i + 1).map(x => x.close);
    const lastBullish = c.close > c.open;

    // ── Standard signal ───────────────────────────────────────────────────────
    const sig = computeSignal(window);
    if (sig && sig.confidence >= THRESHOLD) {
      signalsFired++;
      const won    = sig.direction === "UP" ? next.close > next.open : next.close < next.open;
      const stdPnl = won ? BASE_STAKE * (PAYOUT_RATIO - 1) : -BASE_STAKE;

      balance += stdPnl;
      if (won) wins++; else losses++;
      if (balance > peak) peak = balance;
      const dd = peak - balance;
      if (dd > maxDrawdown) maxDrawdown = dd;

      const hour = new Date(c.epoch * 1000).getUTCHours();
      if (!hourMap[hour]) hourMap[hour] = { wins: 0, losses: 0 };
      if (won) hourMap[hour].wins++; else hourMap[hour].losses++;

      const ck = sig.confidence >= 90 ? "90+" : sig.confidence >= 85 ? "85–89" : sig.confidence >= 80 ? "80–84" : "75–79";
      if (won) confMap[ck].wins++; else confMap[ck].losses++;

      const dObj = new Date(c.epoch * 1000);
      const mk   = `${dObj.getUTCFullYear()}-${String(dObj.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!monthMap[mk]) monthMap[mk] = { wins: 0, losses: 0, pnl: 0 };
      monthMap[mk].pnl += stdPnl;
      if (won) monthMap[mk].wins++; else monthMap[mk].losses++;

      const total = wins + losses;
      if (total % 10 === 0) equity.push({ epoch: c.epoch, balance: Math.round(balance * 100) / 100 });

      // ── Martingale (same signal, different stake) ──────────────────────────
      if (mgStake > mgMaxStakeUsed) mgMaxStakeUsed = mgStake;
      const mgPnl = won ? mgStake * (PAYOUT_RATIO - 1) : -mgStake;
      mgBalance += mgPnl;

      const mk2 = `${new Date(c.epoch * 1000).getUTCFullYear()}-${String(new Date(c.epoch * 1000).getUTCMonth() + 1).padStart(2, "0")}`;
      if (!mgMonthMap[mk2]) mgMonthMap[mk2] = { wins: 0, losses: 0, pnl: 0 };
      mgMonthMap[mk2].pnl += mgPnl;
      if (won) mgMonthMap[mk2].wins++; else mgMonthMap[mk2].losses++;

      if (won) { mgStake = BASE_STAKE; mgStreak = 0; }
      else {
        mgStreak++;
        if (mgStreak > mgMaxStreak) mgMaxStreak = mgStreak;
        mgStake = Math.min(mgStake * 2, MAX_STAKE);
      }
      if (mgBalance > mgPeak) mgPeak = mgBalance;
      const mgDD = mgPeak - mgBalance;
      if (mgDD > mgMaxDD) mgMaxDD = mgDD;
      if (total % 10 === 0) mgEquity.push({ epoch: c.epoch, balance: Math.round(mgBalance * 100) / 100 });
    }

    // ── Enhanced signal (independent gate — different filter) ─────────────────
    const eSig = computeEnhancedSignal(window, lastBullish);
    if (eSig) {
      const won   = eSig.direction === "UP" ? next.close > next.open : next.close < next.open;
      const stake = PAROLI_STEPS[Math.min(enParoliStep, PAROLI_STEPS.length - 1)];
      if (stake > enMaxStakeUsed) enMaxStakeUsed = stake;
      const ePnl  = won ? stake * (PAYOUT_RATIO - 1) : -stake;

      enBalance += ePnl;
      if (won) {
        enWins++;
        enLossStreak = 0;
        // advance paroli step (reset after step 2 = $20)
        enParoliStep = enParoliStep >= PAROLI_STEPS.length - 1 ? 0 : enParoliStep + 1;
      } else {
        enLosses++;
        enLossStreak++;
        if (enLossStreak > enMaxLossStreak) enMaxLossStreak = enLossStreak;
        enParoliStep = 0;
      }

      if (enBalance > enPeak) enPeak = enBalance;
      const enDD = enPeak - enBalance;
      if (enDD > enMaxDD) enMaxDD = enDD;

      const dObj = new Date(c.epoch * 1000);
      const mk   = `${dObj.getUTCFullYear()}-${String(dObj.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!enMonthMap[mk]) enMonthMap[mk] = { wins: 0, losses: 0, pnl: 0 };
      enMonthMap[mk].pnl += ePnl;
      if (won) enMonthMap[mk].wins++; else enMonthMap[mk].losses++;

      const enTotal = enWins + enLosses;
      if (enTotal % 10 === 0) enEquity.push({ epoch: c.epoch, balance: Math.round(enBalance * 100) / 100 });
    }
  }

  const totalTrades = wins + losses;
  const enTotal     = enWins + enLosses;

  return {
    asset,
    totalCandles: candles.length,
    signalsFired,
    newsFiltered,
    spikeFiltered,
    trades: totalTrades,
    wins,
    losses,
    winRate: totalTrades > 0 ? Math.round(wins / totalTrades * 100) : 0,
    grossPnl: Math.round(balance * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    byHour: Object.entries(hourMap)
      .map(([h, v]) => ({
        hour: parseInt(h), trades: v.wins + v.losses, wins: v.wins,
        winRate: v.wins + v.losses > 0 ? Math.round(v.wins / (v.wins + v.losses) * 100) : 0,
      }))
      .sort((a, b) => a.hour - b.hour),
    byConfidence: Object.entries(confMap).map(([range, v]) => ({
      range, trades: v.wins + v.losses, wins: v.wins,
      winRate: v.wins + v.losses > 0 ? Math.round(v.wins / (v.wins + v.losses) * 100) : 0,
    })),
    monthly: Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        month, trades: v.wins + v.losses, wins: v.wins, losses: v.losses,
        pnl: Math.round(v.pnl * 100) / 100,
      })),
    equity,
    martingale: {
      grossPnl:          Math.round(mgBalance * 100) / 100,
      maxDrawdown:       Math.round(mgMaxDD * 100) / 100,
      maxStakeUsed:      mgMaxStakeUsed,
      longestLossStreak: mgMaxStreak,
      monthly: Object.entries(mgMonthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({
          month, trades: v.wins + v.losses, wins: v.wins, losses: v.losses,
          pnl: Math.round(v.pnl * 100) / 100,
        })),
      equity: mgEquity,
    },
    enhanced: {
      trades:            enTotal,
      wins:              enWins,
      losses:            enLosses,
      winRate:           enTotal > 0 ? Math.round(enWins / enTotal * 100) : 0,
      grossPnl:          Math.round(enBalance * 100) / 100,
      maxDrawdown:       Math.round(enMaxDD * 100) / 100,
      maxStakeUsed:      enMaxStakeUsed,
      longestLossStreak: enMaxLossStreak,
      monthly: Object.entries(enMonthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({
          month, trades: v.wins + v.losses, wins: v.wins, losses: v.losses,
          pnl: Math.round(v.pnl * 100) / 100,
        })),
      equity: enEquity,
    },
  };
}

// ── DB schema ─────────────────────────────────────────────────────────────────
export async function ensureBacktestTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS backtest_runs (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      status      TEXT NOT NULL DEFAULT 'running',
      months      INT  NOT NULL DEFAULT 6,
      progress    INT  NOT NULL DEFAULT 0,
      message     TEXT,
      results     JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS backtest_runs_created ON backtest_runs(created_at DESC);
  `);
}

// ── Public entry-point ────────────────────────────────────────────────────────
export async function startBacktest(months: number): Promise<string> {
  await ensureBacktestTable();
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO backtest_runs (months) VALUES ($1) RETURNING id", [months]
  );
  const runId = rows[0].id;
  runBacktestJob(runId, months).catch(async err => {
    await pool.query(
      "UPDATE backtest_runs SET status='error', message=$2, finished_at=NOW() WHERE id=$1",
      [runId, String(err)]
    );
  });
  return runId;
}

async function updateProgress(runId: string, progress: number, message: string) {
  await pool.query(
    "UPDATE backtest_runs SET progress=$2, message=$3 WHERE id=$1",
    [runId, progress, message]
  );
}

async function runBacktestJob(runId: string, months: number) {
  const assets = [
    { symbol: "frxXAUUSD", label: "GOLD"   },
    { symbol: "frxEURUSD", label: "EURUSD" },
  ];

  const assetResults: AssetBacktestResult[] = [];

  for (let i = 0; i < assets.length; i++) {
    const { symbol, label } = assets[i];
    await updateProgress(runId, i * 45, `Fetching ${label} historical data…`);

    let candles: Candle[] = [];
    try {
      candles = await fetchAllCandles(symbol, months);
    } catch (err) {
      await updateProgress(runId, i * 45 + 20, `${label} fetch error: ${err}`);
    }

    await updateProgress(runId, i * 45 + 35, `Simulating ${label} (${candles.length} candles)…`);
    assetResults.push(runAssetBacktest(candles, label));
  }

  const combined = {
    trades:       assetResults.reduce((s, r) => s + r.trades, 0),
    wins:         assetResults.reduce((s, r) => s + r.wins, 0),
    losses:       assetResults.reduce((s, r) => s + r.losses, 0),
    grossPnl:     Math.round(assetResults.reduce((s, r) => s + r.grossPnl, 0) * 100) / 100,
    maxDrawdown:  Math.max(...assetResults.map(r => r.maxDrawdown)),
    newsFiltered: assetResults.reduce((s, r) => s + r.newsFiltered, 0),
    spikeFiltered:assetResults.reduce((s, r) => s + r.spikeFiltered, 0),
    signalsFired: assetResults.reduce((s, r) => s + r.signalsFired, 0),
    martingale: {
      grossPnl:          Math.round(assetResults.reduce((s, r) => s + r.martingale.grossPnl, 0) * 100) / 100,
      maxDrawdown:       Math.max(...assetResults.map(r => r.martingale.maxDrawdown)),
      maxStakeUsed:      Math.max(...assetResults.map(r => r.martingale.maxStakeUsed)),
      longestLossStreak: Math.max(...assetResults.map(r => r.martingale.longestLossStreak)),
    },
    enhanced: {
      trades:            assetResults.reduce((s, r) => s + r.enhanced.trades, 0),
      wins:              assetResults.reduce((s, r) => s + r.enhanced.wins, 0),
      losses:            assetResults.reduce((s, r) => s + r.enhanced.losses, 0),
      grossPnl:          Math.round(assetResults.reduce((s, r) => s + r.enhanced.grossPnl, 0) * 100) / 100,
      maxDrawdown:       Math.max(...assetResults.map(r => r.enhanced.maxDrawdown)),
      maxStakeUsed:      Math.max(...assetResults.map(r => r.enhanced.maxStakeUsed)),
      longestLossStreak: Math.max(...assetResults.map(r => r.enhanced.longestLossStreak)),
      winRate:           0, // filled below
    },
  };
  combined.enhanced.winRate = combined.enhanced.trades > 0
    ? Math.round(combined.enhanced.wins / combined.enhanced.trades * 100) : 0;
  const combinedWinRate = combined.trades > 0
    ? Math.round(combined.wins / combined.trades * 100) : 0;

  await pool.query(
    `UPDATE backtest_runs
     SET status='done', progress=100, message='Complete', results=$2, finished_at=NOW()
     WHERE id=$1`,
    [runId, JSON.stringify({ combined: { ...combined, winRate: combinedWinRate }, assets: assetResults })]
  );
}
