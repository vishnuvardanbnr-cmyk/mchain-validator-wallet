import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";

// ── Hex helpers ───────────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ── Transaction signing ───────────────────────────────────────────────────────

export function signTransaction(
  from: string,
  to: string,
  amount: string,
  nonce: number,
  privateKeyHex: string,
): string {
  const message = from + to + amount + String(nonce);
  const msgBytes = new TextEncoder().encode(message);
  const hash = keccak_256(msgBytes);
  const privKeyBytes = hexToBytes(privateKeyHex);
  const sig = secp256k1.sign(hash, privKeyBytes);
  return bytesToHex(sig.toCompactRawBytes());
}

// ── Amount conversion ─────────────────────────────────────────────────────────

export function mcToWei(mc: string): string {
  const trimmed = mc.trim();
  const [intPart, decPart = ""] = trimmed.split(".");
  const paddedDec = decPart.padEnd(18, "0").slice(0, 18);
  const combined = (intPart || "0") + paddedDec;
  return BigInt(combined).toString();
}

// ── Chain API ─────────────────────────────────────────────────────────────────

const CHAIN_URL = process.env["CHAIN_NODE_URL"] ?? "https://chain.mvault.pro/api";

export async function getChainAccount(address: string): Promise<{ nonce: number; balance: string }> {
  const res = await fetch(`${CHAIN_URL}/accounts/${encodeURIComponent(address)}`);
  if (!res.ok) throw new Error(`Failed to fetch account for ${address}: ${res.status}`);
  const data = await res.json() as { nonce?: number; balance?: string };
  return { nonce: data.nonce ?? 0, balance: data.balance ?? "0" };
}

export async function broadcastMcTransaction(
  from: string,
  to: string,
  amountWei: string,
  privateKeyHex: string,
): Promise<string> {
  const { nonce } = await getChainAccount(from);
  const signature = signTransaction(from, to, amountWei, nonce, privateKeyHex);

  const res = await fetch(`${CHAIN_URL}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, amount: amountWei, nonce, signature }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Broadcast failed");
    throw new Error(`Chain broadcast failed: ${text}`);
  }

  const data = await res.json() as { txHash?: string; hash?: string };
  const txHash = data.txHash ?? data.hash;
  if (!txHash) throw new Error("No txHash in response");
  return txHash;
}

// ── Escrow wallet ─────────────────────────────────────────────────────────────

export function getEscrowAddress(): string {
  const addr = process.env["P2P_ESCROW_ADDRESS"];
  if (!addr) throw new Error("P2P_ESCROW_ADDRESS is not configured");
  return addr;
}

export function getEscrowPrivateKey(): string {
  const key = process.env["P2P_ESCROW_PRIVATE_KEY"];
  if (!key) throw new Error("P2P_ESCROW_PRIVATE_KEY is not configured");
  return key;
}

export function isEscrowConfigured(): boolean {
  return !!(process.env["P2P_ESCROW_ADDRESS"] && process.env["P2P_ESCROW_PRIVATE_KEY"]);
}
