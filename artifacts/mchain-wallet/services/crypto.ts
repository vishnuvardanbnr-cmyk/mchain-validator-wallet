import { HDKey } from "@scure/bip32";
import { generateMnemonic as bip39Generate, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { sha256 } from "@noble/hashes/sha256";
import { bech32 } from "bech32";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export interface KeyPair {
  privateKey: string;
  publicKey: string;
  ethAddress: string;
  mxcAddress: string;
}

function privKeyBytesToKeyPair(privKeyBytes: Uint8Array): KeyPair {
  const pubKeyBytes = secp256k1.getPublicKey(privKeyBytes, true);
  const pubKeyHash = keccak_256(pubKeyBytes);
  const addressBytes = pubKeyHash.slice(-20);
  const ethAddress = "0x" + bytesToHex(addressBytes);
  const words = bech32.toWords(addressBytes);
  const mxcAddress = bech32.encode("mxc", words);
  return {
    privateKey: bytesToHex(privKeyBytes),
    publicKey: bytesToHex(pubKeyBytes),
    ethAddress,
    mxcAddress,
  };
}

export function generateMnemonic(): string {
  return bip39Generate(wordlist, 128);
}

export function validateMnemonicWords(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim().toLowerCase(), wordlist);
}

export function mnemonicToKeyPair(mnemonic: string): KeyPair {
  const seed = mnemonicToSeedSync(mnemonic.trim().toLowerCase());
  const root = HDKey.fromMasterSeed(seed);
  const child = root.derive("m/44'/60'/0'/0/0");
  if (!child.privateKey) throw new Error("Failed to derive private key");
  return privKeyBytesToKeyPair(child.privateKey);
}

export function generateKeyPair(): KeyPair {
  const privKeyBytes = secp256k1.utils.randomPrivateKey();
  return privKeyBytesToKeyPair(privKeyBytes);
}

export function deriveAddressFromPublicKey(publicKeyHex: string): string {
  const pubKeyBytes = hexToBytes(publicKeyHex);
  const pubKeyHash = keccak_256(pubKeyBytes);
  const addressBytes = pubKeyHash.slice(-20);
  const words = bech32.toWords(addressBytes);
  return bech32.encode("mxc", words);
}

/**
 * Sign an epoch block hash as per the Phase 3 spec:
 *   message = SHA-256(hex_decode(blockHash.replace("0x", "")))
 *   signature = secp256k1_sign(message, privateKey) — compact 64-byte, hex encoded
 */
export function signEpochBlockHash(blockHash: string, privateKeyHex: string): string {
  const cleanHex = blockHash.replace(/^0x/i, "");
  const blockHashBytes = hexToBytes(cleanHex);
  const message = sha256(blockHashBytes);
  const privKeyBytes = hexToBytes(privateKeyHex);
  const sig = secp256k1.sign(message, privKeyBytes);
  return bytesToHex(sig.toCompactRawBytes());
}

export function signTransaction(
  from: string,
  to: string,
  amount: string,
  nonce: number,
  privateKeyHex: string
): string {
  const message = from + to + amount + String(nonce);
  const msgBytes = new TextEncoder().encode(message);
  const hash = keccak_256(msgBytes);
  const privKeyBytes = hexToBytes(privateKeyHex);
  const sig = secp256k1.sign(hash, privKeyBytes);
  return bytesToHex(sig.toCompactRawBytes());
}

export function mcToWei(mc: string): string {
  const trimmed = mc.trim();
  const [intPart, decPart = ""] = trimmed.split(".");
  const paddedDec = decPart.padEnd(18, "0").slice(0, 18);
  const combined = (intPart || "0") + paddedDec;
  return BigInt(combined).toString();
}

export function weiToMc(wei: string): string {
  try {
    const weiBig = BigInt(wei);
    const divisor = BigInt("1000000000000000000");
    const whole = weiBig / divisor;
    const remainder = weiBig % divisor;
    const decimal = Number(remainder) / 1e18;
    const total = Number(whole) + decimal;
    if (total >= 1000000) {
      return (total / 1000000).toFixed(2) + "M";
    }
    if (total >= 1000) {
      return total.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    return total.toFixed(2);
  } catch {
    return "0.00";
  }
}

export function formatUptime(totalMinutes: number): string {
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function shortenAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 5) return address;
  return `${address.slice(0, chars + 4)}...${address.slice(-chars)}`;
}

export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
