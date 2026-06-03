import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "mchain_wallet_key_v1";

let _cached: string | null = null;
let _initialized = false;

export async function initWalletKey(): Promise<void> {
  if (_initialized) return;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      _cached = stored;
    } else {
      const envKey = typeof process !== "undefined" ? process.env.EXPO_PUBLIC_WALLET_KEY : undefined;
      if (envKey) _cached = envKey;
    }
  } catch {
    const envKey = typeof process !== "undefined" ? process.env.EXPO_PUBLIC_WALLET_KEY : undefined;
    if (envKey) _cached = envKey;
  }
  _initialized = true;
}

export function getWalletKey(): string | null {
  return _cached;
}

export async function setWalletKey(key: string): Promise<void> {
  const cleaned = key.trim();
  _cached = cleaned || null;
  if (cleaned) {
    await AsyncStorage.setItem(STORAGE_KEY, cleaned);
  } else {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}

export async function clearWalletKey(): Promise<void> {
  _cached = null;
  await AsyncStorage.removeItem(STORAGE_KEY);
}

void initWalletKey();
