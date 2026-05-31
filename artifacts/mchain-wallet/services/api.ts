import { Platform } from "react-native";
import { getNodeUrl, isDefaultNode } from "./node";

/** Returns the base URL for public API endpoints (tokens, prices, dapps, p2p).
 *  Priority: EXPO_PUBLIC_API_URL → EXPO_PUBLIC_DOMAIN (web dev) → fallback */
export function getPublicApiBase(): string {
  const apiUrl = typeof process !== "undefined" ? process.env.EXPO_PUBLIC_API_URL : undefined;
  if (apiUrl) return `${apiUrl.replace(/\/$/, "")}/api`;
  if (Platform.OS === "web") {
    const domain = typeof process !== "undefined" ? process.env.EXPO_PUBLIC_DOMAIN : undefined;
    if (domain) return `https://${domain}/api`;
    return "/api";
  }
  // Native fallback — should always be set via EXPO_PUBLIC_API_URL at build time
  return "https://wallet.mymchain.com/api";
}

function getBaseUrl(): string {
  // EXPO_PUBLIC_API_URL takes priority on all platforms (points to VPS directly)
  const apiUrl = typeof process !== "undefined" ? process.env.EXPO_PUBLIC_API_URL : undefined;
  if (apiUrl) return apiUrl.replace(/\/$/, "");
  if (Platform.OS === "web") {
    const domain =
      typeof process !== "undefined" ? process.env.EXPO_PUBLIC_DOMAIN : undefined;
    if (domain) return `https://${domain}/api/chain-proxy`;
    return "/api/chain-proxy";
  }
  // Native: use the user-configured node URL directly
  return getNodeUrl();
}

function getRpcUrl(): string {
  // EXPO_PUBLIC_API_URL takes priority on all platforms (points to VPS directly)
  const apiUrl = typeof process !== "undefined" ? process.env.EXPO_PUBLIC_API_URL : undefined;
  if (apiUrl) return `${apiUrl.replace(/\/$/, "")}/rpc`;
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
  id: number;
  hash: string;
  fromAddress: string;
  toAddress: string;
  fromEth: string;
  toEth: string;
  fromMxc: string;
  toMxc: string;
  amount: string;
  nonce: number;
  createdAt: string;
  confirmedAt: string | null;
  blockHeight: number;
  status: string;
  txType: string;
  tokenContract?: string;
  tokenAmount?: string;
}

export interface TokenTransfer {
  hash: string;
  fromEth: string;
  toEth: string;
  blockNumber: number;
  value: string;
  logIndex: number;
}

export interface SubWallet {
  id: string;
  validatorAddress: string;
  subWalletAddress: string;
  subWalletEthAddress: string;
  packageTier: string | null;
  frozenBalance: string;
  availableBalance: string;
  label: string | null;
  createdAt: string;
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
  packageTier?: string | null;
  frozenBalance?: string;
  availableBalance?: string;
}

export interface ValidatorBalance {
  validatorAddress: string;
  packageTier: string | null;
  frozenBalanceWei: string;
  frozenBalanceMc: string;
  availableBalanceWei: string;
  availableBalanceMc: string;
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

export interface ApiVerifiedToken {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl: string;
  coingeckoId: string;
  contractAddress: string;
  sortOrder: number;
  active: boolean;
}

export interface FeaturedDapp {
  id: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  color: string;
  sortOrder: number;
  comingSoon: boolean;
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

  sendTransaction: async (params: {
    fromAddress: string;
    toAddress: string;
    amount: string;
    nonce: number;
    privateKey: string;
    data?: string;
    txType?: string;
  }): Promise<{ txHash: string }> => {
    const { privateKey, ...rest } = params;

    // Build the canonical message the server expects
    const message = [
      "MChain Transfer",
      `from: ${params.fromAddress}`,
      `to: ${params.toAddress}`,
      `amount: ${params.amount}`,
      `nonce: ${params.nonce}`,
    ].join("\n");

    // Sign with personal_sign (eth_sign with Ethereum prefix)
    const { signPersonalMessage } = await import("./crypto");
    const signature = signPersonalMessage(message, privateKey);

    const r = await request<{ txHash?: string; hash?: string }>("/transactions", {
      method: "POST",
      body: JSON.stringify({ ...rest, signature }),
    });
    return { txHash: (r.txHash ?? r.hash ?? "") as string };
  },

  getTransactionReceipt: (txHash: string) =>
    rpcRequest<Record<string, unknown> | null>("eth_getTransactionReceipt", [txHash]),

  waitForReceipt: async (txHash: string, timeoutMs = 30_000): Promise<Record<string, unknown>> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const receipt = await rpcRequest<Record<string, unknown> | null>(
        "eth_getTransactionReceipt", [txHash]
      );
      if (receipt) return receipt;
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error("Transaction not confirmed within 30 seconds");
  },

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

  getSubWallets: async (validatorAddress: string): Promise<{ subWallets: SubWallet[] }> => {
    const base = getPublicApiBase();
    const res = await fetch(`${base}/validators/${encodeURIComponent(validatorAddress)}/sub-wallets`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { subWallets: [] };
    return res.json();
  },

  getValidatorBalance: async (validatorAddress: string): Promise<ValidatorBalance> => {
    const base = getPublicApiBase();
    const res = await fetch(
      `${base}/validators/${encodeURIComponent(validatorAddress)}/balance`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) {
      return {
        validatorAddress,
        packageTier: null,
        frozenBalanceWei: "0", frozenBalanceMc: "0.000000",
        availableBalanceWei: "0", availableBalanceMc: "0.000000",
      };
    }
    return res.json();
  },

  addSubWallet: async (validatorAddress: string, subWalletAddress: string, label?: string, adminKey?: string): Promise<{ subWallet: SubWallet }> => {
    const base = getPublicApiBase();
    const res = await fetch(`${base}/validators/${encodeURIComponent(validatorAddress)}/sub-wallets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(adminKey ? { "x-admin-key": adminKey } : {}),
      },
      body: JSON.stringify({ subWalletAddress, ...(label ? { label } : {}) }),
      signal: AbortSignal.timeout(12_000),
    });
    const data = await res.json();
    if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to add sub wallet");
    return data;
  },

  removeSubWallet: async (validatorAddress: string, subWalletAddress: string, adminKey?: string): Promise<{ ok: boolean }> => {
    const base = getPublicApiBase();
    const res = await fetch(
      `${base}/validators/${encodeURIComponent(validatorAddress)}/sub-wallets`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(adminKey ? { "x-admin-key": adminKey } : {}),
        },
        body: JSON.stringify({ subWalletAddress }),
        signal: AbortSignal.timeout(8_000),
      }
    );
    if (!res.ok) throw new Error("Failed to remove sub wallet");
    return res.json();
  },

  getValidatorStatus: (address: string) =>
    request<{ validator: ValidatorInfo }>(
      `/validators/${encodeURIComponent(address)}`
    ),

  getRewards: (validatorAddress: string, limit = 30) =>
    request<{ rewards: Reward[] }>(
      `/rewards?validatorAddress=${encodeURIComponent(validatorAddress)}&limit=${limit}`
    ),

  getChainInfo: async (): Promise<ChainInfo> => {
    type RawChainInfo = {
      chainId: number;
      totalSupply: string;
      latestBlock?: { height: number };
    };
    const [raw, gasPriceHex] = await Promise.all([
      request<RawChainInfo>("/chain/info"),
      rpcRequest<string>("eth_gasPrice", []).catch(() => "0x0"),
    ]);
    const weiValue = parseInt(gasPriceHex, 16);
    const gweiValue = weiValue / 1e9;
    const gasPrice = gweiValue % 1 === 0
      ? `${gweiValue} Gwei`
      : `${gweiValue.toFixed(2)} Gwei`;
    return {
      chainId: raw.chainId,
      blockHeight: raw.latestBlock?.height ?? 0,
      totalSupply: raw.totalSupply,
      gasPrice,
    };
  },

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

  ping: () => {
    const t0 = Date.now();
    return fetch("https://node.mymchain.com/api/health").then(() => Date.now() - t0);
  },

  getVerifiedTokens: async (): Promise<ApiVerifiedToken[]> => {
    const base = getPublicApiBase();
    const res = await fetch(`${base}/tokens`);
    if (!res.ok) return [];
    const data = (await res.json()) as { tokens: ApiVerifiedToken[] };
    return data.tokens ?? [];
  },

  getPrices: async (): Promise<Record<string, number>> => {
    const base = getPublicApiBase();
    try {
      const res = await fetch(`${base}/prices`);
      if (!res.ok) return {};
      const data = (await res.json()) as { prices: { symbol: string; priceUsd: number }[] };
      return Object.fromEntries((data.prices ?? []).map(p => [p.symbol, p.priceUsd]));
    } catch {
      return {};
    }
  },

  getFeaturedDapps: async (): Promise<FeaturedDapp[]> => {
    const base = getPublicApiBase();
    const res = await fetch(`${base}/dapps`);
    if (!res.ok) return [];
    const data = (await res.json()) as { dapps: FeaturedDapp[] };
    return data.dapps ?? [];
  },

  getTokenTransfers: async (contractAddr: string, userEthAddr: string): Promise<TokenTransfer[]> => {
    const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const normalizedUser = userEthAddr.toLowerCase();
    const padded = "0x" + normalizedUser.replace(/^0x/i, "").padStart(64, "0");

    type RawLog = {
      transactionHash: string;
      topics: string[];
      data: string;
      blockNumber: string;
      logIndex: string;
    };

    const [sentLogs, receivedLogs] = await Promise.all([
      rpcRequest<RawLog[]>("eth_getLogs", [{
        fromBlock: "earliest", toBlock: "latest",
        address: contractAddr,
        topics: [TRANSFER_TOPIC, padded],
      }]),
      rpcRequest<RawLog[]>("eth_getLogs", [{
        fromBlock: "earliest", toBlock: "latest",
        address: contractAddr,
        topics: [TRANSFER_TOPIC, null, padded],
      }]),
    ]);

    const seen = new Set<string>();
    return [...sentLogs, ...receivedLogs]
      .filter((log) => {
        const key = `${log.transactionHash}:${log.logIndex}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((log) => ({
        hash: log.transactionHash,
        fromEth: "0x" + (log.topics[1] ?? "").slice(-40),
        toEth: "0x" + (log.topics[2] ?? "").slice(-40),
        blockNumber: parseInt(log.blockNumber, 16),
        value: BigInt(log.data && log.data !== "0x" ? log.data : "0x0").toString(),
        logIndex: parseInt(log.logIndex, 16),
      }))
      .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
  },

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

// ── Card API ─────────────────────────────────────────────────────────────────

export interface CardAccount {
  id: string;
  wallet_address: string;
  deposit_address: string;
  balance_usdt: string;
  frozen: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  kripicard_card_id?: string | null;
  kripicard_last4?: string | null;
  kripicard_bin?: string | null;
  kripicard_status?: string | null;
}

export interface CardDeposit {
  id: string;
  wallet_address: string;
  tx_hash: string;
  amount_usdt: string;
  from_address: string;
  network: string;
  status: string;
  created_at: string;
}

export async function initCardAccount(ethAddress: string): Promise<{ account: CardAccount }> {
  const base = getPublicApiBase();
  const res = await fetch(`${base}/cards/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: ethAddress }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error("Failed to initialise card account");
  return res.json();
}

export async function getCardAccount(ethAddress: string): Promise<{ account: CardAccount | null }> {
  const base = getPublicApiBase();
  const res = await fetch(`${base}/cards/account/${encodeURIComponent(ethAddress)}`, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return { account: null };
  return res.json();
}

export async function getCardDeposits(ethAddress: string): Promise<{ deposits: CardDeposit[] }> {
  const base = getPublicApiBase();
  const res = await fetch(`${base}/cards/deposits/${encodeURIComponent(ethAddress)}`, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return { deposits: [] };
  return res.json();
}

export async function verifyCardDeposit(ethAddress: string): Promise<{
  credited: number;
  newDeposits: number;
  message: string;
}> {
  const base = getPublicApiBase();
  const res = await fetch(`${base}/cards/verify-deposit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: ethAddress }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error("Verification failed");
  return res.json();
}

export async function toggleCardFreeze(ethAddress: string): Promise<{ frozen: boolean }> {
  const base = getPublicApiBase();
  const res = await fetch(`${base}/cards/freeze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: ethAddress }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error("Failed to toggle freeze");
  return res.json();
}

export interface StripeCardDetails {
  number: string | null;
  cvc: string | null;
  exp_month: number;
  exp_year: number;
  last4: string;
  brand: string;
  status: string;
}

export async function getStripeCardDetails(ethAddress: string): Promise<StripeCardDetails> {
  const base = getPublicApiBase();
  const res = await fetch(`${base}/cards/stripe-details/${encodeURIComponent(ethAddress)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Failed to fetch card details");
  }
  return res.json();
}

// ── KripiCard API ─────────────────────────────────────────────────────────────

export interface KripicardDetails {
  cardId: string;
  last4: string | null;
  bin: string | null;
  status: string;
  cardNumber: string;
  expiry: string;
  cvv: string;
  balance: number;
}

export interface KripicardTransaction {
  date: string;
  type: string;
  merchant: string;
  amount: number;
  success: boolean;
}

export async function issueKripicardCard(
  walletAddress: string,
  params: { amount: number; bin: string; nameOnCard: string; email?: string; dateOfBirth?: string }
): Promise<{ cardId: string; last4: string; bin: string; amount: number; fee: number; totalCharged: number }> {
  const base = getPublicApiBase();
  const res = await fetch(`${base}/cards/kc/issue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, ...params }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json() as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to issue card");
  return data as never;
}

export async function fundKripicardCard(
  walletAddress: string,
  amount: number
): Promise<{ cardId: string; amount: number; fee: number; totalDebited: number }> {
  const base = getPublicApiBase();
  const res = await fetch(`${base}/cards/kc/fund`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, amount }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json() as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to fund card");
  return data as never;
}

export async function getKripicardDetails(walletAddress: string): Promise<KripicardDetails> {
  const base = getPublicApiBase();
  const res = await fetch(`${base}/cards/kc/details`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json() as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to get card details");
  return data as never;
}

export async function freezeKripicardCard(
  walletAddress: string,
  action: "freeze" | "unfreeze"
): Promise<{ action: string; status: string }> {
  const base = getPublicApiBase();
  const res = await fetch(`${base}/cards/kc/freeze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, action }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json() as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to freeze/unfreeze card");
  return data as never;
}

export async function getKripicardTransactions(walletAddress: string): Promise<{
  cardId: string; balance: number; totalTransactions: number;
  transactions: KripicardTransaction[];
}> {
  const base = getPublicApiBase();
  const res = await fetch(`${base}/cards/kc/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json() as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to get transactions");
  return data as never;
}
