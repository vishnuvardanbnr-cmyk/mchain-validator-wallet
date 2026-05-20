import { Router } from "express";
import { pool } from "@workspace/db";
import WebSocket from "ws";

const router = Router();

// ── Deriv config ──────────────────────────────────────────────────────────────
const DERIV_WS_URL = "wss://ws.binaryws.com/websockets/v3";

const ASSET_SYMBOLS: Record<string, string> = {
  BTC:  "cryBTCUSD",
  ETH:  "cryETHUSD",
  GOLD: "frxXAUUSD",
};

const ASSET_LABELS: Record<string, string> = {
  BTC:  "Bitcoin",
  ETH:  "Ethereum",
  GOLD: "Gold",
};

const DURATION_UNIT: Record<string, string> = {
  "1m":  "m",
  "5m":  "m",
  "15m": "m",
  "1h":  "h",
};

const DURATION_VALUE: Record<string, number> = {
  "1m":  1,
  "5m":  5,
  "15m": 15,
  "1h":  1,
};

function getDerivConfig(): { token: string; appId: string } {
  const token = process.env["DERIV_API_TOKEN"];
  const appId = process.env["DERIV_APP_ID"];
  if (!token) throw new Error("DERIV_API_TOKEN is not configured");
  if (!appId) throw new Error("DERIV_APP_ID is not configured");
  return { token, appId };
}

// ── Deriv WebSocket helper ────────────────────────────────────────────────────
async function derivRequest(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { token, appId } = getDerivConfig();
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${DERIV_WS_URL}?app_id=${appId}`);
    const timer = setTimeout(() => { ws.terminate(); reject(new Error("Deriv API timeout")); }, 20000);

    ws.on("open", () => {
      ws.send(JSON.stringify({ authorize: token }));
    });

    ws.on("message", (raw) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.msg_type === "authorize") {
        if (msg.error) {
          clearTimeout(timer); ws.terminate();
          reject(new Error((msg.error as Record<string, unknown>).message as string));
          return;
        }
        ws.send(JSON.stringify(payload));
        return;
      }

      clearTimeout(timer);
      ws.terminate();
      if (msg.error) {
        reject(new Error((msg.error as Record<string, unknown>).message as string));
        return;
      }
      resolve(msg);
    });

    ws.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

// ── In-memory price cache (5 s TTL) ──────────────────────────────────────────
const priceCache = new Map<string, { price: number; ts: number }>();

async function getLivePrice(asset: string): Promise<number> {
  const symbol = ASSET_SYMBOLS[asset];
  if (!symbol) throw new Error(`Unknown asset: ${asset}`);
  const cached = priceCache.get(asset);
  if (cached && Date.now() - cached.ts < 5000) return cached.price;
  const res = await derivRequest({ ticks: symbol });
  const tick = res.tick as Record<string, unknown> | undefined;
  const price = parseFloat(String(tick?.ask ?? 0));
  priceCache.set(asset, { price, ts: Date.now() });
  return price;
}

// ── Table setup ───────────────────────────────────────────────────────────────
export async function ensureTradingTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trades (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_address TEXT NOT NULL,
      asset          TEXT NOT NULL,
      direction      TEXT NOT NULL CHECK (direction IN ('UP','DOWN')),
      amount_usdt    NUMERIC(20,6) NOT NULL,
      payout_usdt    NUMERIC(20,6) NOT NULL,
      duration       TEXT NOT NULL,
      entry_price    NUMERIC(20,6),
      exit_price     NUMERIC(20,6),
      expires_at     TIMESTAMPTZ,
      status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','draw','error')),
      deriv_proposal_id TEXT,
      deriv_contract_id TEXT,
      payout_tx      TEXT,
      opened_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at    TIMESTAMPTZ,
      error_msg      TEXT
    );
    CREATE INDEX IF NOT EXISTS trades_wallet_idx ON trades(wallet_address);
    CREATE INDEX IF NOT EXISTS trades_status_idx ON trades(status);
    CREATE INDEX IF NOT EXISTS trades_expires_idx ON trades(expires_at) WHERE status = 'open';
  `);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getCardBalance(walletAddress: string): Promise<number> {
  const res = await pool.query<{ balance_usdt: string }>(
    "SELECT balance_usdt FROM card_accounts WHERE wallet_address = $1",
    [walletAddress]
  );
  return parseFloat(res.rows[0]?.balance_usdt ?? "0");
}

async function debitCardBalance(walletAddress: string, amount: number): Promise<void> {
  const res = await pool.query(
    `UPDATE card_accounts
     SET balance_usdt = balance_usdt - $1, updated_at = NOW()
     WHERE wallet_address = $2 AND balance_usdt >= $1`,
    [amount, walletAddress]
  );
  if (res.rowCount === 0) throw new Error("Insufficient balance");
}

async function creditCardBalance(walletAddress: string, amount: number): Promise<void> {
  await pool.query(
    `UPDATE card_accounts
     SET balance_usdt = balance_usdt + $1, updated_at = NOW()
     WHERE wallet_address = $2`,
    [amount, walletAddress]
  );
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /trading/prices
router.get("/trading/prices", async (req, res) => {
  try {
    const [btc, eth, gold] = await Promise.all([
      getLivePrice("BTC"),
      getLivePrice("ETH"),
      getLivePrice("GOLD"),
    ]);
    res.json({ BTC: btc, ETH: eth, GOLD: gold });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Price fetch failed" });
  }
});

// POST /trading/proposal  — get a quote before placing a trade
router.post("/trading/proposal", async (req, res) => {
  const { asset, direction, amount, duration } = req.body as {
    asset?: string; direction?: string; amount?: number; duration?: string;
  };

  if (!asset || !ASSET_SYMBOLS[asset]) { res.status(400).json({ error: "Invalid asset" }); return; }
  if (direction !== "UP" && direction !== "DOWN") { res.status(400).json({ error: "direction must be UP or DOWN" }); return; }
  if (!amount || amount < 0.35) { res.status(400).json({ error: "Minimum amount is $0.35" }); return; }
  if (!duration || !DURATION_VALUE[duration]) { res.status(400).json({ error: "Invalid duration" }); return; }

  try {
    const contractType = direction === "UP" ? "CALL" : "PUT";
    const res2 = await derivRequest({
      proposal: 1,
      amount,
      basis: "stake",
      contract_type: contractType,
      currency: "USD",
      duration: DURATION_VALUE[duration],
      duration_unit: DURATION_UNIT[duration],
      symbol: ASSET_SYMBOLS[asset],
    });

    const proposal = res2.proposal as Record<string, unknown>;
    res.json({
      proposalId:    proposal.id,
      payout:        parseFloat(String(proposal.payout)),
      askPrice:      parseFloat(String(proposal.ask_price)),
      spotPrice:     parseFloat(String(proposal.spot)),
      displayValue:  proposal.display_value,
      longCode:      proposal.longcode,
    });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Proposal failed" });
  }
});

// POST /trading/open — place a trade
router.post("/trading/open", async (req, res) => {
  const { walletAddress, asset, direction, amount, duration, proposalId, payout } = req.body as {
    walletAddress?: string; asset?: string; direction?: string;
    amount?: number; duration?: string; proposalId?: string; payout?: number;
  };

  if (!walletAddress) { res.status(400).json({ error: "walletAddress required" }); return; }
  if (!asset || !ASSET_SYMBOLS[asset]) { res.status(400).json({ error: "Invalid asset" }); return; }
  if (direction !== "UP" && direction !== "DOWN") { res.status(400).json({ error: "Invalid direction" }); return; }
  if (!amount || amount < 0.35) { res.status(400).json({ error: "Minimum $0.35" }); return; }
  if (!duration || !DURATION_VALUE[duration]) { res.status(400).json({ error: "Invalid duration" }); return; }
  if (!proposalId) { res.status(400).json({ error: "proposalId required" }); return; }

  const normalizedAddress = walletAddress.toLowerCase();

  try {
    // Check card balance
    const balance = await getCardBalance(normalizedAddress);
    if (balance < amount) {
      res.status(400).json({ error: "Insufficient USDT balance" });
      return;
    }

    // Debit balance before placing trade
    await debitCardBalance(normalizedAddress, amount);

    // Buy contract on Deriv
    let contractId: string | null = null;
    let entryPrice: number | null = null;
    let expiresAt: Date | null = null;
    let finalPayout = payout ?? amount * 1.87;

    try {
      const buyRes = await derivRequest({ buy: proposalId, price: amount });
      const buy = buyRes.buy as Record<string, unknown>;
      contractId   = String(buy.contract_id);
      entryPrice   = parseFloat(String(buy.buy_price));
      const durationMs = (DURATION_VALUE[duration] ?? 1) * (DURATION_UNIT[duration] === "h" ? 3600000 : 60000);
      expiresAt    = new Date(Date.now() + durationMs);
      finalPayout  = parseFloat(String(buy.payout));
    } catch (derivErr) {
      // Refund if Deriv fails
      await creditCardBalance(normalizedAddress, amount);
      throw derivErr;
    }

    // Store trade
    const durationMs = (DURATION_VALUE[duration] ?? 1) * (DURATION_UNIT[duration] === "h" ? 3600000 : 60000);
    const tradeRes = await pool.query<{ id: string }>(
      `INSERT INTO trades
         (wallet_address, asset, direction, amount_usdt, payout_usdt, duration,
          entry_price, expires_at, status, deriv_proposal_id, deriv_contract_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,$10)
       RETURNING id`,
      [
        normalizedAddress, asset, direction, amount, finalPayout,
        duration, entryPrice,
        expiresAt ?? new Date(Date.now() + durationMs),
        proposalId, contractId,
      ]
    );

    res.json({
      tradeId:    tradeRes.rows[0].id,
      asset,
      direction,
      amount,
      payout:     finalPayout,
      entryPrice,
      expiresAt:  expiresAt?.toISOString(),
      status:     "open",
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Trade failed" });
  }
});

// GET /trading/trade/:id — poll trade status, resolve if expired
router.get("/trading/trade/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const tradeRes = await pool.query<{
      id: string; wallet_address: string; asset: string; direction: string;
      amount_usdt: string; payout_usdt: string; duration: string;
      entry_price: string; exit_price: string | null; expires_at: string;
      status: string; deriv_contract_id: string | null; opened_at: string;
      resolved_at: string | null;
    }>("SELECT * FROM trades WHERE id = $1", [id]);

    if (!tradeRes.rows[0]) { res.status(404).json({ error: "Trade not found" }); return; }
    const trade = tradeRes.rows[0];

    // Already resolved
    if (trade.status !== "open") {
      res.json({
        ...trade,
        amount_usdt: parseFloat(trade.amount_usdt),
        payout_usdt: parseFloat(trade.payout_usdt),
        entry_price: trade.entry_price ? parseFloat(trade.entry_price) : null,
        exit_price:  trade.exit_price  ? parseFloat(trade.exit_price)  : null,
      });
      return;
    }

    // Check if expired and has a Deriv contract
    const isExpired = new Date(trade.expires_at) <= new Date();
    if (isExpired && trade.deriv_contract_id) {
      try {
        const contractRes = await derivRequest({
          proposal_open_contract: 1,
          contract_id: parseInt(trade.deriv_contract_id),
        });
        const contract = contractRes.proposal_open_contract as Record<string, unknown>;
        const contractStatus = String(contract.status ?? "");

        if (contractStatus === "sold" || contractStatus === "won" || contractStatus === "lost") {
          const isWon   = contractStatus === "won" || parseFloat(String(contract.profit ?? 0)) > 0;
          const isDraw  = parseFloat(String(contract.profit ?? 0)) === 0 && contractStatus === "sold";
          const outcome = isDraw ? "draw" : isWon ? "won" : "lost";
          const exitPrice = parseFloat(String(contract.exit_tick ?? contract.exit_tick_time ?? trade.entry_price));
          const payoutUsdt = parseFloat(trade.payout_usdt);

          await pool.query(
            `UPDATE trades SET status=$1, exit_price=$2, resolved_at=NOW() WHERE id=$3`,
            [outcome, exitPrice || parseFloat(trade.entry_price), id]
          );

          if (outcome === "won") await creditCardBalance(trade.wallet_address, payoutUsdt);
          if (outcome === "draw") await creditCardBalance(trade.wallet_address, parseFloat(trade.amount_usdt));

          res.json({
            ...trade,
            status:      outcome,
            exit_price:  exitPrice,
            amount_usdt: parseFloat(trade.amount_usdt),
            payout_usdt: payoutUsdt,
            entry_price: parseFloat(trade.entry_price),
            resolved_at: new Date().toISOString(),
          });
          return;
        }
      } catch {
        // Deriv poll failed — return current status and let client retry
      }
    }

    res.json({
      ...trade,
      amount_usdt: parseFloat(trade.amount_usdt),
      payout_usdt: parseFloat(trade.payout_usdt),
      entry_price: trade.entry_price ? parseFloat(trade.entry_price) : null,
      exit_price:  null,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Status check failed" });
  }
});

// GET /trading/history/:address
router.get("/trading/history/:address", async (req, res) => {
  const address = req.params.address.toLowerCase();
  try {
    const result = await pool.query<{
      id: string; asset: string; direction: string; amount_usdt: string;
      payout_usdt: string; duration: string; entry_price: string;
      exit_price: string | null; status: string; opened_at: string; resolved_at: string | null;
    }>(
      `SELECT id, asset, direction, amount_usdt, payout_usdt, duration,
              entry_price, exit_price, status, opened_at, resolved_at
       FROM trades WHERE wallet_address = $1
       ORDER BY opened_at DESC LIMIT 50`,
      [address]
    );
    res.json(result.rows.map(r => ({
      ...r,
      amount_usdt: parseFloat(r.amount_usdt),
      payout_usdt: parseFloat(r.payout_usdt),
      entry_price: r.entry_price ? parseFloat(r.entry_price) : null,
      exit_price:  r.exit_price  ? parseFloat(r.exit_price)  : null,
    })));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "History failed" });
  }
});

// GET /trading/balance/:address — card balance available for trading
router.get("/trading/balance/:address", async (req, res) => {
  const address = req.params.address.toLowerCase();
  try {
    const balance = await getCardBalance(address);
    res.json({ balance });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Balance check failed" });
  }
});

export default router;
