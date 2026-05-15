import { Router } from "express";

const router = Router();

const CHAIN_BASE = "https://chain.mvault.pro/api";

router.all("/chain-proxy/*splat", async (req, res) => {
  const splatParam = req.params["splat" as keyof typeof req.params];
  const subpath = Array.isArray(splatParam)
    ? splatParam.join("/")
    : String(splatParam ?? "").replace(/,/g, "/");

  const search = req.originalUrl.includes("?")
    ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
    : "";
  const upstream = `${CHAIN_BASE}/${subpath}${search}`;

  req.log.info({ upstream, method: req.method }, "chain-proxy →");

  const isWrite = ["POST", "PUT", "PATCH"].includes(req.method.toUpperCase());

  try {
    const upstreamRes = await fetch(upstream, {
      method: req.method,
      headers: {
        Accept: "application/json",
        ...(isWrite ? { "Content-Type": "application/json" } : {}),
      },
      ...(isWrite ? { body: JSON.stringify(req.body) } : {}),
    });

    const text = await upstreamRes.text();
    req.log.info({ upstream, status: upstreamRes.status }, "chain-proxy ←");

    res.setHeader("Content-Type", "application/json");
    res.status(upstreamRes.status).send(text);
  } catch (err) {
    req.log.error({ err, upstream }, "chain-proxy fetch failed");
    res.status(502).json({ error: "upstream unavailable" });
  }
});

export default router;
