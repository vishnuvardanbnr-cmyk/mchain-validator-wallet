import { Platform } from "react-native";
import { getNodeUrl, isDefaultNode } from "./node";

// Re-export types used across the P2P UI
export interface P2pProfile {
  id: string;
  mxcAddress: string;
  displayName: string;
  totalTrades: number;
  completedTrades: number;
  disputesLost: number;
  avgRating: string;
  kycStatus: "none" | "pending" | "verified" | "rejected";
  isMerchant: boolean;
  completionRate: string;
  createdAt: string;
}

export interface P2pAd {
  id: string;
  ownerAddress: string;
  displayName?: string;
  kycVerified?: boolean;
  isMerchant?: boolean;
  completionRate?: string;
  token: "MC" | "USDT";
  side: "buy" | "sell";
  price: string;
  minAmount: string;
  maxAmount: string;
  availableAmount: string;
  paymentMethods: string[];
  paymentWindow: number;
  terms?: string;
  status: string;
  completedOrders: number;
  createdAt: string;
}

export interface PaymentDetail {
  id: string;
  ownerAddress: string;
  paymentMethod: string;
  label: string;
  details: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface P2pOrder {
  id: string;
  adId: string;
  buyerAddress: string;
  sellerAddress: string;
  token: "MC" | "USDT";
  side: "buy" | "sell";
  cryptoAmount: string;
  fiatAmount: string;
  price: string;
  paymentMethod: string;
  paymentDetails?: string;
  sellerPaymentDetail?: PaymentDetail | null;
  status: "pending" | "paid" | "released" | "cancelled" | "disputed" | "resolved";
  escrowTxHash?: string;
  releaseTxHash?: string;
  paymentDeadline: string;
  paidAt?: string;
  releasedAt?: string;
  cancelledAt?: string;
  ad?: P2pAd;
  buyerProfile?: P2pProfile;
  sellerProfile?: P2pProfile;
  createdAt: string;
}

export interface P2pMessage {
  id: string;
  orderId: string;
  senderAddress: string;
  content: string;
  isSystem: boolean;
  createdAt: string;
}

export interface P2pAdsPage {
  ads: P2pAd[];
  total: number;
  limit: number;
  offset: number;
}

export interface P2pOrdersPage {
  orders: P2pOrder[];
  total: number;
  limit: number;
  offset: number;
}

export interface P2pDispute {
  id: string;
  orderId: string;
  openedBy: string;
  reason: string;
  description: string;
  status: "open" | "resolved_buyer" | "resolved_seller";
  createdAt: string;
}

function getApiBase(): string {
  const domain = typeof process !== "undefined" ? process.env.EXPO_PUBLIC_DOMAIN : undefined;
  if (domain) return `https://${domain}/api/p2p`;
  if (Platform.OS !== "web") return `${getNodeUrl()}/p2p`;
  return "/api/p2p";
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const base = getApiBase();
  const extraHeaders: Record<string, string> =
    Platform.OS === "web" && !isDefaultNode() ? { "X-MChain-Node": getNodeUrl() } : {};

  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...extraHeaders, ...(options?.headers ?? {}) },
    ...options,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Request failed");
    let msg = text;
    try { msg = (JSON.parse(text) as { error?: string; message?: string }).error ?? (JSON.parse(text) as { message?: string }).message ?? text; } catch { /* use raw */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const p2pApi = {
  // ── Profile ──────────────────────────────────────────────────────────────
  getProfile: (address: string) => req<P2pProfile>(`/profiles/${address}`),
  upsertProfile: (body: { mxcAddress: string; displayName: string }) =>
    req<P2pProfile>("/profiles", { method: "POST", body: JSON.stringify(body) }),
  submitKyc: (body: { mxcAddress: string; kycName: string; kycDocType: string; displayName: string; kycDocImage?: string }) =>
    req<P2pProfile>("/profiles/kyc", { method: "POST", body: JSON.stringify(body) }),

  // ── Ads ──────────────────────────────────────────────────────────────────
  getAds: (params: { token?: string; side?: string; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params.token) qs.set("token", params.token);
    if (params.side) qs.set("side", params.side);
    if (params.offset) qs.set("offset", String(params.offset));
    return req<P2pAdsPage>(`/ads?${qs.toString()}`);
  },
  getMyAds: (address: string) => req<P2pAdsPage>(`/ads?owner=${address}`),
  postAd: (body: {
    ownerAddress: string; token: string; side: string; price: string;
    minAmount: string; maxAmount: string; availableAmount: string;
    paymentMethods: string[]; paymentWindow: number; terms?: string;
  }) => req<P2pAd>("/ads", { method: "POST", body: JSON.stringify(body) }),
  updateAdStatus: (id: string, status: string) =>
    req<P2pAd>(`/ads/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),

  // ── Orders ───────────────────────────────────────────────────────────────
  getMyOrders: (address: string, offset = 0) =>
    req<P2pOrdersPage>(`/orders?address=${encodeURIComponent(address)}&offset=${offset}`),
  getOrder: (id: string) => req<P2pOrder>(`/orders/${id}`),
  createOrder: (body: {
    adId: string; buyerAddress: string; cryptoAmount: string;
    paymentMethod: string; paymentDetails?: string;
  }) => req<P2pOrder>("/orders", { method: "POST", body: JSON.stringify(body) }),
  markPaid: (id: string, address: string) =>
    req<P2pOrder>(`/orders/${id}/pay`, { method: "POST", body: JSON.stringify({ address }) }),
  confirmRelease: (id: string, address: string) =>
    req<P2pOrder>(`/orders/${id}/release`, { method: "POST", body: JSON.stringify({ address }) }),
  cancelOrder: (id: string, address: string, reason?: string) =>
    req<P2pOrder>(`/orders/${id}/cancel`, { method: "POST", body: JSON.stringify({ address, reason }) }),

  // ── Messages ─────────────────────────────────────────────────────────────
  getMessages: (orderId: string) => req<P2pMessage[]>(`/orders/${orderId}/messages`),
  sendMessage: (orderId: string, body: { senderAddress: string; content: string }) =>
    req<P2pMessage>(`/orders/${orderId}/messages`, { method: "POST", body: JSON.stringify(body) }),

  // ── Disputes ─────────────────────────────────────────────────────────────
  getDispute: (orderId: string) => req<P2pDispute>(`/orders/${orderId}/dispute`),
  openDispute: (orderId: string, body: { openedBy: string; reason: string; description: string; evidence?: string }) =>
    req<P2pDispute>(`/orders/${orderId}/dispute`, { method: "POST", body: JSON.stringify(body) }),

  // ── Ratings ──────────────────────────────────────────────────────────────
  rateOrder: (orderId: string, body: { raterAddress: string; ratedAddress: string; score: number; comment?: string }) =>
    req<{ ok: boolean }>(`/orders/${orderId}/rate`, { method: "POST", body: JSON.stringify(body) }),

  // ── Payment Details ───────────────────────────────────────────────────────
  getPaymentDetails: (address: string) =>
    req<PaymentDetail[]>(`/payment-details/${address}`),
  getPaymentDetailForMethod: (address: string, method: string) =>
    req<PaymentDetail[]>(`/payment-details/${address}/${encodeURIComponent(method)}`),
  savePaymentDetail: (body: { ownerAddress: string; paymentMethod: string; label?: string; details: Record<string, string> }) =>
    req<PaymentDetail>("/payment-details", { method: "POST", body: JSON.stringify(body) }),
  deletePaymentDetail: (id: string, ownerAddress: string) =>
    req<{ ok: boolean }>(`/payment-details/${id}`, { method: "DELETE", body: JSON.stringify({ ownerAddress }) }),
};
