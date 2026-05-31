/**
 * Cross-platform SecureStore shim.
 * • Native (iOS / Android): delegates to expo-secure-store (hardware-backed).
 * • Web (Simulate on Web / PWA): falls back to localStorage with a warning.
 *   Web storage is NOT cryptographically secure; this is only for dev preview.
 */
import { Platform } from "react-native";

let _native: typeof import("expo-secure-store") | null = null;

async function getNative() {
  if (_native) return _native;
  _native = await import("expo-secure-store");
  return _native;
}

export async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  const ss = await getNative();
  return ss.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
    return;
  }
  const ss = await getNative();
  return ss.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    return;
  }
  const ss = await getNative();
  return ss.deleteItemAsync(key);
}
