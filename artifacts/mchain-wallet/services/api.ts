import { Platform } from "react-native";
import { getNodeUrl, isDefaultNode } from "./node";

function getBaseUrl(): string {
  if (Platform.OS === "web") {
    const domain =
      typeof process !== "undefined" ? process.env.EXPO_PUBLIC_DOMAIN : undefined;
    if (domain) {
      return `https://${domain}/api/chain-proxy`;
    }
    return "/api/chain-proxy";
  }
  // Native: use the user-configured node URL directly
  return getNodeUrl();
}

function getRpcUrl(): string {
  if (Platform.OS === "web") {
    const domain =
      typeof process !== "undefined" ? process.env.EXPO_PUBLIC_DOMAIN : undefined;
    if (domain) return `https://${domain}/api/rpc`;
    return "/api/rpc";
  }
  return `${getNodeUrl()}/rpc`;
}

async function rpcRequest<T>(method: string, params: unknown[]): Promise<T> {
  const url = getRpcUrl();
  const nodeUrl = getNodeUrl();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (Platform.OS === "web" && !isDefaultNode()) {
    headers["X-MChain-Node"] = nodeUrl;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  const data = await res.json() as { result?: T; error?: { message: string; code: number } };
  if (data.error) throw new Error(data.error.message ?? "RPC error");
  return data.result as T;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const base = getBaseUrl();

  // On web with a custom node, pass the target URL as a header so the proxy
  // can forward to it instead of the hardcoded default.
  const extraHeaders: Record<string, string> =
    Platform.OS === "web" && !isDefaultNode()
      ? { "X-MChain-Node": getNodeUrl() }
      : {};

  const response = await fetch(`${base}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
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
  balanceMc?: string;
  nonce: number;
  isContract?: boolean;
  exists?: boolean;
}

export interface RpcCallResult {
  jsonrpc: string;
  id: number;
  result?: string;
  error?: { code: number; message: string };
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
  status: "active" | "pending" | "paused" | "inactive" | "banned";
  totalActiveMinutes: number;
  lastSeenAt: string;
  commissionRate: string;
  joinedAt: string;
  sessionStartedAt?: string;
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

// ─── Epoch types ──────────────────────────────────────────────────────────────

/** Minimal epoch returned inside each heartbeat response */
export interface OpenEpoch {
  epochNumber: number;
  blockHeight: number;
  blockHash: string;
  signingWindowClosesAt: string;
}

export interface EpochSigner {
  address: string;
  moniker: string;
  signedAt: string;
  signature: string;
}

/** Rich epoch item returned by the epoch history endpoint */
export interface EpochHistoryItem {
  epochNumber: number;
  blockRange: {
    from: number;
    to: number;
    checkpointBlock: number;
    checkpointHash: string;
  };
  blockStats: {
    blockCount: number;
    txCount: number;
    gasUsed: string;
  };
  quorum: {
    reached: boolean;
    signatureCount: number;
    eligibleCount: number;
    pct: string;
  };
  myParticipation: {
    didSign: boolean;
    signedAt: string | null;
    signature: string | null;
  };
  signers: EpochSigner[];
  status: "open" | "expired" | "finalized";
  signingWindowClosesAt: string;
  finalizedAt: string | null;
  createdAt: string;
}

export interface EpochsSummary {
  totalEpochs: number;
  signed: number;
  missed: number;
  open: number;
  participationRate: string;
}

export interface EpochsPage {
  address: string;
  moniker: string;
  summary: EpochsSummary;
  epochs: EpochHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface HeartbeatResponse {
  ok: boolean;
  blockHeight?: number;
  timestamp?: string;
  isStaked?: boolean;
  sessionExpiresAt?: string | null;
  openEpoch?: OpenEpoch | null;
  epochResult?: { ok: boolean; nowFinalized?: boolean; reason?: string } | null;
}

export interface ValidatorRestartResponse {
  ok: boolean;
  status: string;
  sessionStartedAt: string;
  message: string;
}

export type SessionRestartResponse = ValidatorRestartResponse;

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

export interface ValidatorEarnings {
  address: string;
  moniker: string;
  totalActiveMinutes: number;
  currentBalanceMc: string;
  earnings: {
    treasuryTotalMc: string;
    gasTotalMc: string;
    combinedTotalMc: string;
  };
  stats: {
    totalRewardPeriods: number;
    lastRewardPeriod: string;
    totalBlocksProposed: number;
    totalTxsProcessed: number;
  };
}

export interface TreasuryReward {
  id: number;
  period: string;
  activeMinutes: number;
  totalNetworkMinutes: number;
  uptimePct: string;
  amountMc: string;
  status: string;
  distributedAt: string | null;
}

export interface TreasuryRewardsPage {
  rewards: TreasuryReward[];
  total: number;
  limit: number;
  offset: number;
}

export interface GasReward {
  id: number;
  blockHeight: number;
  txCount: number;
  totalFeeMc: string;
  validatorShareMc: string;
  adminShareMc: string;
  isStaked: boolean;
  splitPct: string;
  timestamp: string;
}

export interface GasRewardsPage {
  gasRewards: GasReward[];
  total: number;
  limit: number;
  offset: number;
}

export interface ValidatorBlock {
  height: number;
  hash: string;
  txCount: number;
  gasUsed: number;
  timestamp: string;
}

export interface ValidatorBlocksPage {
  blocks: ValidatorBlock[];
  total: number;
  totalTxsProcessed: number;
  totalGasUsed: string;
  limit: number;
  offset: number;
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

  getEvmNonce: (ethAddress: string) =>
    rpcRequest<string>("eth_getTransactionCount", [ethAddress, "latest"])
      .then(hex => parseInt(hex as string, 16)),

  sendRawTransaction: (signedTx: string) =>
    rpcRequest<string>("eth_sendRawTransaction", [signedTx])
      .then(hash => ({ txHash: hash as string })),

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
    deviceSignature?: string;
    epochSignature?: { epochNumber: number; signature: string };
  }) =>
    request<HeartbeatResponse>("/validators/heartbeat", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  pauseValidator: (address: string) =>
    request<{ ok: boolean; status: string; message: string }>("/validators/pause", {
      method: "POST",
      body: JSON.stringify({ address }),
    }),

  restartSession: (address: string) =>
    request<ValidatorRestartResponse>("/validators/restart", {
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

  getValidatorEarnings: (address: string) =>
    request<ValidatorEarnings>(`/validators/${encodeURIComponent(address)}/earnings`),

  getTreasuryRewards: (address: string, limit = 50, offset = 0) =>
    request<TreasuryRewardsPage>(
      `/validators/${encodeURIComponent(address)}/treasury-rewards?limit=${limit}&offset=${offset}`
    ),

  getGasRewards: (address: string, limit = 50, offset = 0) =>
    request<GasRewardsPage>(
      `/validators/${encodeURIComponent(address)}/gas-rewards?limit=${limit}&offset=${offset}`
    ),

  getValidatorBlocks: (address: string, limit = 50, offset = 0) =>
    request<ValidatorBlocksPage>(
      `/validators/${encodeURIComponent(address)}/blocks?limit=${limit}&offset=${offset}`
    ),

  getValidatorEpochs: (address: string, limit = 50, offset = 0) =>
    request<EpochsPage>(
      `/validators/${encodeURIComponent(address)}/epochs?limit=${limit}&offset=${offset}`
    ),

  ping: () => request<unknown>("/ping"),

  rpcCall: (to: string, data: string) =>
    request<RpcCallResult>("/rpc", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to, data }, "latest"],
      }),
    }),
};
