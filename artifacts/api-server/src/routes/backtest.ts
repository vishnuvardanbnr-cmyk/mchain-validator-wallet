import { Router } from "express";
import { pool } from "@workspace/db";
import { startBacktest, ensureBacktestTable } from "../lib/backtest";

const router = Router();

router.post("/bot/backtest/run", async (req, res) => {
  try {
    const months = Math.min(12, Math.max(1, parseInt((req.body as { months?: string }).months ?? "6")));
    const runId  = await startBacktest(months);
    res.json({ runId, message: `Backtest started for ${months} months` });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/bot/backtest", async (_req, res) => {
  try {
    await ensureBacktestTable();
    const { rows } = await pool.query(
      `SELECT id, status, months, progress, message, created_at, finished_at
       FROM backtest_runs ORDER BY created_at DESC LIMIT 10`
    );
    res.json(rows.map(r => ({
      id: r.id, status: r.status, months: r.months,
      progress: r.progress, message: r.message,
      createdAt: r.created_at, finishedAt: r.finished_at,
    })));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/bot/backtest/latest", async (_req, res) => {
  try {
    await ensureBacktestTable();
    const { rows } = await pool.query(
      `SELECT * FROM backtest_runs ORDER BY created_at DESC LIMIT 1`
    );
    if (!rows[0]) return res.json(null);
    const r = rows[0];
    res.json({
      id: r.id, status: r.status, months: r.months,
      progress: r.progress, message: r.message,
      results: r.results,
      createdAt: r.created_at, finishedAt: r.finished_at,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/bot/backtest/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM backtest_runs WHERE id=$1", [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    const r = rows[0];
    res.json({
      id: r.id, status: r.status, months: r.months,
      progress: r.progress, message: r.message,
      results: r.results,
      createdAt: r.created_at, finishedAt: r.finished_at,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export { ensureBacktestTable };
export default router;
