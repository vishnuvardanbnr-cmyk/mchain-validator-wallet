import { Platform } from "react-native";

const CHAIN_BASE = "https://chain.mvault.pro/api";

function getBaseUrl(): string {
  if (Platform.OS === "web") {
    const domain =
      typeof process !== "undefined" ? process.env.EXPO_PUBLIC_DOMAIN : undefined;
    if (domain) {
      return `https://${domain}/api/chain-proxy`;
    }
    return "/api/chain-proxy";
  }
  return CHAIN_BASE;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const base = getBaseUrl();
  const response = await fetch(`${base}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "Request failed");
    let message = text;
    let data: Record<string, unknown> | undefined;
    try {
      const json = JSON.parse(text);
      message = json.message ?? json.error ?? text;
      data = json as Record<string, unknown>;
    } catch {
      // use raw text
    }
    const err = new Error(message) as Error & {
      status: number;
      data?: Record<string, unknown>;
    };
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return response.json() as Promise<T>;
}

export interface AccountInfo {
  address: string;
  ethAddress: string;
  balance: string;
  nonce: number;
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  amount: string;
  nonce: number;
  timestamp: string;
  blockHeight: number;
  status: string;
}

export interface ValidatorInfo {
  id: string;
  address: string;
  ethAddress: string;
  publicKey: string;
  deviceId: string;
  moniker: string;
  status: "active" | "pending" | "offline" | "banned";
  totalActiveMinutes: number;
  lastSeenAt: string;
  commissionRate: string;
  createdAt: string;
}

export interface HeartbeatRecord {
  id: string;
  address: string;
  batteryLevel: number;
  isCharging: boolean;
  blockHeight: number;
  timestamp: string;
}

export interface HeartbeatResponse {
  ok: boolean;
  blockHeight?: number;
  isStaked?: boolean;
  sessionExpiresAt?: string | null;
}

export interface SessionRestartResponse {
  ok: boolean;
  sessionStartedAt: string;
  sessionExpiresAt: string;
  sessionHours: number;
}

export interface Reward {
  id: string;
  validatorAddress: string;
  amount: string;
  date: string;
  poolShare: string;
  blockHeight: number;
  timestamp: string;
}

export interface ChainInfo {
  chainId: number;
  blockHeight: number;
  totalSupply: string;
  gasPrice: string;
}

export const api = {
  getAccount: (address: string) =>
    request<AccountInfo>(`/accounts/${encodeURIComponent(address)}`),

  getBalance: (address: string) =>
    request<{ balance: string }>(
      `/accounts/${encodeURIComponent(address)}/balance`
    ),

  getTransactions: (address: string, limit = 20) =>
    request<{ transactions: Transaction[] }>(
      `/transactions?address=${encodeURIComponent(address)}&limit=${limit}`
    ),

  sendTransaction: (tx: {
    from: string;
    to: string;
    amount: string;
    nonce: number;
    signature: string;
  }) =>
    request<{ txHash: string }>("/transactions", {
      method: "POST",
      body: JSON.stringify(tx),
    }),

  registerValidator: (data: {
    address: string;
    ethAddress: string;
    publicKey: string;
    deviceId: string;
    moniker: string;
    commissionRate: string;
  }) =>
    request<{ validator: ValidatorInfo }>("/validators/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  sendHeartbeat: (data: {
    address: string;
    batteryLevel: number;
    isCharging: boolean;
    activeMinutes: number;
  }) =>
    request<HeartbeatResponse>("/validators/heartbeat", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  restartSession: (address: string) =>
    request<SessionRestartResponse>("/validators/restart", {
      method: "POST",
      body: JSON.stringify({ address }),
    }),

  getValidatorStatus: (address: string) =>
    request<{ validator: ValidatorInfo }>(
      `/validators/${encodeURIComponent(address)}`
    ),

  getRewards: (validatorAddress: string, limit = 30) =>
    request<{ rewards: Reward[] }>(
      `/rewards?validatorAddress=${encodeURIComponent(validatorAddress)}&limit=${limit}`
    ),

  getChainInfo: () => request<ChainInfo>("/chain/info"),

  healthCheck: () => request<{ status: string }>("/healthz"),
};
