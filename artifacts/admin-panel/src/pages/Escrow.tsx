import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post } from "@/lib/api";
import { Shield, Lock, CheckCircle, RefreshCw, AlertTriangle, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface EscrowInfo {
  configured: boolean;
  escrowAddress: string | null;
}

interface EscrowOrder {
  id: string;
  buyerAddress: string;
  sellerAddress: string;
  token: "MC" | "USDT";
  cryptoAmount: string;
  fiatAmount: string;
  price: string;
  status: string;
  escrowStatus: string;
  escrowTxHash?: string;
  releaseTxHash?: string;
  escrowLockedAt?: string;
  createdAt: string;
}

interface EscrowOrdersResponse {
  orders: EscrowOrder[];
  total: number;
  escrowAddress: string | null;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 8)}…${addr.slice(-5)}`;
}

function escrowStatusBadge(s: string) {
  if (s === "locked") return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  if (s === "released") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (s === "refunded") return "bg-blue-500/15 text-blue-400 border-blue-500/30";
  return "bg-muted/50 text-muted-foreground border-border";
}

export default function Escrow() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirmId, setConfirmId] = useState<{ id: string; action: "release" | "refund" } | null>(null);
  const [reason, setReason] = useState("");

  const { data: escrowInfo } = useQuery<EscrowInfo>({
    queryKey: ["admin", "escrow-info"],
    queryFn: () => get<EscrowInfo>("/escrow/info"),
  });

  const { data: escrowOrders, isLoading } = useQuery<EscrowOrdersResponse>({
    queryKey: ["admin", "escrow-orders"],
    queryFn: () => get<EscrowOrdersResponse>("/escrow/orders"),
    refetchInterval: 30_000,
  });

  const releaseMut = useMutation({
    mutationFn: ({ id }: { id: string }) => post(`/escrow/orders/${id}/release`),
    onSuccess: () => {
      toast({ title: "Released", description: "Escrow released to buyer on-chain." });
      setConfirmId(null);
      qc.invalidateQueries({ queryKey: ["admin", "escrow-orders"] });
    },
    onError: (e) => toast({ title: "Error", description: e instanceof Error ? e.message : "Release failed", variant: "destructive" }),
  });

  const refundMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => post(`/escrow/orders/${id}/refund`, { reason }),
    onSuccess: () => {
      toast({ title: "Refunded", description: "Escrow refunded to seller." });
      setConfirmId(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["admin", "escrow-orders"] });
    },
    onError: (e) => toast({ title: "Error", description: e instanceof Error ? e.message : "Refund failed", variant: "destructive" }),
  });

  const orders = escrowOrders?.orders ?? [];
  const lockedMc = orders.filter(o => o.escrowStatus === "locked" && o.token === "MC").reduce((s, o) => s + parseFloat(o.cryptoAmount), 0);
  const lockedUsdt = orders.filter(o => o.escrowStatus === "locked" && o.token === "USDT").reduce((s, o) => s + parseFloat(o.cryptoAmount), 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2.5">
        <Shield className="text-primary" size={20} />
        <h1 className="text-xl font-semibold">Escrow Management</h1>
      </div>

      {/* Wallet info */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Lock size={16} className="text-muted-foreground" />
          <span className="text-sm font-semibold">Escrow Wallet</span>
          {escrowInfo?.configured
            ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Configured</span>
            : <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">Not configured</span>}
        </div>

        {escrowInfo?.escrowAddress ? (
          <div className="font-mono text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 break-all">
            {escrowInfo.escrowAddress}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Set <code className="bg-muted px-1 rounded">P2P_ESCROW_ADDRESS</code> and <code className="bg-muted px-1 rounded">P2P_ESCROW_PRIVATE_KEY</code> environment secrets to enable on-chain escrow.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="text-xs text-muted-foreground mb-1">Locked MC</div>
            <div className="text-lg font-bold text-foreground">{lockedMc.toFixed(4)} MC</div>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="text-xs text-muted-foreground mb-1">Locked USDT</div>
            <div className="text-lg font-bold text-foreground">{lockedUsdt.toFixed(4)} USDT</div>
          </div>
        </div>
      </div>

      {/* Orders table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <span className="text-sm font-semibold">Locked Escrow Orders</span>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["admin", "escrow-orders"] })}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading…</div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2 text-muted-foreground">
            <CheckCircle size={32} className="opacity-30" />
            <span className="text-sm">No locked escrow orders</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left px-4 py-3 font-medium">Amount</th>
                  <th className="text-left px-4 py-3 font-medium">Seller</th>
                  <th className="text-left px-4 py-3 font-medium">Buyer</th>
                  <th className="text-left px-4 py-3 font-medium">Escrow Status</th>
                  <th className="text-left px-4 py-3 font-medium">Order Status</th>
                  <th className="text-left px-4 py-3 font-medium">Locked At</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map(order => (
                  <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-semibold">
                      {parseFloat(order.cryptoAmount).toFixed(4)} {order.token}
                      <div className="text-xs text-muted-foreground font-normal">≈ {parseFloat(order.fiatAmount).toFixed(2)} USDT</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{shortAddr(order.sellerAddress)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{shortAddr(order.buyerAddress)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full border font-medium ${escrowStatusBadge(order.escrowStatus)}`}>
                        {order.escrowStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground capitalize">{order.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {order.escrowLockedAt ? new Date(order.escrowLockedAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {order.escrowStatus === "locked" && (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setConfirmId({ id: order.id, action: "release" })}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors font-medium"
                          >
                            <ArrowUpRight size={12} />Release
                          </button>
                          <button
                            onClick={() => setConfirmId({ id: order.id, action: "refund" })}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 transition-colors font-medium"
                          >
                            <ArrowDownRight size={12} />Refund
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation dialog */}
      {confirmId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className={confirmId.action === "release" ? "text-emerald-400" : "text-blue-400"} />
              <span className="font-semibold text-base capitalize">{confirmId.action} Escrow</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {confirmId.action === "release"
                ? "This will broadcast an on-chain transaction sending the locked funds to the buyer's wallet. This cannot be undone."
                : "This will refund the locked funds back to the seller's wallet."}
            </p>
            {confirmId.action === "refund" && (
              <div>
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide block mb-1.5">Reason</label>
                <input
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="e.g. Dispute resolved in seller's favour"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setConfirmId(null); setReason(""); }}
                className="flex-1 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={releaseMut.isPending || refundMut.isPending}
                onClick={() => {
                  if (confirmId.action === "release") releaseMut.mutate({ id: confirmId.id });
                  else refundMut.mutate({ id: confirmId.id, reason });
                }}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
                  confirmId.action === "release" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {(releaseMut.isPending || refundMut.isPending) ? "Processing…" : `Confirm ${confirmId.action}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
