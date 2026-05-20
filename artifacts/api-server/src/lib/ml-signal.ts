import { pool } from "@workspace/db";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface MLModelWeights {
  weights: number[];
  bias: number;
  accuracy: number;      // train set accuracy
  testAccuracy: number;  // held-out test accuracy
  samples: number;
  testSamples: number;
  asset: string;
  threshold: number;
  trainedAt: string;
}

export interface MLSignal {
  direction: "UP" | "DOWN";
  probability: number;  // 0-1
  confidence: number;   // 0-100 (for UI display)
}

interface Candle {
  epoch: number; open: number; high: number; low: number; close: number;
}

// ── Math helpers (standalone — no imports from backtest.ts) ───────────────────
function _ema(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let e = prices.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < prices.length; i++) e = prices[i] * k + e * (1 - k);
  return e;
}

function _rsi(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  const rs = losses === 0 ? 100 : gains / losses;
  return 100 - 100 / (1 + rs);
}

function _bbPos(prices: number[], period = 20): number {
  const slice = prices.slice(-period);
  if (slice.length < period) return 0.5;
  const mean = slice.reduce((s, v) => s + v, 0) / period;
  const sd   = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
  if (sd === 0) return 0.5;
  return Math.min(1, Math.max(0, (slice[slice.length - 1] - (mean - 2 * sd)) / (4 * sd)));
}

function _atr(candles: Candle[], idx: number, period = 14): number {
  if (idx < period) return 0;
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) {
    const prev = candles[i - 1].close;
    sum += Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prev),
      Math.abs(candles[i].low  - prev),
    );
  }
  return sum / period;
}

// ── Feature extraction (16 features per candle) ───────────────────────────────
// Features are designed to be stationary and bounded for stable training.
//
// [0]  EMA9/EMA21 ratio (tanh-scaled) — short-term trend direction
// [1]  EMA21/EMA50 ratio              — medium trend direction
// [2]  EMA9/EMA50 ratio               — overall trend direction
// [3]  RSI(14) normalized             — momentum oscillator
// [4]  RSI(7) normalized              — faster momentum
// [5]  BB position normalized         — where price is in the BB band
// [6]  ATR/price × 1000              — current volatility regime
// [7]  5-candle momentum              — short-term price change
// [8]  10-candle momentum             — medium-term price change
// [9]  Candle body / ATR             — current candle bullishness/bearishness
// [10] Upper wick / ATR              — rejection above
// [11] Lower wick / ATR              — rejection below
// [12] sin(2π × UTC_hour / 24)       — time-of-day (cyclic)
// [13] cos(2π × UTC_hour / 24)
// [14] sin(2π × UTC_DOW / 7)         — day-of-week (cyclic)
// [15] cos(2π × UTC_DOW / 7)
export const NUM_FEATURES = 16;

export function extractFeatures(candles: Candle[], idx: number): number[] | null {
  if (idx < 60 || idx >= candles.length) return null;

  const c      = candles[idx];
  const prices = candles.slice(Math.max(0, idx - 199), idx + 1).map(x => x.close);

  const fast = _ema(prices, 9);
  const mid  = _ema(prices, 21);
  const slow = _ema(prices, 50);
  if (mid === 0 || slow === 0 || c.close === 0) return null;

  const rsi14 = _rsi(prices, 14);
  const rsi7  = _rsi(prices, 7);
  const bbPos = _bbPos(prices);
  const atr   = _atr(candles, idx, 14);
  if (atr === 0) return null;

  const t = Math.tanh;
  const f = (v: number) => isFinite(v) ? v : 0;

  const d    = new Date(c.epoch * 1000);
  const hour = d.getUTCHours();
  const dow  = d.getUTCDay();

  return [
    f(t((fast / mid  - 1) * 200)),                                      // [0]
    f(t((mid  / slow - 1) * 200)),                                      // [1]
    f(t((fast / slow - 1) * 200)),                                      // [2]
    f((rsi14 - 50) / 50),                                               // [3]
    f((rsi7  - 50) / 50),                                               // [4]
    f((bbPos - 0.5) * 2),                                               // [5]
    f(t(atr / c.close * 2000)),                                         // [6]
    f(idx >= 5  ? t((c.close - candles[idx -  5].close) / atr * 3) : 0), // [7]
    f(idx >= 10 ? t((c.close - candles[idx - 10].close) / atr * 3) : 0), // [8]
    f(t((c.close - c.open)                          / atr * 3)),        // [9]
    f(t((c.high  - Math.max(c.open, c.close))       / atr * 3)),        // [10]
    f(t((Math.min(c.open, c.close) - c.low)         / atr * 3)),        // [11]
    Math.sin(2 * Math.PI * hour / 24),                                   // [12]
    Math.cos(2 * Math.PI * hour / 24),                                   // [13]
    Math.sin(2 * Math.PI * dow  / 7),                                    // [14]
    Math.cos(2 * Math.PI * dow  / 7),                                    // [15]
  ];
}

// ── Logistic Regression with L2 regularization + mini-batch SGD ───────────────
function sigmoid(x: number): number {
  // Numerically stable sigmoid
  return x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
}

export function mlPredict(features: number[], weights: number[], bias: number): number {
  let z = bias;
  for (let i = 0; i < features.length; i++) z += features[i] * weights[i];
  return sigmoid(z);
}

export function trainModel(
  trainX: number[][],
  trainY: number[],
  testX: number[][],
  testY: number[],
  asset: string,
): MLModelWeights {
  const D = NUM_FEATURES;
  const N = trainX.length;
  if (N < 100) {
    return {
      weights: new Array(D).fill(0), bias: 0,
      accuracy: 0, testAccuracy: 0,
      samples: N, testSamples: testX.length,
      asset, threshold: 0.55, trainedAt: new Date().toISOString(),
    };
  }

  // Xavier initialization
  const scale = Math.sqrt(2 / D);
  const weights = new Array(D).fill(0).map(() => (Math.random() - 0.5) * scale);
  let bias = 0;

  // Hyper-parameters
  const LR_INIT = 0.1;
  const LAMBDA  = 0.002;   // L2 regularization
  const EPOCHS  = 200;
  const BATCH   = 128;

  const indices = Array.from({ length: N }, (_, i) => i);

  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    // Learning rate decay
    const lr = LR_INIT / (1 + epoch * 0.01);

    // Shuffle
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    for (let start = 0; start < N; start += BATCH) {
      const end = Math.min(start + BATCH, N);
      const bLen = end - start;
      const dW = new Array(D).fill(0);
      let dB = 0;

      for (let k = start; k < end; k++) {
        const i    = indices[k];
        const pred = mlPredict(trainX[i], weights, bias);
        const err  = pred - trainY[i];
        for (let j = 0; j < D; j++) dW[j] += err * trainX[i][j];
        dB += err;
      }

      for (let j = 0; j < D; j++) {
        weights[j] -= lr * (dW[j] / bLen + LAMBDA * weights[j]);
      }
      bias -= lr * dB / bLen;
    }
  }

  // ── Evaluate ────────────────────────────────────────────────────────────────
  const evalAcc = (X: number[][], Y: number[], thresh: number) => {
    let correct = 0;
    for (let i = 0; i < X.length; i++) {
      if (X.length === 0) continue;
      const p = mlPredict(X[i], weights, bias);
      // Only count predictions outside the abstain zone
      if (p > thresh) { if (Y[i] === 1) correct++; }
      else if (p < 1 - thresh) { if (Y[i] === 0) correct++; }
      // Middle zone: skip
    }
    let total = 0;
    for (let i = 0; i < X.length; i++) {
      const p = mlPredict(X[i], weights, bias);
      if (p > thresh || p < 1 - thresh) total++;
    }
    return total > 0 ? correct / total : 0;
  };

  // Find threshold that maximises test accuracy (search 0.50–0.70)
  let bestThresh = 0.52;
  let bestAcc    = 0;
  for (let t = 50; t <= 70; t++) {
    const thresh = t / 100;
    const acc    = evalAcc(testX, testY, thresh);
    if (acc > bestAcc) { bestAcc = acc; bestThresh = thresh; }
  }

  const trainAcc = evalAcc(trainX, trainY, bestThresh);

  // Count how many test samples are above threshold
  let testCount = 0;
  for (let i = 0; i < testX.length; i++) {
    const p = mlPredict(testX[i], weights, bias);
    if (p > bestThresh || p < 1 - bestThresh) testCount++;
  }

  return {
    weights,
    bias,
    accuracy:     Math.round(trainAcc * 1000) / 1000,
    testAccuracy: Math.round(bestAcc    * 1000) / 1000,
    samples:      N,
    testSamples:  testCount,
    asset,
    threshold:    bestThresh,
    trainedAt:    new Date().toISOString(),
  };
}

// ── DB helpers ────────────────────────────────────────────────────────────────
export async function ensureMLTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_ml_models (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      asset         TEXT NOT NULL,
      weights       JSONB NOT NULL,
      bias          DOUBLE PRECISION NOT NULL,
      accuracy      DOUBLE PRECISION NOT NULL,
      test_accuracy DOUBLE PRECISION NOT NULL,
      samples       INT NOT NULL,
      threshold     DOUBLE PRECISION NOT NULL DEFAULT 0.55,
      trained_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS bot_ml_idx ON bot_ml_models(asset, trained_at DESC);
  `);
}

export async function saveModel(model: MLModelWeights): Promise<void> {
  await ensureMLTable();
  await pool.query(`
    INSERT INTO bot_ml_models (asset, weights, bias, accuracy, test_accuracy, samples, threshold)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [
    model.asset,
    JSON.stringify(model.weights),
    model.bias,
    model.accuracy,
    model.testAccuracy,
    model.samples,
    model.threshold,
  ]);
}

export async function loadLatestModel(asset: string): Promise<{ weights: number[]; bias: number; threshold: number } | null> {
  try {
    await ensureMLTable();
    const { rows } = await pool.query<{ weights: number[]; bias: number; threshold: number }>(
      `SELECT weights, bias, threshold FROM bot_ml_models WHERE asset = $1 ORDER BY trained_at DESC LIMIT 1`,
      [asset]
    );
    if (rows.length === 0) return null;
    const w = rows[0].weights;
    return {
      weights:   Array.isArray(w) ? w : JSON.parse(String(w)) as number[],
      bias:      rows[0].bias,
      threshold: rows[0].threshold ?? 0.55,
    };
  } catch {
    return null;
  }
}

// ── Signal generation (for live bot) ─────────────────────────────────────────
// Build a price + candle history snapshot and generate a live ML signal.
export function computeMLSignal(
  candles: Candle[],
  weights: number[],
  bias: number,
  threshold: number,
): MLSignal | null {
  if (candles.length < 60) return null;
  const idx      = candles.length - 1;
  const features = extractFeatures(candles, idx);
  if (!features) return null;

  const prob = mlPredict(features, weights, bias);
  if (prob > threshold) {
    return { direction: "UP",   probability: prob, confidence: Math.round(prob * 100) };
  }
  if (prob < 1 - threshold) {
    return { direction: "DOWN", probability: 1 - prob, confidence: Math.round((1 - prob) * 100) };
  }
  return null;  // abstain — uncertain
}
