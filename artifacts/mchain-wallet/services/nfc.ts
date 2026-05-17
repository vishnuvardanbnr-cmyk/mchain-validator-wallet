import { Platform } from "react-native";

// ── NFC payload format written to card ────────────────────────────────────────
// JSON: { v: 1, enc: "<hex>", iv: "<hex>", addr: "<mxcAddress>", pub: "<publicKey>", label: "<label>" }
// enc  = AES-256-CBC(privateKey, key=PBKDF2(pin, 100k iters), iv=random 16 bytes), hex-encoded
// iv   = 16-byte random IV, hex-encoded
// addr = mxcAddress (plaintext, for display without decryption)
// pub  = publicKey (plaintext)

export interface NfcWalletPayload {
  v: 1;
  enc: string;
  iv: string;
  addr: string;
  pub: string;
  label: string;
}

// ── AES-256-CBC + PBKDF2 helpers ─────────────────────────────────────────────

async function pinToKey(pin: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(pin), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("mchain_nfc_v1"), iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-CBC", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Convert a Uint8Array to lowercase hex string — avoids .buffer offset/length bugs */
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

/** Encrypt a private key with a PIN. Returns hex-encoded ciphertext and IV. */
export async function encryptPrivateKey(privateKey: string, pin: string): Promise<{ enc: string; iv: string }> {
  const key = await pinToKey(pin);
  const ivBytes = new Uint8Array(16);
  crypto.getRandomValues(ivBytes);
  const encoded = new TextEncoder().encode(privateKey);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-CBC", iv: ivBytes }, key, encoded);
  return { enc: uint8ToHex(new Uint8Array(encrypted)), iv: uint8ToHex(ivBytes) };
}

/** Decrypt a private key from a card payload using a PIN.
 *  Throws a DOMException (AES padding error) if the PIN is wrong — callers should treat any
 *  thrown error as "wrong PIN". */
export async function decryptPrivateKey(enc: string, iv: string, pin: string): Promise<string> {
  const key = await pinToKey(pin);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv: hexToBytes(iv) },
    key,
    hexToBytes(enc)
  );
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

export async function writeWalletToNfc(payload: NfcWalletPayload): Promise<void> {
  const mod = await import("react-native-nfc-manager");
  const { Ndef } = mod;
  const NfcManager = mod.default;

  await NfcManager.start();
  try {
    await NfcManager.requestTechnology("Ndef" as never);

    const json = JSON.stringify(payload);
    const bytes = Ndef.encodeMessage([Ndef.textRecord(json)]);
    if (!bytes || bytes.length === 0) {
      throw new Error("Failed to encode NFC payload — card may be too small or incompatible.");
    }
    await NfcManager.ndefHandler.writeNdefMessage(bytes);
  } finally {
    // Always release the technology regardless of success or failure
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
        // Validate required fields before accepting
        if (
          parsed.v === 1 &&
          typeof parsed.enc === "string" && parsed.enc.length > 0 &&
          typeof parsed.iv === "string" && parsed.iv.length === 32 &&  // 16 bytes = 32 hex chars
          typeof parsed.addr === "string" && parsed.addr.length > 0
        ) {
          return parsed;
        }
      } catch {
        // Skip non-wallet / non-JSON records silently
      }
    }
    return null; // Card had NDEF data but no valid wallet payload
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
