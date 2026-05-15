import { Router } from "express";

const router = Router();

const CHAIN_RPC_URL = "https://chain.mvault.pro/api/rpc";

router.post("/rpc", async (req, res) => {
  const body = req.body as Record<string, unknown>;

  if (!body || body.jsonrpc !== "2.0" || body.method !== "eth_call") {
    res.status(400).json({ error: "Only eth_call JSON-RPC requests are supported" });
    return;
  }

  try {
    const upstream = await fetch(CHAIN_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();

    res.setHeader("Content-Type", "application/json");
    res.status(upstream.ok ? 200 : upstream.status).send(text);
  } catch (err) {
    req.log.error({ err }, "rpc proxy failed");
    res.status(502).json({
      jsonrpc: "2.0",
      id: body.id ?? null,
      error: { code: -32603, message: "Internal error: upstream unavailable" },
    });
  }
});

export default router;
