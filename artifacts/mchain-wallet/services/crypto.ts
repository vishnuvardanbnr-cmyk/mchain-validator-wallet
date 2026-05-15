import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
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

export function generateKeyPair(): KeyPair {
  const privKeyBytes = secp256k1.utils.randomPrivateKey();
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

export function deriveAddressFromPublicKey(publicKeyHex: string): string {
  const pubKeyBytes = hexToBytes(publicKeyHex);
  const pubKeyHash = keccak_256(pubKeyBytes);
  const addressBytes = pubKeyHash.slice(-20);
  const words = bech32.toWords(addressBytes);
  return bech32.encode("mxc", words);
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
