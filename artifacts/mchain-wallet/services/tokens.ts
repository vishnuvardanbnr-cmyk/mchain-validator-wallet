import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

const STORAGE_KEY = "mchain_custom_tokens_v1";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CustomToken {
  id: string;
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
  verified: boolean;
  addedAt: string;
}

export interface VerifiedToken {
  symbol: string;
  name: string;
  decimals: number;
  logoUrl: string;
  coingeckoId: string;
  contractAddress?: string;
}

// ─── Verified token registry ──────────────────────────────────────────────────
export const VERIFIED_TOKENS: VerifiedToken[] = [
  {
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    logoUrl: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
    coingeckoId: "tether",
    contractAddress: "0x07daf7bda0aaea88e910879b2cd6ec9ecdc87238",
  },
];

// ─── ABI decode helpers ───────────────────────────────────────────────────────

function decodeAbiString(hex: string): string {
  try {
    const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
    if (raw.length < 128) return "";
    const len = parseInt(raw.slice(64, 128), 16);
    if (len === 0 || len > 256) return "";
    const bytes = raw.slice(128, 128 + len * 2);
    let str = "";
    for (let i = 0; i < bytes.length; i += 2) {
      str += String.fromCharCode(parseInt(bytes.slice(i, i + 2), 16));
    }
    return str.replace(/\0/g, "").trim();
  } catch {
    return "";
  }
}

function decodeAbiUint256(hex: string): bigint {
  try {
    return BigInt(hex.startsWith("0x") ? hex : "0x" + hex);
  } catch {
    return 0n;
  }
}

function decodeAbiUint8(hex: string): number {
  try {
    const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
    return parseInt(raw.slice(-2), 16);
  } catch {
    return 18;
  }
}

function encodeBalanceOfCall(ethAddress: string): string {
  const addr = ethAddress.toLowerCase().replace(/^0x/, "").padStart(40, "0");
  return `0x70a08231${"0".repeat(24)}${addr}`;
}

// ─── Metadata fetch ───────────────────────────────────────────────────────────

export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  userBalance?: string;
}

export async function fetchTokenMetadata(
  contractAddress: string,
  userEthAddress?: string
): Promise<TokenMetadata> {
  const [nameRes, symbolRes, decimalsRes, supplyRes] = await Promise.all([
    api.rpcCall(contractAddress, "0x06fdde03").catch(() => ({ result: "0x" })),
    api.rpcCall(contractAddress, "0x95d89b41").catch(() => ({ result: "0x" })),
    api.rpcCall(contractAddress, "0x313ce567").catch(() => ({ result: "0x" })),
    api.rpcCall(contractAddress, "0x18160ddd").catch(() => ({ result: "0x" })),
  ]);

  const name = decodeAbiString(nameRes.result ?? "0x");
  const symbol = decodeAbiString(symbolRes.result ?? "0x");
  const decimals = decodeAbiUint8(decimalsRes.result ?? "0x");
  const supplyRaw = decodeAbiUint256(supplyRes.result ?? "0x");

  if (!name && !symbol) {
    throw new Error("Address is not a valid ERC-20 token contract");
  }

  const divisor = decimals > 0 ? 10 ** decimals : 1;
  const totalSupply = (Number(supplyRaw) / divisor).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });

  let userBalance: string | undefined;
  if (userEthAddress) {
    try {
      const balRes = await api.rpcCall(contractAddress, encodeBalanceOfCall(userEthAddress));
      const rawBal = decodeAbiUint256(balRes.result ?? "0x");
      userBalance = (Number(rawBal) / divisor).toLocaleString("en-US", {
        maximumFractionDigits: 6,
      });
    } catch {
      userBalance = undefined;
    }
  }

  return { name, symbol, decimals, totalSupply, userBalance };
}

export async function fetchTokenBalance(
  contractAddress: string,
  userEthAddress: string,
  decimals: number
): Promise<string> {
  const result = await api.rpcCall(contractAddress, encodeBalanceOfCall(userEthAddress));
  const raw = decodeAbiUint256(result.result ?? "0x");
  if (raw === 0n) return "0";
  const divisor = decimals > 0 ? 10 ** decimals : 1;
  return (Number(raw) / divisor).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

export async function getCustomTokens(): Promise<CustomToken[]> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    return json ? (JSON.parse(json) as CustomToken[]) : [];
  } catch {
    return [];
  }
}

export async function addCustomToken(
  token: Omit<CustomToken, "id" | "addedAt">
): Promise<CustomToken> {
  const tokens = await getCustomTokens();
  const entry: CustomToken = {
    ...token,
    id: token.contractAddress.toLowerCase(),
    addedAt: new Date().toISOString(),
  };
  const updated = [...tokens.filter((t) => t.id !== entry.id), entry];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return entry;
}

export async function removeCustomToken(contractAddress: string): Promise<void> {
  const tokens = await getCustomTokens();
  const updated = tokens.filter((t) => t.id !== contractAddress.toLowerCase());
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
