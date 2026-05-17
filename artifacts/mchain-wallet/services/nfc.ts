import { Platform } from "react-native";

// ── NFC payload format written to card ────────────────────────────────────────
// JSON: { v: 1, enc: "<hex>", iv: "<hex>", addr: "<mxcAddress>", pub: "<publicKey>", label: "<label>" }
// enc  = AES-256-CBC(privateKey, key=sha256(pin), iv=random 16 bytes), hex-encoded
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

// ── AES-256-CBC helpers using expo's available crypto ────────────────────────

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

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return arr;
}

export async function encryptPrivateKey(privateKey: string, pin: string): Promise<{ enc: string; iv: string }> {
  const key = await pinToKey(pin);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encoded = new TextEncoder().encode(privateKey);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, encoded);
  return { enc: bytesToHex(encrypted), iv: bytesToHex(iv.buffer) };
}

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
  const NfcManager = (await import("react-native-nfc-manager")).default;
  return NfcManager;
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
  const { Ndef } = await import("react-native-nfc-manager");
  const NfcManager = await getNfc();
  await NfcManager.start();
  try {
    await NfcManager.requestTechnology("Ndef" as never);
    const json = JSON.stringify(payload);
    const bytes = Ndef.encodeMessage([Ndef.textRecord(json)]);
    if (bytes) await NfcManager.ndefHandler.writeNdefMessage(bytes);
  } finally {
    NfcManager.cancelTechnologyRequest();
  }
}

// ── Read payload from NFC card ────────────────────────────────────────────────

export async function readWalletFromNfc(): Promise<NfcWalletPayload | null> {
  const { Ndef } = await import("react-native-nfc-manager");
  const NfcManager = await getNfc();
  await NfcManager.start();
  try {
    await NfcManager.requestTechnology("Ndef" as never);
    const tag = await NfcManager.getTag();
    const records = tag?.ndefMessage ?? [];
    for (const record of records) {
      try {
        const text = Ndef.text.decodePayload(record.payload as unknown as Uint8Array);
        const parsed = JSON.parse(text) as NfcWalletPayload;
        if (parsed.v === 1 && parsed.enc && parsed.iv && parsed.addr) return parsed;
      } catch { /* skip non-wallet records */ }
    }
    return null;
  } finally {
    NfcManager.cancelTechnologyRequest();
  }
}

export async function cancelNfc(): Promise<void> {
  try {
    const NfcManager = await getNfc();
    NfcManager.cancelTechnologyRequest();
  } catch { /* ignore */ }
}
