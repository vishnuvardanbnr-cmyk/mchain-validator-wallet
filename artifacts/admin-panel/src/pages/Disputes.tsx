import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, type Dispute } from "@/lib/api";
import { AlertTriangle, Clock, CheckCircle } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const REASON_LABELS: Record<string, string> = {
  payment_not_received: "Payment not received",
  payment_received_but_not_released: "Payment received, crypto not released",
  wrong_amount: "Wrong amount",
  other: "Other",
};

function shortAddr(addr: string) {
  return `${addr.slice(0, 8)}…${addr.slice(-5)}`;
}

function statusBadge(status: string) {
  if (status === "open") return "bg-red-500/15 text-red-400";
  if (status === "resolved_buyer") return "bg-emerald-500/15 text-emerald-400";
  if (status === "resolved_seller") return "bg-blue-500/15 text-blue-400";
  return "bg-muted text-muted-foreground";
}

function statusLabel(status: string) {
  if (status === "open") return "Open";
  if (status === "resolved_buyer") return "Resolved — Buyer";
  if (status === "resolved_seller") return "Resolved — Seller";
  return status;
}

export default function Disputes() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"open" | "all">("open");
  const [resolving, setResolving] = useState<string | null>(null);
  const [form, setForm] = useState({ resolution: "", resolvedFor: "buyer" as "buyer" | "seller" });

  const { data, isLoading } = useQuery<Dispute[]>({
    queryKey: ["admin", "disputes", tab],
    queryFn: () => get<Dispute[]>(`/disputes?status=${tab}`),
  });

  const resolveMut = useMutation({
    mutationFn: ({ id, resolution, resolvedFor }: { id: string; resolution: string; resolvedFor: "buyer" | "seller" }) =>
      post(`/disputes/${id}/resolve`, { resolution, resolvedFor }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      setResolving(null);
      setForm({ resolution: "", resolvedFor: "buyer" });
      toast({ title: "Dispute resolved", description: "The order has been marked resolved." });
    },
    onError: (e) => toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" }),
  });

  function openResolvePanel(id: string) {
    setResolving(resolving === id ? null : id);
    setForm({ resolution: "", resolvedFor: "buyer" });
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-2.5 mb-6">
        <AlertTriangle size={20} className="text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Disputes</h1>
      </div>

      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit mb-6">
        {(["open", "all"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize
              ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t === "open" ? "Open Disputes" : "All Disputes"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Clock size={14} className="animate-spin" /> Loading…
        </div>
      ) : !data?.length ? (
        <div className="text-center py-16">
          <CheckCircle size={36} className="text-emerald-500/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            {tab === "open" ? "No open disputes 🎉" : "No disputes found"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.map(({ dispute, order }) => (
            <div key={dispute.id} className="bg-card border border-card-border rounded-xl overflow-hidden">
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(dispute.status)}`}>
                        {statusLabel(dispute.status)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(dispute.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="text-sm font-medium text-foreground">{REASON_LABELS[dispute.reason] ?? dispute.reason}</p>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{dispute.description}</p>
                  </div>

                  {dispute.status === "open" && (
                    <button
                      onClick={() => openResolvePanel(dispute.id)}
                      className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 text-sm font-medium transition-colors"
                    >
                      Resolve
                    </button>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-background/60 rounded-lg">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Buyer</p>
                    <p className="text-xs text-foreground font-mono">{shortAddr(order.buyerAddress)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Seller</p>
                    <p className="text-xs text-foreground font-mono">{shortAddr(order.sellerAddress)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Amount</p>
                    <p className="text-xs text-foreground">{Number(order.cryptoAmount).toFixed(4)} {order.token}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Opened by</p>
                    <p className="text-xs text-foreground font-mono">{shortAddr(dispute.openedBy)}</p>
                  </div>
                </div>

                {dispute.status !== "open" && dispute.resolution && (
                  <div className="mt-3 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                    <p className="text-xs text-muted-foreground mb-0.5">Resolution</p>
                    <p className="text-sm text-foreground">{dispute.resolution}</p>
                  </div>
                )}
              </div>

              {resolving === dispute.id && (
                <div className="border-t border-card-border p-5 bg-background/40">
                  <p className="text-sm font-medium text-foreground mb-3">Resolve dispute</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1.5">Resolve in favour of</label>
                      <div className="flex gap-2">
                        {(["buyer", "seller"] as const).map(side => (
                          <button
                            key={side}
                            onClick={() => setForm(f => ({ ...f, resolvedFor: side }))}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize
                              ${form.resolvedFor === side
                                ? "bg-primary text-primary-foreground"
                                : "bg-card border border-card-border text-foreground hover:bg-card/80"
                              }`}
                          >
                            {side} ({side === "buyer" ? shortAddr(order.buyerAddress) : shortAddr(order.sellerAddress)})
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1.5">Resolution note</label>
                      <textarea
                        value={form.resolution}
                        onChange={e => setForm(f => ({ ...f, resolution: e.target.value }))}
                        placeholder="Explain the resolution decision…"
                        rows={3}
                        className="w-full px-3 py-2 bg-card border border-card-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => resolveMut.mutate({ id: dispute.id, ...form })}
                        disabled={!form.resolution.trim() || resolveMut.isPending}
                        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                      >
                        {resolveMut.isPending ? "Resolving…" : "Confirm resolution"}
                      </button>
                      <button
                        onClick={() => setResolving(null)}
                        className="px-4 py-2 rounded-lg bg-card border border-card-border text-foreground text-sm hover:bg-card/80 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
