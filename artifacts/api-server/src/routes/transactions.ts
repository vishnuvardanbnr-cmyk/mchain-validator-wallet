import { Router } from "express";
import { recoverMessageAddress } from "viem";
import { bech32 } from "bech32";

const router = Router();

const CHAIN_BASE = "https://node.mymchain.com/api";

// ── Address normalisation ─────────────────────────────────────────────────────
// recoverMessageAddress always returns a 0x ETH hex address.
// fromAddress in the body may arrive as either mxc1... or 0x...
// We normalise to 0x for comparison only; the message is built with the raw string.
function mxcToEth(addr: string): string {
  if (!addr.startsWith("mxc1")) return addr.toLowerCase();
  try {
    const { words } = bech32.decode(addr);
    const bytes = Uint8Array.from(bech32.fromWords(words));
    return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return addr.toLowerCase();
  }
}

// ── Build the canonical message that the client must sign ─────────────────────
// • toAddress: use the exact string from the body; if absent/empty, use "null"
// • fromAddress: use the exact string from the body (mxc1... or 0x...) — do NOT convert
function buildTransferMessage(params: {
  fromAddress: string;
  toAddress: string | null | undefined;
  amount: string;
  nonce: number;
}): string {
  return [
    "MChain Transfer",
    `from: ${params.fromAddress}`,
    `to: ${params.toAddress || "null"}`,
    `amount: ${params.amount}`,
    `nonce: ${params.nonce}`,
  ].join("\n");
}

// ── POST /transactions ────────────────────────────────────────────────────────
router.post("/transactions", async (req, res): Promise<void> => {
  const { fromAddress, toAddress, amount, nonce, signature, data, txType } = req.body as {
    fromAddress?: string;
    toAddress?: string;
    amount?: string;
    nonce?: number;
    signature?: string;
    data?: string;
    txType?: string;
  };

  // ── Validate required fields ──────────────────────────────────────────────
  // toAddress is optional (absent for contract deploys) — use "null" in message when missing
  if (!fromAddress || !amount || nonce === undefined || !signature) {
    res.status(400).json({
      error: "Missing required fields: fromAddress, amount, nonce, signature",
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
  // The message is built using the exact address strings from the body.
  // Comparison is done on 0x-normalised addresses so mxc1... senders work too.
  try {
    const message = buildTransferMessage({ fromAddress, toAddress, amount, nonce });

    const recovered = await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    });

    const fromNorm = mxcToEth(fromAddress);
    if (recovered.toLowerCase() !== fromNorm.toLowerCase()) {
      req.log.warn({ recovered, fromAddress, fromNorm }, "signature mismatch");
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
      body: JSON.stringify({ fromAddress, toAddress: toAddress || null, amount, nonce, signature, ...(data ? { data } : {}), ...(txType ? { txType } : {}) }),
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
