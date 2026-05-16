import { Router } from "express";

const router = Router();

const DEFAULT_CHAIN_BASE = "https://chain.mvault.pro/api";

function resolveRpcUrl(req: { headers: Record<string, string | string[] | undefined> }): string {
  const custom = req.headers["x-mchain-node"];
  if (typeof custom === "string" && custom.length > 0) {
    try {
      const u = new URL(custom);
      if (u.protocol === "http:" || u.protocol === "https:") {
        return `${custom.replace(/\/$/, "")}/rpc`;
      }
    } catch {
      // fall through
    }
  }
  return `${DEFAULT_CHAIN_BASE}/rpc`;
}

router.post("/rpc", async (req, res) => {
  const body = req.body as Record<string, unknown>;

  if (!body || body.jsonrpc !== "2.0" || body.method !== "eth_call") {
    res.status(400).json({ error: "Only eth_call JSON-RPC requests are supported" });
    return;
  }

  try {
    const upstream = await fetch(resolveRpcUrl(req), {
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
