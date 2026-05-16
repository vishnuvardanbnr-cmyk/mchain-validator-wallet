import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, put, type VolumeTiers } from "@/lib/api";
import { Settings as SettingsIcon, Trophy, Save, RotateCcw } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_TIERS: VolumeTiers = { bronze: 10, silver: 50, gold: 100, platinum: 500 };

const TIER_META: { key: keyof VolumeTiers; emoji: string; label: string; color: string }[] = [
  { key: "bronze",   emoji: "🥉", label: "Bronze",   color: "text-amber-500" },
  { key: "silver",   emoji: "🥈", label: "Silver",   color: "text-slate-300" },
  { key: "gold",     emoji: "🥇", label: "Gold",     color: "text-yellow-300" },
  { key: "platinum", emoji: "💎", label: "Platinum", color: "text-cyan-300" },
];

export default function Settings() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<VolumeTiers>({
    queryKey: ["admin", "settings", "volume-tiers"],
    queryFn: () => get<VolumeTiers>("/settings/volume-tiers"),
  });

  const [tiers, setTiers] = useState<VolumeTiers>(DEFAULT_TIERS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setTiers(data);
      setDirty(false);
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: (values: VolumeTiers) => put<VolumeTiers>("/settings/volume-tiers", values),
    onSuccess: (saved) => {
      qc.setQueryData(["admin", "settings", "volume-tiers"], saved);
      setDirty(false);
      toast({ title: "Settings saved", description: "Volume tier thresholds updated." });
    },
    onError: (e) => toast({
      title: "Invalid thresholds",
      description: e instanceof Error ? e.message : "Failed",
      variant: "destructive",
    }),
  });

  function handleChange(key: keyof VolumeTiers, raw: string) {
    const val = parseInt(raw, 10);
    if (!isNaN(val)) {
      setTiers(prev => ({ ...prev, [key]: val }));
      setDirty(true);
    }
  }

  function handleReset() {
    setTiers(data ?? DEFAULT_TIERS);
    setDirty(false);
  }

  const validationError = (() => {
    if (tiers.bronze < 1) return "Bronze must be at least 1";
    if (tiers.silver <= tiers.bronze) return "Silver must be greater than Bronze";
    if (tiers.gold <= tiers.silver) return "Gold must be greater than Silver";
    if (tiers.platinum <= tiers.gold) return "Platinum must be greater than Gold";
    return null;
  })();

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-2.5 mb-8">
        <SettingsIcon size={20} className="text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <Trophy size={16} className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Volume Tier Thresholds</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-6">
          Set the minimum number of completed trades required for each tier badge. Must be strictly increasing.
        </p>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-4">
            {TIER_META.map(({ key, emoji, label, color }) => (
              <div key={key} className="flex items-center gap-4">
                <div className="w-28 flex items-center gap-2">
                  <span className="text-lg">{emoji}</span>
                  <span className={`text-sm font-semibold ${color}`}>{label}</span>
                </div>
                <div className="flex-1">
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      value={tiers[key]}
                      onChange={e => handleChange(key, e.target.value)}
                      className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                      trades
                    </span>
                  </div>
                </div>
                <div className="w-40 text-xs text-muted-foreground">
                  {key === "bronze" && `≥ ${tiers.bronze} trades`}
                  {key === "silver" && `≥ ${tiers.silver} trades`}
                  {key === "gold"   && `≥ ${tiers.gold} trades`}
                  {key === "platinum" && `≥ ${tiers.platinum} trades`}
                </div>
              </div>
            ))}

            {validationError && (
              <p className="text-xs text-red-400 mt-2">{validationError}</p>
            )}

            <div className="flex items-center gap-3 pt-4 border-t border-border mt-2">
              <button
                onClick={() => saveMut.mutate(tiers)}
                disabled={!dirty || !!validationError || saveMut.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors"
              >
                <Save size={14} />
                {saveMut.isPending ? "Saving…" : "Save Changes"}
              </button>
              {dirty && (
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
                >
                  <RotateCcw size={14} />
                  Reset
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 bg-card border border-card-border rounded-xl p-5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Current Tier Preview</h3>
        <div className="grid grid-cols-2 gap-2">
          {TIER_META.map(({ key, emoji, label, color }) => (
            <div key={key} className="flex items-center justify-between bg-background rounded-lg px-4 py-3 border border-border">
              <span className="flex items-center gap-2 text-sm">
                <span>{emoji}</span>
                <span className={`font-medium ${color}`}>{label}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {tiers[key]}+ trades
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
