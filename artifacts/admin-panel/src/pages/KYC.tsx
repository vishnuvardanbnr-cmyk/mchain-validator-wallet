import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, type Profile } from "@/lib/api";
import { BadgeCheck, XCircle, Clock, User, FileText } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

function statusBadge(status: Profile["kycStatus"]) {
  const map = {
    none: "bg-muted text-muted-foreground",
    pending: "bg-amber-500/15 text-amber-300",
    verified: "bg-emerald-500/15 text-emerald-300",
    rejected: "bg-red-500/15 text-red-400",
  };
  return map[status];
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}

export default function KYC() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"pending" | "all">("pending");

  const pendingQ = useQuery<Profile[]>({
    queryKey: ["admin", "kyc", "pending"],
    queryFn: () => get<Profile[]>("/kyc/pending"),
  });

  const allQ = useQuery<{ profiles: Profile[]; total: number }>({
    queryKey: ["admin", "profiles"],
    queryFn: () => get<{ profiles: Profile[]; total: number }>("/profiles"),
    enabled: tab === "all",
  });

  const approveMut = useMutation({
    mutationFn: (address: string) => post<Profile>(`/kyc/${address}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast({ title: "KYC approved", description: "User is now verified." });
    },
    onError: (e) => toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" }),
  });

  const rejectMut = useMutation({
    mutationFn: (address: string) => post<Profile>(`/kyc/${address}/reject`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast({ title: "KYC rejected", description: "Submission has been rejected." });
    },
    onError: (e) => toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" }),
  });

  const profiles = tab === "pending"
    ? (pendingQ.data ?? [])
    : (allQ.data?.profiles ?? []).filter(p => p.kycStatus !== "none");

  const loading = tab === "pending" ? pendingQ.isLoading : allQ.isLoading;
  const isPending = (addr: string) => approveMut.isPending || rejectMut.isPending;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-2.5 mb-6">
        <BadgeCheck size={20} className="text-primary" />
        <h1 className="text-lg font-semibold text-foreground">KYC Verification</h1>
      </div>

      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit mb-6">
        {(["pending", "all"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize
              ${tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t === "pending" ? "Pending Review" : "All KYC"}
            {t === "pending" && pendingQ.data && pendingQ.data.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs">
                {pendingQ.data.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Clock size={14} className="animate-spin" /> Loading…
        </div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-16">
          <BadgeCheck size={36} className="text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            {tab === "pending" ? "No pending KYC submissions" : "No KYC submissions found"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map(profile => (
            <div key={profile.id} className="bg-card border border-card-border rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
                    <User size={18} className="text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground text-sm">{profile.displayName}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(profile.kycStatus)}`}>
                        {profile.kycStatus}
                      </span>
                      {profile.isMerchant && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-primary/15 text-primary font-medium">
                          Merchant
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">{shortAddr(profile.mxcAddress)}</p>
                  </div>
                </div>

                {profile.kycStatus === "pending" && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => approveMut.mutate(profile.mxcAddress)}
                      disabled={isPending(profile.mxcAddress)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50 text-sm font-medium transition-colors"
                    >
                      <BadgeCheck size={14} />
                      Approve
                    </button>
                    <button
                      onClick={() => rejectMut.mutate(profile.mxcAddress)}
                      disabled={isPending(profile.mxcAddress)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50 text-sm font-medium transition-colors"
                    >
                      <XCircle size={14} />
                      Reject
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Full name</p>
                  <p className="text-sm text-foreground">{profile.kycName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Document type</p>
                  <p className="text-sm text-foreground capitalize">{profile.kycDocType?.replace(/_/g, " ") ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Submitted</p>
                  <p className="text-sm text-foreground">
                    {profile.kycSubmittedAt
                      ? new Date(profile.kycSubmittedAt).toLocaleDateString()
                      : "—"}
                  </p>
                </div>
                {profile.kycStatus === "verified" && profile.kycVerifiedAt && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Verified on</p>
                    <p className="text-sm text-foreground">{new Date(profile.kycVerifiedAt).toLocaleDateString()}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Trades</p>
                  <p className="text-sm text-foreground">{profile.completedTrades}/{profile.totalTrades}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Avg rating</p>
                  <p className="text-sm text-foreground">{Number(profile.avgRating).toFixed(1)} ★</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
