import AsyncStorage from "@react-native-async-storage/async-storage";

export const DEFAULT_NODE_URL = "https://chain.mvault.pro/api";

const STORAGE_KEY = "mchain_node_url_v1";

let _cached: string = DEFAULT_NODE_URL;
let _initialized = false;

export async function initNodeUrl(): Promise<void> {
  if (_initialized) return;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) _cached = stored;
  } catch {
    // fall back to default
  }
  _initialized = true;
}

export function getNodeUrl(): string {
  return _cached;
}

export function isDefaultNode(): boolean {
  return _cached === DEFAULT_NODE_URL;
}

export async function setNodeUrl(url: string): Promise<void> {
  const cleaned = url.trim().replace(/\/$/, "");
  _cached = cleaned;
  await AsyncStorage.setItem(STORAGE_KEY, cleaned);
}

export async function resetNodeUrl(): Promise<void> {
  _cached = DEFAULT_NODE_URL;
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export async function testNodeConnection(url: string): Promise<number> {
  const cleaned = url.trim().replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  const start = Date.now();
  try {
    const res = await fetch(`${cleaned}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Date.now() - start;
  } finally {
    clearTimeout(timer);
  }
}

// Auto-initialize on first import so getNodeUrl() is ready before any API call
void initNodeUrl();
