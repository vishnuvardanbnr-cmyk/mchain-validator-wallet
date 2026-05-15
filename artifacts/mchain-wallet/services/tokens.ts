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
}

// ─── Verified token registry ──────────────────────────────────────────────────
export const VERIFIED_TOKENS: VerifiedToken[] = [
  {
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    logoUrl: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
    coingeckoId: "tether",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logoUrl: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
    coingeckoId: "usd-coin",
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    logoUrl: "https://assets.coingecko.com/coins/images/2518/small/weth.png",
    coingeckoId: "weth",
  },
  {
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    decimals: 8,
    logoUrl: "https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png",
    coingeckoId: "wrapped-bitcoin",
  },
  {
    symbol: "BNB",
    name: "BNB",
    decimals: 18,
    logoUrl: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
    coingeckoId: "binancecoin",
  },
  {
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    logoUrl: "https://assets.coingecko.com/coins/images/9956/small/4943.png",
    coingeckoId: "dai",
  },
  {
    symbol: "MATIC",
    name: "Polygon",
    decimals: 18,
    logoUrl: "https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png",
    coingeckoId: "matic-network",
  },
  {
    symbol: "LINK",
    name: "Chainlink",
    decimals: 18,
    logoUrl: "https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png",
    coingeckoId: "chainlink",
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
