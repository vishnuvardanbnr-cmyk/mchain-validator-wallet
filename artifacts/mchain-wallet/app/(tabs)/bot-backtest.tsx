import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getPublicApiBase } from "@/services/api";

const D = {
  bg: "#0a0a0f", card: "#12121a", card2: "#1a1a26", border: "#2a2a3a",
  primary: "#6c63ff", green: "#00d97e", red: "#ff4560",
  yellow: "#ffc107", muted: "#888", text: "#f0f0f0", sub: "#aaa",
  orange: "#ff8c00", teal: "#00bcd4", purple2: "#9c27b0",
};

// ── Types ──────────────────────────────────────────────────────────────────────
interface MonthlyStat { month: string; trades: number; wins: number; losses: number; pnl: number; }
interface HourStat    { hour: number; trades: number; wins: number; winRate: number; }
interface ConfStat    { range: string; trades: number; wins: number; winRate: number; }
interface EquityPoint { epoch: number; balance: number; }
interface MartingaleStat {
  grossPnl: number; maxDrawdown: number;
  maxStakeUsed: number; longestLossStreak: number;
  monthly: MonthlyStat[]; equity: EquityPoint[];
}
interface AssetResult {
  asset: string; totalCandles: number; signalsFired: number;
  newsFiltered: number; spikeFiltered: number; trades: number;
  wins: number; losses: number; winRate: number;
  grossPnl: number; maxDrawdown: number;
  byHour: HourStat[]; byConfidence: ConfStat[];
  monthly: MonthlyStat[]; equity: EquityPoint[];
  martingale: MartingaleStat;
}
interface Combined {
  trades: number; wins: number; losses: number; winRate: number;
  grossPnl: number; maxDrawdown: number;
  newsFiltered: number; spikeFiltered: number; signalsFired: number;
  martingale: { grossPnl: number; maxDrawdown: number; maxStakeUsed: number; longestLossStreak: number; };
}
interface BacktestRun {
  id: string; status: string; months: number;
  progress: number; message: string | null;
  results: { combined: Combined; assets: AssetResult[] } | null;
  createdAt: string; finishedAt: string | null;
}

// ── Equity spark line ──────────────────────────────────────────────────────────
function EquitySpark({ points, color, w = 100, h = 36 }: { points: EquityPoint[]; color: string; w?: number; h?: number }) {
  if (points.length < 2) return <View style={{ width: w, height: h }} />;
  const vals  = points.map(p => p.balance);
  const min   = Math.min(...vals);
  const max   = Math.max(...vals);
  const range = max - min || 1;
  const xs    = points.map((_, i) => (i / (points.length - 1)) * w);
  const ys    = vals.map(v => h - ((v - min) / range) * h);
  const d     = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const { Svg, Path } = require("react-native-svg") as typeof import("react-native-svg");
  return (
    <Svg width={w} height={h}>
      <Path d={d} stroke={color} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

// ── Progress ring ─────────────────────────────────────────────────────────────
function ProgressRing({ pct }: { pct: number }) {
  const R = 28, C = 2 * Math.PI * R;
  const offset = C - (pct / 100) * C;
  const { Svg, Circle } = require("react-native-svg") as typeof import("react-native-svg");
  return (
    <View style={{ alignItems: "center", justifyContent: "center", width: 80, height: 80 }}>
      <Svg width={80} height={80} style={{ position: "absolute" }}>
        <Circle cx={40} cy={40} r={R} stroke={D.border} strokeWidth={5} fill="none" />
        <Circle cx={40} cy={40} r={R} stroke={D.primary} strokeWidth={5} fill="none"
          strokeDasharray={`${C}`} strokeDashoffset={`${offset}`}
          strokeLinecap="round" transform="rotate(-90 40 40)" />
      </Svg>
      <Text style={{ color: D.text, fontSize: 16, fontWeight: "700" }}>{pct}%</Text>
    </View>
  );
}

// ── Bar row ───────────────────────────────────────────────────────────────────
function BarRow({ label, value, max, color, suffix = "%" }: {
  label: string; value: number; max: number; color: string; suffix?: string;
}) {
  const pct = max > 0 ? (Math.abs(value) / Math.abs(max)) * 100 : 0;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.barValue, { color }]}>{value}{suffix}</Text>
    </View>
  );
}

// ── Monthly comparison row ────────────────────────────────────────────────────
function MonthCmpRow({ std, mg }: { std: MonthlyStat; mg?: MonthlyStat }) {
  const label = new Date(std.month + "-01").toLocaleString("en", { month: "short", year: "2-digit" });
  const stdPos = std.pnl >= 0;
  const mgPos  = (mg?.pnl ?? 0) >= 0;
  return (
    <View style={styles.monthRow}>
      <Text style={styles.monthLabel}>{label}</Text>
      <Text style={[styles.monthCell, { color: stdPos ? D.green : D.red }]}>
        {stdPos ? "+" : ""}${std.pnl.toFixed(0)}
      </Text>
      <Text style={[styles.monthCell, { color: mgPos ? D.green : D.red, fontWeight: "700" }]}>
        {mgPos ? "+" : ""}${(mg?.pnl ?? 0).toFixed(0)}
      </Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function BotBacktestScreen() {
  const insets   = useSafeAreaInsets();
  const [run, setRun]         = useState<BacktestRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [months, setMonths]   = useState(6);
  const [tab, setTab]         = useState<"compare" | "hours" | "monthly" | "confidence">("compare");
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const fetchLatest = useCallback(async () => {
    try {
      const r    = await fetch(`${getPublicApiBase()}/bot/backtest/latest`);
      const data = await r.json() as BacktestRun | null;
      setRun(data);
      if (data?.status === "done" || data?.status === "error") {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
      }
    } catch (_) {}
    setLoading(false);
  }, [fadeAnim]);

  useEffect(() => {
    fetchLatest();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchLatest]);

  const startRun = async () => {
    setStarting(true);
    fadeAnim.setValue(0);
    try {
      const r = await fetch(`${getPublicApiBase()}/bot/backtest/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months }),
      });
      const data = await r.json() as { runId?: string };
      if (data.runId) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(fetchLatest, 3000);
        await fetchLatest();
      }
    } catch (_) {}
    setStarting(false);
  };

  const isRunning = run?.status === "running";
  useEffect(() => {
    if (isRunning && !pollRef.current) pollRef.current = setInterval(fetchLatest, 3000);
    return () => { if (!isRunning && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [isRunning, fetchLatest]);

  const combined = run?.results?.combined;
  const assets   = run?.results?.assets ?? [];
  const mg       = combined?.martingale;

  // ── Comparison overview ──────────────────────────────────────────────────────
  const renderCompare = () => {
    if (!combined || !mg) return null;
    const stdPos = combined.grossPnl >= 0;
    const mgPos  = mg.grossPnl >= 0;
    const wr     = combined.winRate;
    const wrColor = wr >= 60 ? D.green : wr >= 50 ? D.yellow : D.red;

    return (
      <>
        {/* Win rate banner */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Signal Quality — {combined.trades.toLocaleString()} trades</Text>
          <View style={styles.wrRow}>
            <View style={styles.wrBox}>
              <Text style={[styles.wrBig, { color: wrColor }]}>{wr}%</Text>
              <Text style={styles.wrSub}>Win Rate</Text>
            </View>
            <View style={[styles.wrBox, { flex: 2 }]}>
              <Text style={styles.wrDetail}>{combined.wins}W / {combined.losses}L</Text>
              <Text style={styles.wrDetail}>News skipped: {combined.newsFiltered.toLocaleString()}</Text>
              <Text style={styles.wrDetail}>Spike skipped: {combined.spikeFiltered.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* Side-by-side comparison */}
        <View style={styles.cmpHeader}>
          <View style={styles.cmpCol}>
            <Text style={styles.cmpTitle}>📊 Fixed $5</Text>
            <Text style={styles.cmpSubtitle}>Standard strategy</Text>
          </View>
          <View style={styles.cmpDivider} />
          <View style={styles.cmpCol}>
            <Text style={styles.cmpTitle}>⚡ Martingale</Text>
            <Text style={styles.cmpSubtitle}>$5 base, max $640</Text>
          </View>
        </View>

        <View style={styles.cmpRow}>
          <View style={styles.cmpCell}>
            <Text style={[styles.cmpVal, { color: stdPos ? D.green : D.red }]}>
              {stdPos ? "+" : ""}${combined.grossPnl.toFixed(2)}
            </Text>
            <Text style={styles.cmpLbl}>Gross P&L</Text>
          </View>
          <View style={styles.cmpDivider} />
          <View style={styles.cmpCell}>
            <Text style={[styles.cmpVal, { color: mgPos ? D.green : D.red, fontSize: 20 }]}>
              {mgPos ? "+" : ""}${mg.grossPnl.toFixed(2)}
            </Text>
            <Text style={styles.cmpLbl}>Gross P&L</Text>
          </View>
        </View>

        <View style={styles.cmpRow}>
          <View style={styles.cmpCell}>
            <Text style={[styles.cmpVal, { color: D.red, fontSize: 16 }]}>
              -${combined.maxDrawdown.toFixed(2)}
            </Text>
            <Text style={styles.cmpLbl}>Max Drawdown</Text>
          </View>
          <View style={styles.cmpDivider} />
          <View style={styles.cmpCell}>
            <Text style={[styles.cmpVal, { color: D.red, fontSize: 16 }]}>
              -${mg.maxDrawdown.toFixed(2)}
            </Text>
            <Text style={styles.cmpLbl}>Max Drawdown</Text>
          </View>
        </View>

        <View style={styles.cmpRow}>
          <View style={styles.cmpCell}>
            <Text style={[styles.cmpVal, { color: D.sub, fontSize: 16 }]}>$5.00</Text>
            <Text style={styles.cmpLbl}>Max stake used</Text>
          </View>
          <View style={styles.cmpDivider} />
          <View style={styles.cmpCell}>
            <Text style={[styles.cmpVal, { color: D.orange, fontSize: 16 }]}>${mg.maxStakeUsed}</Text>
            <Text style={styles.cmpLbl}>Max stake used</Text>
          </View>
        </View>

        <View style={[styles.cmpRow, { marginBottom: 12 }]}>
          <View style={styles.cmpCell}>
            <Text style={[styles.cmpVal, { color: D.sub, fontSize: 16 }]}>—</Text>
            <Text style={styles.cmpLbl}>Longest loss run</Text>
          </View>
          <View style={styles.cmpDivider} />
          <View style={styles.cmpCell}>
            <Text style={[styles.cmpVal, { color: D.red, fontSize: 16 }]}>{mg.longestLossStreak} in a row</Text>
            <Text style={styles.cmpLbl}>Longest loss run</Text>
          </View>
        </View>

        {/* Equity sparks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Equity Curves (per asset)</Text>
          {assets.map(a => (
            <View key={a.asset} style={styles.equityRow}>
              <Text style={styles.equityLabel}>{a.asset === "GOLD" ? "🥇 GOLD" : "💶 EURUSD"}</Text>
              <View style={styles.sparkPair}>
                <View style={styles.sparkBox}>
                  <Text style={styles.sparkTag}>Fixed $5</Text>
                  <EquitySpark points={a.equity} color={a.grossPnl >= 0 ? D.green : D.red} w={110} h={40} />
                  <Text style={[styles.sparkPnl, { color: a.grossPnl >= 0 ? D.green : D.red }]}>
                    {a.grossPnl >= 0 ? "+" : ""}${a.grossPnl.toFixed(0)}
                  </Text>
                </View>
                <View style={styles.sparkBox}>
                  <Text style={styles.sparkTag}>Martingale</Text>
                  <EquitySpark points={a.martingale.equity} color={a.martingale.grossPnl >= 0 ? D.teal : D.orange} w={110} h={40} />
                  <Text style={[styles.sparkPnl, { color: a.martingale.grossPnl >= 0 ? D.teal : D.orange }]}>
                    {a.martingale.grossPnl >= 0 ? "+" : ""}${a.martingale.grossPnl.toFixed(0)}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Risk warning */}
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>⚠️ Martingale Risk</Text>
          <Text style={styles.warnText}>
            With 85% payout and a 50% win rate, martingale actually
            <Text style={{ color: D.red }}> increases losses</Text> after 3+ consecutive
            losing trades. A run of {mg.longestLossStreak} losses occurred in this period.
            {"\n\n"}At $5 base stake, {mg.longestLossStreak} losses would require
            a ${(5 * Math.pow(2, Math.min(mg.longestLossStreak, 7))).toFixed(0)} stake to recover —
            and with 85% payout that still results in a net loss.
            {"\n\n"}The win rate must be above ~54% to make martingale profitable here.
          </Text>
        </View>
      </>
    );
  };

  // ── Monthly comparison ────────────────────────────────────────────────────────
  const renderMonthly = () => {
    const monthMap: Record<string, { std: MonthlyStat; mg: MonthlyStat }> = {};
    assets.forEach(a => {
      a.monthly.forEach(m => {
        if (!monthMap[m.month]) monthMap[m.month] = {
          std: { month: m.month, trades: 0, wins: 0, losses: 0, pnl: 0 },
          mg:  { month: m.month, trades: 0, wins: 0, losses: 0, pnl: 0 },
        };
        monthMap[m.month].std.trades += m.trades;
        monthMap[m.month].std.wins   += m.wins;
        monthMap[m.month].std.losses += m.losses;
        monthMap[m.month].std.pnl   += m.pnl;
      });
      a.martingale.monthly.forEach(m => {
        if (!monthMap[m.month]) monthMap[m.month] = {
          std: { month: m.month, trades: 0, wins: 0, losses: 0, pnl: 0 },
          mg:  { month: m.month, trades: 0, wins: 0, losses: 0, pnl: 0 },
        };
        monthMap[m.month].mg.trades += m.trades;
        monthMap[m.month].mg.wins   += m.wins;
        monthMap[m.month].mg.losses += m.losses;
        monthMap[m.month].mg.pnl   += m.pnl;
      });
    });
    const months = Object.values(monthMap).sort((a, b) => a.std.month.localeCompare(b.std.month));

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Monthly P&L Comparison</Text>
        <View style={styles.monthHeader}>
          <Text style={[styles.monthLabel, { color: D.muted }]}>Month</Text>
          <Text style={[styles.monthCell, { color: D.primary }]}>Fixed $5</Text>
          <Text style={[styles.monthCell, { color: D.teal }]}>Martingale</Text>
        </View>
        {months.map(m => <MonthCmpRow key={m.std.month} std={m.std} mg={m.mg} />)}
        <View style={[styles.monthRow, { borderTopWidth: 1, borderTopColor: D.border, marginTop: 4, paddingTop: 8 }]}>
          <Text style={[styles.monthLabel, { color: D.text, fontWeight: "700" }]}>Total</Text>
          <Text style={[styles.monthCell, { color: combined?.grossPnl ?? 0 >= 0 ? D.green : D.red, fontWeight: "700" }]}>
            {(combined?.grossPnl ?? 0) >= 0 ? "+" : ""}${(combined?.grossPnl ?? 0).toFixed(0)}
          </Text>
          <Text style={[styles.monthCell, { color: (mg?.grossPnl ?? 0) >= 0 ? D.green : D.red, fontWeight: "700" }]}>
            {(mg?.grossPnl ?? 0) >= 0 ? "+" : ""}${(mg?.grossPnl ?? 0).toFixed(0)}
          </Text>
        </View>
      </View>
    );
  };

  // ── Hours ────────────────────────────────────────────────────────────────────
  const renderHours = () => {
    const hourMap: Record<number, { wins: number; losses: number }> = {};
    assets.forEach(a => a.byHour.forEach(h => {
      if (!hourMap[h.hour]) hourMap[h.hour] = { wins: 0, losses: 0 };
      hourMap[h.hour].wins += h.wins;
      hourMap[h.hour].losses += h.trades - h.wins;
    }));
    const hours = Object.entries(hourMap)
      .map(([h, v]) => ({
        hour: parseInt(h), trades: v.wins + v.losses, wins: v.wins,
        winRate: v.wins + v.losses > 0 ? Math.round(v.wins / (v.wins + v.losses) * 100) : 0,
      }))
      .filter(h => h.trades > 0)
      .sort((a, b) => a.hour - b.hour);
    const maxWr = Math.max(...hours.map(h => h.winRate), 1);
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Best Hours to Trade (UTC)</Text>
        <View style={styles.newsNote}>
          <Text style={styles.newsNoteText}>⚡ News windows automatically excluded (13:20–14:10, 12:40–13:05, 11:55–12:25 UTC)</Text>
        </View>
        {hours.map(h => (
          <BarRow key={h.hour}
            label={`${String(h.hour).padStart(2, "0")}:00`}
            value={h.winRate} max={maxWr}
            color={h.winRate >= 65 ? D.green : h.winRate >= 55 ? D.yellow : D.red}
            suffix={`% (${h.trades}t)`}
          />
        ))}
      </View>
    );
  };

  // ── Confidence ────────────────────────────────────────────────────────────────
  const renderConfidence = () => {
    const confMap: Record<string, { wins: number; losses: number }> = {};
    assets.forEach(a => a.byConfidence.forEach(c => {
      if (!confMap[c.range]) confMap[c.range] = { wins: 0, losses: 0 };
      confMap[c.range].wins   += c.wins;
      confMap[c.range].losses += c.trades - c.wins;
    }));
    const buckets = ["75–79", "80–84", "85–89", "90+"]
      .map(r => ({ range: r, ...confMap[r] ?? { wins: 0, losses: 0 } }))
      .map(b => ({ ...b, trades: b.wins + b.losses, winRate: b.wins + b.losses > 0 ? Math.round(b.wins / (b.wins + b.losses) * 100) : 0 }));
    const maxWr = Math.max(...buckets.map(b => b.winRate), 1);
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Win Rate by Signal Confidence</Text>
        <Text style={[styles.sub, { marginBottom: 12 }]}>Raise threshold to 82%+ to improve results</Text>
        {buckets.map(b => (
          <View key={b.range} style={{ marginBottom: 10 }}>
            <BarRow label={`${b.range}%`} value={b.winRate} max={maxWr}
              color={b.winRate >= 65 ? D.green : b.winRate >= 55 ? D.yellow : D.red} suffix="% WR" />
            <Text style={[styles.sub, { marginTop: 2, marginLeft: 60 }]}>{b.trades} trades</Text>
          </View>
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={D.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: D.bg }]}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 80 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={fetchLatest} tintColor={D.primary} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>📊 Backtest</Text>
        <Text style={styles.subtitle}>Fixed $5 vs Martingale — news-filtered</Text>
      </View>

      {/* Run control */}
      <View style={styles.runCard}>
        <Text style={styles.runLabel}>Backtest period</Text>
        <View style={styles.monthPicker}>
          {[1, 3, 6, 12].map(m => (
            <Pressable key={m} style={[styles.monthBtn, months === m && styles.monthBtnActive]}
              onPress={() => setMonths(m)}>
              <Text style={[styles.monthBtnText, months === m && styles.monthBtnTextActive]}>{m}m</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={[styles.runBtn, (isRunning || starting) && styles.runBtnDisabled]}
          onPress={startRun} disabled={isRunning || starting}>
          {isRunning || starting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.runBtnText}>▶  Run Backtest</Text>
          }
        </Pressable>
      </View>

      {/* Progress */}
      {isRunning && run && (
        <View style={styles.progressCard}>
          <ProgressRing pct={run.progress} />
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={styles.progressTitle}>Running backtest…</Text>
            <Text style={styles.progressMsg}>{run.message ?? "Initialising…"}</Text>
            <Text style={styles.progressSub}>{run.months}m  •  GOLD + EUR/USD  •  Fixed vs Martingale</Text>
          </View>
        </View>
      )}

      {run?.status === "error" && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>⚠ {run.message}</Text>
        </View>
      )}

      {/* Results */}
      {run?.status === "done" && combined && (
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Summary banner */}
          <View style={styles.summaryBanner}>
            <View>
              <Text style={styles.summaryTitle}>{run.months}-Month Results</Text>
              <Text style={styles.summarySub}>
                {new Date(run.finishedAt!).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.summaryWr, { color: combined.winRate >= 60 ? D.green : combined.winRate >= 50 ? D.yellow : D.red }]}>
                {combined.winRate}%
              </Text>
              <Text style={styles.summarySub}>Signal WR</Text>
            </View>
          </View>

          {/* Tab bar */}
          <View style={styles.tabBar}>
            {(["compare", "monthly", "hours", "confidence"] as const).map(t => (
              <Pressable key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                  {t === "compare" ? "Compare" : t === "monthly" ? "Monthly" : t === "hours" ? "Hours" : "Confidence"}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === "compare"    && renderCompare()}
          {tab === "monthly"    && renderMonthly()}
          {tab === "hours"      && renderHours()}
          {tab === "confidence" && renderConfidence()}
        </Animated.View>
      )}

      {!run && !loading && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📈</Text>
          <Text style={styles.emptyTitle}>No backtest yet</Text>
          <Text style={styles.emptySub}>Run a backtest to compare Fixed $5 vs Martingale strategy over real historical data.</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: D.bg },
  header: { paddingHorizontal: 16, marginBottom: 12 },
  title:  { color: D.text, fontSize: 20, fontWeight: "700" },
  subtitle: { color: D.muted, fontSize: 12, marginTop: 2 },
  sub:    { color: D.sub, fontSize: 11 },

  runCard: { margin: 12, backgroundColor: D.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: D.border },
  runLabel: { color: D.sub, fontSize: 12, marginBottom: 8 },
  monthPicker: { flexDirection: "row", marginBottom: 12, gap: 8 },
  monthBtn:    { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8, backgroundColor: D.card2, borderWidth: 1, borderColor: D.border },
  monthBtnActive: { backgroundColor: D.primary, borderColor: D.primary },
  monthBtnText:   { color: D.muted, fontSize: 13, fontWeight: "600" },
  monthBtnTextActive: { color: "#fff" },
  runBtn:    { backgroundColor: D.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  runBtnDisabled: { backgroundColor: "#44404a" },
  runBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  progressCard: { margin: 12, backgroundColor: D.card, borderRadius: 12, padding: 16, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: D.border },
  progressTitle: { color: D.text, fontWeight: "700", fontSize: 14 },
  progressMsg:   { color: D.primary, fontSize: 12, marginTop: 4 },
  progressSub:   { color: D.muted, fontSize: 11, marginTop: 2 },

  errorCard: { margin: 12, backgroundColor: "#1f0a0a", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: D.red },
  errorText: { color: D.red, fontSize: 13 },

  summaryBanner: { margin: 12, backgroundColor: D.card2, borderRadius: 12, padding: 16, flexDirection: "row", justifyContent: "space-between", borderWidth: 1, borderColor: D.border },
  summaryTitle: { color: D.text, fontSize: 16, fontWeight: "700" },
  summarySub:   { color: D.muted, fontSize: 11, marginTop: 3 },
  summaryWr:    { fontSize: 28, fontWeight: "800" },

  tabBar:      { flexDirection: "row", marginHorizontal: 12, marginBottom: 4, backgroundColor: D.card, borderRadius: 10, borderWidth: 1, borderColor: D.border, overflow: "hidden" },
  tabBtn:      { flex: 1, paddingVertical: 9, alignItems: "center" },
  tabBtnActive:{ backgroundColor: D.primary },
  tabText:     { color: D.muted, fontSize: 11, fontWeight: "600" },
  tabTextActive: { color: "#fff" },

  section:      { margin: 12, backgroundColor: D.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: D.border },
  sectionTitle: { color: D.text, fontSize: 13, fontWeight: "700", marginBottom: 10 },

  wrRow:  { flexDirection: "row", gap: 12 },
  wrBox:  { flex: 1, backgroundColor: D.card2, borderRadius: 8, padding: 10, alignItems: "center" },
  wrBig:  { fontSize: 28, fontWeight: "800" },
  wrSub:  { color: D.muted, fontSize: 11, marginTop: 2 },
  wrDetail: { color: D.sub, fontSize: 11, marginBottom: 2 },

  cmpHeader: { flexDirection: "row", marginHorizontal: 12, marginTop: 4, marginBottom: 0, backgroundColor: D.card2, borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: 12, borderWidth: 1, borderColor: D.border, borderBottomWidth: 0 },
  cmpRow:    { flexDirection: "row", marginHorizontal: 12, backgroundColor: D.card, borderWidth: 1, borderColor: D.border, borderTopWidth: 0, paddingVertical: 12 },
  cmpCol:    { flex: 1, alignItems: "center" },
  cmpCell:   { flex: 1, alignItems: "center", paddingVertical: 4 },
  cmpDivider:{ width: 1, backgroundColor: D.border },
  cmpTitle:  { color: D.text, fontSize: 15, fontWeight: "700" },
  cmpSubtitle:{ color: D.muted, fontSize: 11, marginTop: 2 },
  cmpVal:    { fontSize: 22, fontWeight: "700" },
  cmpLbl:    { color: D.muted, fontSize: 10, marginTop: 2 },

  equityRow: { marginBottom: 12 },
  equityLabel: { color: D.sub, fontSize: 12, marginBottom: 6 },
  sparkPair: { flexDirection: "row", gap: 12 },
  sparkBox:  { flex: 1, backgroundColor: D.card2, borderRadius: 8, padding: 8, alignItems: "center" },
  sparkTag:  { color: D.muted, fontSize: 10, marginBottom: 4 },
  sparkPnl:  { fontSize: 11, fontWeight: "600", marginTop: 4 },

  warnBox:  { margin: 12, backgroundColor: "#1a1000", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#ff8c0033" },
  warnTitle: { color: D.orange, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  warnText:  { color: "#ccc", fontSize: 12, lineHeight: 18 },

  barRow:   { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  barLabel: { color: D.sub, fontSize: 11, width: 52 },
  barTrack: { flex: 1, height: 8, backgroundColor: D.card2, borderRadius: 4, overflow: "hidden", marginHorizontal: 6 },
  barFill:  { height: "100%", borderRadius: 4 },
  barValue: { fontSize: 11, width: 76, textAlign: "right" },

  monthHeader: { flexDirection: "row", marginBottom: 6 },
  monthRow:    { flexDirection: "row", alignItems: "center", paddingVertical: 5 },
  monthLabel:  { color: D.sub, fontSize: 12, width: 48 },
  monthCell:   { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "500" },

  newsNote:     { backgroundColor: "#1a1a10", borderRadius: 8, padding: 8, marginBottom: 10, borderWidth: 1, borderColor: "#333320" },
  newsNoteText: { color: D.yellow, fontSize: 11 },

  emptyState: { alignItems: "center", paddingTop: 60, paddingHorizontal: 40 },
  emptyIcon:  { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: D.text, fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptySub:   { color: D.muted, fontSize: 13, textAlign: "center", lineHeight: 20 },
});
