import { Router } from "express";
import { recoverMessageAddress } from "viem";

const router = Router();

const CHAIN_BASE = "https://node.mymchain.com/api";

// ── Build the canonical message that the client must sign ─────────────────────
function buildTransferMessage(params: {
  fromAddress: string;
  toAddress: string;
  amount: string;
  nonce: number;
}): string {
  return [
    "MChain Transfer",
    `from: ${params.fromAddress}`,
    `to: ${params.toAddress}`,
    `amount: ${params.amount}`,
    `nonce: ${params.nonce}`,
  ].join("\n");
}

// ── POST /transactions ────────────────────────────────────────────────────────
router.post("/transactions", async (req, res): Promise<void> => {
  const { fromAddress, toAddress, amount, nonce, signature } = req.body as {
    fromAddress?: string;
    toAddress?: string;
    amount?: string;
    nonce?: number;
    signature?: string;
  };

  // ── Validate required fields ──────────────────────────────────────────────
  if (!fromAddress || !toAddress || !amount || nonce === undefined || !signature) {
    res.status(400).json({
      error: "Missing required fields: fromAddress, toAddress, amount, nonce, signature",
    });
    return;
  }

  if (typeof nonce !== "number" || !Number.isInteger(nonce) || nonce < 0) {
    res.status(400).json({ error: "nonce must be a non-negative integer" });
    return;
  }

  if (!/^\d+$/.test(amount)) {
    res.status(400).json({ error: "amount must be a numeric string (in base units)" });
    return;
  }

  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    res.status(400).json({ error: "signature must be a valid 65-byte hex string (0x...)" });
    return;
  }

  // ── Verify signature ──────────────────────────────────────────────────────
  try {
    const message = buildTransferMessage({ fromAddress, toAddress, amount, nonce });

    const recovered = await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    });

    if (recovered.toLowerCase() !== fromAddress.toLowerCase()) {
      req.log.warn({ recovered, fromAddress }, "signature mismatch");
      res.status(401).json({
        error: "Signature verification failed — recovered address does not match sender",
        recovered,
      });
      return;
    }
  } catch (err) {
    req.log.error({ err }, "signature recovery failed");
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  // ── Forward to chain node ─────────────────────────────────────────────────
  try {
    const upstream = await fetch(`${CHAIN_BASE}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ fromAddress, toAddress, amount, nonce, signature }),
      signal: AbortSignal.timeout(15_000),
    });

    const text = await upstream.text();
    req.log.info({ status: upstream.status, fromAddress, toAddress, amount }, "transaction forwarded");

    res.setHeader("Content-Type", "application/json");
    res.status(upstream.status).send(text);
  } catch (err) {
    req.log.error({ err }, "transaction forward failed");
    res.status(502).json({ error: "Chain node unavailable" });
  }
});

export default router;
