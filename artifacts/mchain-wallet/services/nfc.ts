import { Platform } from "react-native";
import { pbkdf2 } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha256";
import { cbc } from "@noble/ciphers/aes.js";

// ── NFC payload format written to card ────────────────────────────────────────
// JSON: { v:1, enc:"<hex>", iv:"<hex>", addr:"<mxcAddress>", pub:"<publicKey>", label:"<label>" }
// enc  = AES-256-CBC(privateKey, key=PBKDF2-SHA256(pin, 100k iters, 32 bytes), iv=random 16 bytes)
// iv   = 16-byte random IV, hex-encoded
// addr = mxcAddress (plaintext, for display without decryption)
// pub  = publicKey (plaintext)
//
// NOTE: Uses @noble/ciphers + @noble/hashes instead of Web Crypto API
// because crypto.subtle is not available in React Native's Hermes engine.

export interface NfcWalletPayload {
  v: 1;
  enc: string;
  iv: string;
  addr: string;
  pub: string;
  label: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a Uint8Array to lowercase hex string */
function uint8ToHex(arr: Uint8Array): string {
  return Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Convert a hex string to Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return arr;
}

/** Cryptographically secure random bytes — uses getRandomValues (available in Hermes) */
function secureRandomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  // crypto.getRandomValues is available in React Native Hermes; crypto.subtle is not
  (globalThis as unknown as { crypto: { getRandomValues: (b: Uint8Array) => void } })
    .crypto.getRandomValues(buf);
  return buf;
}

/** Derive a 32-byte AES key from a PIN using PBKDF2-SHA256 (pure JS, no Web Crypto) */
function pinToKey(pin: string): Uint8Array {
  const pinBytes = new TextEncoder().encode(pin);
  const salt = new TextEncoder().encode("mchain_nfc_v1");
  return pbkdf2(sha256, pinBytes, salt, { c: 100_000, dkLen: 32 });
}

// ── Encrypt / Decrypt ─────────────────────────────────────────────────────────

/** Encrypt a private key with a PIN. Returns hex-encoded ciphertext and IV. */
export async function encryptPrivateKey(
  privateKey: string,
  pin: string
): Promise<{ enc: string; iv: string }> {
  const key = pinToKey(pin);
  const iv = secureRandomBytes(16);
  const data = new TextEncoder().encode(privateKey);
  const encrypted = cbc(key, iv).encrypt(data);
  return { enc: uint8ToHex(encrypted), iv: uint8ToHex(iv) };
}

/** Decrypt a private key from a card payload using a PIN.
 *  Throws if the PIN is wrong (AES-CBC padding error). */
export async function decryptPrivateKey(
  enc: string,
  iv: string,
  pin: string
): Promise<string> {
  const key = pinToKey(pin);
  const ivBytes = hexToBytes(iv);
  const encBytes = hexToBytes(enc);
  const decrypted = cbc(key, ivBytes).decrypt(encBytes);
  return new TextDecoder().decode(decrypted);
}

// ── NFC manager (lazy-loaded so web/simulator doesn't crash) ─────────────────

async function getNfc() {
  if (Platform.OS === "web") throw new Error("NFC not supported on web");
  const mod = await import("react-native-nfc-manager");
  return mod.default;
}

export async function isNfcSupported(): Promise<boolean> {
  try {
    if (Platform.OS === "web") return false;
    const NfcManager = await getNfc();
    return await NfcManager.isSupported();
  } catch {
    return false;
  }
}

export async function isNfcEnabled(): Promise<boolean> {
  try {
    if (Platform.OS === "web") return false;
    const NfcManager = await getNfc();
    return await NfcManager.isEnabled();
  } catch {
    return false;
  }
}

// ── Write payload to NFC card ─────────────────────────────────────────────────

/**
 * Write a wallet payload to an NFC card.
 * @param onCardDetected  Called once the card is tapped and detected, just
 *                        before the actual write begins. Use this to switch
 *                        the UI from "hold card to phone" → "writing…".
 */
export async function writeWalletToNfc(
  payload: NfcWalletPayload,
  onCardDetected?: () => void,
): Promise<void> {
  const mod = await import("react-native-nfc-manager");
  const { Ndef } = mod;
  const NfcManager = mod.default;

  await NfcManager.start();
  try {
    // Phase 1 — wait for the user to tap the card (blocks until tapped)
    await NfcManager.requestTechnology("Ndef" as never);

    // Card is now in field — notify caller to show "writing" UI
    onCardDetected?.();

    // Phase 2 — encode and write
    const json = JSON.stringify(payload);
    const bytes = Ndef.encodeMessage([Ndef.textRecord(json)]);
    if (!bytes || bytes.length === 0) {
      throw new Error("Failed to encode payload — card may be too small or incompatible.");
    }
    try {
      await NfcManager.ndefHandler.writeNdefMessage(bytes);
    } catch (writeErr: unknown) {
      const msg = writeErr instanceof Error ? writeErr.message : String(writeErr);
      if (msg.toLowerCase().includes("ioexception") || msg.toLowerCase().includes("tag was lost")) {
        throw new Error("Card lost during write — keep it still until the app confirms success.");
      }
      if (msg.toLowerCase().includes("readonly") || msg.toLowerCase().includes("read only")) {
        throw new Error("This card is read-only and cannot be written to.");
      }
      if (msg.toLowerCase().includes("size") || msg.toLowerCase().includes("capacity") || msg.toLowerCase().includes("overflow")) {
        throw new Error("Card is too small to store the wallet data. Use an NTAG215 or larger card.");
      }
      throw new Error(`Write failed: ${msg}`);
    }
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

// ── Read payload from NFC card ────────────────────────────────────────────────

export async function readWalletFromNfc(): Promise<NfcWalletPayload | null> {
  const mod = await import("react-native-nfc-manager");
  const { Ndef } = mod;
  const NfcManager = mod.default;

  await NfcManager.start();
  try {
    await NfcManager.requestTechnology("Ndef" as never);
    const tag = await NfcManager.getTag();
    const records = tag?.ndefMessage ?? [];

    for (const record of records) {
      try {
        const text = Ndef.text.decodePayload(record.payload as unknown as Uint8Array);
        const parsed = JSON.parse(text) as NfcWalletPayload;
        if (
          parsed.v === 1 &&
          typeof parsed.enc === "string" && parsed.enc.length > 0 &&
          typeof parsed.iv === "string" && parsed.iv.length === 32 &&
          typeof parsed.addr === "string" && parsed.addr.length > 0
        ) {
          return parsed;
        }
      } catch {
        // Skip non-wallet / non-JSON records silently
      }
    }
    return null;
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

// ── Cancel any pending NFC operation ─────────────────────────────────────────

export async function cancelNfc(): Promise<void> {
  try {
    const NfcManager = await getNfc();
    await NfcManager.cancelTechnologyRequest();
  } catch {
    // Ignore — may already be cancelled or never started
  }
}
