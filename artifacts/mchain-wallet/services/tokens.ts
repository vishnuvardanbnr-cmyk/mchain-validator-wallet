import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

// ─── Storage key strategy ─────────────────────────────────────────────────────
// Regular wallet:  mchain_tokens_v2_{walletId}
// NFC wallet:      mchain_tokens_nfc_{mxcAddress}
//   → NFC wallets use the card's address so the same token list reappears
//     every time that card is reconnected, regardless of the wallet session ID.
//
// Legacy global key "mchain_custom_tokens_v1" is migrated on first read.

const LEGACY_KEY = "mchain_custom_tokens_v1";

function storageKey(walletId: string, nfcTemporary?: boolean, mxcAddress?: string): string {
  if (nfcTemporary && mxcAddress) return `mchain_tokens_nfc_${mxcAddress}`;
  return `mchain_tokens_v2_${walletId}`;
}

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

// ─── Per-wallet storage helpers ───────────────────────────────────────────────

/**
 * Get tokens for a specific wallet.
 * On first call for a regular wallet, migrates any tokens from the old global key.
 */
export async function getCustomTokens(
  walletId: string,
  nfcTemporary?: boolean,
  mxcAddress?: string
): Promise<CustomToken[]> {
  if (!walletId) return [];
  try {
    const key = storageKey(walletId, nfcTemporary, mxcAddress);
    const json = await AsyncStorage.getItem(key);

    if (json) return JSON.parse(json) as CustomToken[];

    // First time for this regular (non-NFC) wallet — migrate legacy global tokens once
    if (!nfcTemporary) {
      const legacy = await AsyncStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const tokens = JSON.parse(legacy) as CustomToken[];
        if (tokens.length > 0) {
          await AsyncStorage.setItem(key, legacy);
          // Clear legacy key so it only migrates to the first wallet that reads it
          await AsyncStorage.removeItem(LEGACY_KEY);
          return tokens;
        }
      }
    }

    return [];
  } catch {
    return [];
  }
}

export async function addCustomToken(
  token: Omit<CustomToken, "id" | "addedAt">,
  walletId: string,
  nfcTemporary?: boolean,
  mxcAddress?: string
): Promise<CustomToken> {
  const key = storageKey(walletId, nfcTemporary, mxcAddress);
  const tokens = await getCustomTokens(walletId, nfcTemporary, mxcAddress);
  const entry: CustomToken = {
    ...token,
    id: token.contractAddress.toLowerCase(),
    addedAt: new Date().toISOString(),
  };
  const updated = [...tokens.filter((t) => t.id !== entry.id), entry];
  await AsyncStorage.setItem(key, JSON.stringify(updated));
  return entry;
}

export async function removeCustomToken(
  contractAddress: string,
  walletId: string,
  nfcTemporary?: boolean,
  mxcAddress?: string
): Promise<void> {
  const key = storageKey(walletId, nfcTemporary, mxcAddress);
  const tokens = await getCustomTokens(walletId, nfcTemporary, mxcAddress);
  const updated = tokens.filter((t) => t.id !== contractAddress.toLowerCase());
  await AsyncStorage.setItem(key, JSON.stringify(updated));
}
