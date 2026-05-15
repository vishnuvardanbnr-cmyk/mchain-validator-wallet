import AsyncStorage from "@react-native-async-storage/async-storage";

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
  /** Pre-filled MChain contract address — when set, the token is added in one tap (no manual address entry). */
  contractAddress?: string;
}

// ─── Verified token registry ──────────────────────────────────────────────────
// Set contractAddress once the MChain deployment address is known — the modal
// will then skip the manual entry step and add the token with a single tap.
export const VERIFIED_TOKENS: VerifiedToken[] = [
  {
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    logoUrl: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
    coingeckoId: "tether",
    // contractAddress: "0x...", // TODO: set MChain USDT contract address
  },
];

// ─── Storage helpers ─────────────────────────────────────────────────────────
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
