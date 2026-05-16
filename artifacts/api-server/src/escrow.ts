import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bech32 } from "bech32";
import {
  createWalletClient, http, parseUnits,
  type WalletClient, type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ── Hex helpers ───────────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < h.length; i += 2) bytes[i / 2] = parseInt(h.substring(i, i + 2), 16);
  return bytes;
}

// ── Address conversion ────────────────────────────────────────────────────────

export function mxcAddressToEthAddress(mxcAddress: string): `0x${string}` {
  const decoded = bech32.decode(mxcAddress);
  const bytes = Uint8Array.from(bech32.fromWords(decoded.words));
  return `0x${bytesToHex(bytes)}`;
}

export function privateKeyToEthAddress(privateKeyHex: string): `0x${string}` {
  const privBytes = hexToBytes(privateKeyHex);
  const pubKeyBytes = secp256k1.getPublicKey(privBytes, true);
  const pubKeyHash = keccak_256(pubKeyBytes);
  return `0x${bytesToHex(pubKeyHash.slice(-20))}`;
}

// ── Chain config ──────────────────────────────────────────────────────────────

const CHAIN_RPC_URL = "https://chain.mvault.pro/api/rpc";
const CHAIN_URL     = "https://chain.mvault.pro/api";

const mchain: Chain = {
  id: 1888,
  name: "Mchain",
  nativeCurrency: { name: "MC", symbol: "MC", decimals: 18 },
  rpcUrls: { default: { http: [CHAIN_RPC_URL] } },
};

// ── USDT config ───────────────────────────────────────────────────────────────

function getUsdtContract(): `0x${string}` {
  const addr = process.env["USDT_CONTRACT_ADDRESS"];
  if (!addr) throw new Error("USDT_CONTRACT_ADDRESS is not configured");
  return addr as `0x${string}`;
}

const USDT_DECIMALS = 6;

const USDT_ABI = [
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to",     type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

// ── MC native transaction signing ─────────────────────────────────────────────

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
  const sig = secp256k1.sign(hash, hexToBytes(privateKeyHex));
  return bytesToHex(sig.toCompactRawBytes());
}

// ── Amount conversion ─────────────────────────────────────────────────────────

export function mcToWei(mc: string): string {
  const [intPart, decPart = ""] = mc.trim().split(".");
  const paddedDec = decPart.padEnd(18, "0").slice(0, 18);
  return BigInt((intPart || "0") + paddedDec).toString();
}

// ── Chain API helpers ─────────────────────────────────────────────────────────

export async function getChainAccount(address: string): Promise<{ nonce: number; balance: string }> {
  const res = await fetch(`${CHAIN_URL}/accounts/${encodeURIComponent(address)}`);
  if (!res.ok) throw new Error(`Failed to fetch account ${address}: ${res.status}`);
  const data = await res.json() as { nonce?: number; balance?: string };
  return { nonce: data.nonce ?? 0, balance: data.balance ?? "0" };
}

// ── Broadcast MC (native token) ───────────────────────────────────────────────

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
    const text = await res.text().catch(() => "unknown error");
    throw new Error(`MC broadcast failed: ${text}`);
  }

  const data = await res.json() as { txHash?: string; hash?: string };
  const txHash = data.txHash ?? data.hash;
  if (!txHash) throw new Error("No txHash in chain response");
  return txHash;
}

// ── Broadcast USDT (ERC-20 via eth_sendRawTransaction) ───────────────────────

export async function broadcastUsdtTransaction(
  escrowPrivateKeyHex: string,
  buyerMxcAddress: string,
  usdtAmount: string,   // human-readable, e.g. "10.500000"
): Promise<string> {
  const privKey = `0x${escrowPrivateKeyHex}` as `0x${string}`;
  const account = privateKeyToAccount(privKey);
  const buyerEthAddress = mxcAddressToEthAddress(buyerMxcAddress);
  const amountUnits = parseUnits(usdtAmount, USDT_DECIMALS);

  const client: WalletClient = createWalletClient({
    account,
    chain: mchain,
    transport: http(CHAIN_RPC_URL),
  });

  const txHash = await client.writeContract({
    address: getUsdtContract(),
    abi: USDT_ABI,
    functionName: "transfer",
    args: [buyerEthAddress, amountUnits],
  });

  return txHash;
}

// ── Escrow wallet env helpers ─────────────────────────────────────────────────

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
