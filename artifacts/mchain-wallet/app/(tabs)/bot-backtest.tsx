import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getPublicApiBase } from "@/services/api";

// ── Palette ────────────────────────────────────────────────────────────────────
const D = {
  bg: "#0a0a0f", card: "#12121a", card2: "#1a1a26", border: "#2a2a3a",
  primary: "#6c63ff", green: "#00d97e", red: "#ff4560",
  yellow: "#ffc107", muted: "#888", text: "#f0f0f0", sub: "#aaa",
  orange: "#ff8c00", teal: "#00bcd4",
};

// ── Types ──────────────────────────────────────────────────────────────────────
interface MonthlyStat { month: string; trades: number; wins: number; losses: number; pnl: number; }
interface HourStat    { hour: number; trades: number; wins: number; winRate: number; }
interface ConfStat    { range: string; trades: number; wins: number; winRate: number; }
interface EquityPoint { epoch: number; balance: number; }

interface AssetResult {
  asset: string; totalCandles: number; signalsFired: number;
  newsFiltered: number; spikeFiltered: number; trades: number;
  wins: number; losses: number; winRate: number;
  grossPnl: number; maxDrawdown: number;
  byHour: HourStat[]; byConfidence: ConfStat[];
  monthly: MonthlyStat[]; equity: EquityPoint[];
}

interface Combined {
  trades: number; wins: number; losses: number; winRate: number;
  grossPnl: number; maxDrawdown: number;
  newsFiltered: number; spikeFiltered: number; signalsFired: number;
}

interface BacktestRun {
  id: string; status: string; months: number;
  progress: number; message: string | null;
  results: { combined: Combined; assets: AssetResult[] } | null;
  createdAt: string; finishedAt: string | null;
}

// ── Mini equity spark ──────────────────────────────────────────────────────────
function EquitySpark({ points, color }: { points: EquityPoint[]; color: string }) {
  if (points.length < 2) return null;
  const W = 120, H = 40;
  const vals = points.map(p => p.balance);
  const min  = Math.min(...vals);
  const max  = Math.max(...vals);
  const range = max - min || 1;
  const xs = points.map((_, i) => (i / (points.length - 1)) * W);
  const ys = vals.map(v => H - ((v - min) / range) * H);
  const d  = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const { Svg, Path } = require("react-native-svg") as typeof import("react-native-svg");
  return (
    <Svg width={W} height={H}>
      <Path d={d} stroke={color} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

// ── Bar chart row ─────────────────────────────────────────────────────────────
function BarRow({ label, value, max, color, suffix = "%" }: {
  label: string; value: number; max: number; color: string; suffix?: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.barValue, { color }]}>{value}{suffix}</Text>
    </View>
  );
}

// ── Monthly card ──────────────────────────────────────────────────────────────
function MonthlyRow({ m }: { m: MonthlyStat }) {
  const label = new Date(m.month + "-01").toLocaleString("en", { month: "short", year: "2-digit" });
  const wr    = m.trades > 0 ? Math.round((m.wins / m.trades) * 100) : 0;
  const pos   = m.pnl >= 0;
  return (
    <View style={styles.monthRow}>
      <Text style={styles.monthLabel}>{label}</Text>
      <Text style={styles.monthTrades}>{m.trades}t</Text>
      <Text style={[styles.monthWr, { color: wr >= 60 ? D.green : wr >= 50 ? D.yellow : D.red }]}>{wr}%</Text>
      <Text style={[styles.monthPnl, { color: pos ? D.green : D.red }]}>
        {pos ? "+" : ""}${m.pnl.toFixed(2)}
      </Text>
    </View>
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

// ── Main screen ───────────────────────────────────────────────────────────────
export default function BotBacktestScreen() {
  const insets = useSafeAreaInsets();
  const [run, setRun]         = useState<BacktestRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [months, setMonths]   = useState(6);
  const [tab, setTab]         = useState<"overview" | "hours" | "monthly" | "confidence">("overview");
  const pollRef               = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeAnim              = useRef(new Animated.Value(0)).current;

  const fetchLatest = useCallback(async () => {
    try {
      const base = getPublicApiBase();
      const r = await fetch(`${base}/bot/backtest/latest`);
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
      const base = getPublicApiBase();
      const r = await fetch(`${base}/bot/backtest/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months }),
      });
      const data = await r.json() as { runId: string };
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
    if (isRunning && !pollRef.current) {
      pollRef.current = setInterval(fetchLatest, 3000);
    }
    return () => {
      if (!isRunning && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isRunning, fetchLatest]);

  const combined = run?.results?.combined;
  const assets   = run?.results?.assets ?? [];

  const renderOverview = () => {
    if (!combined) return null;
    const winColor = combined.winRate >= 60 ? D.green : combined.winRate >= 50 ? D.yellow : D.red;
    const pnlPos   = combined.grossPnl >= 0;
    const roi      = combined.trades > 0 ? ((combined.grossPnl / (combined.trades * 5)) * 100).toFixed(1) : "0";

    return (
      <>
        <View style={styles.statGrid}>
          <View style={styles.statBox}>
            <Text style={[styles.statVal, { color: winColor }]}>{combined.winRate}%</Text>
            <Text style={styles.statLbl}>Win Rate</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statVal, { color: pnlPos ? D.green : D.red }]}>
              {pnlPos ? "+" : ""}${combined.grossPnl.toFixed(2)}
            </Text>
            <Text style={styles.statLbl}>Gross P&L</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{combined.trades}</Text>
            <Text style={styles.statLbl}>Trades</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statVal, { color: D.red }]}>-${combined.maxDrawdown.toFixed(2)}</Text>
            <Text style={styles.statLbl}>Max DD</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statVal, { color: pnlPos ? D.green : D.red }]}>{roi}%</Text>
            <Text style={styles.statLbl}>ROI</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{combined.wins}W / {combined.losses}L</Text>
            <Text style={styles.statLbl}>Record</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>News & Spike Filter Impact</Text>
          <View style={styles.filterRow}>
            <View style={styles.filterBox}>
              <Text style={[styles.filterNum, { color: D.yellow }]}>{combined.newsFiltered.toLocaleString()}</Text>
              <Text style={styles.filterLbl}>News candles{"\n"}skipped</Text>
            </View>
            <View style={styles.filterBox}>
              <Text style={[styles.filterNum, { color: D.orange }]}>{combined.spikeFiltered.toLocaleString()}</Text>
              <Text style={styles.filterLbl}>Spike candles{"\n"}skipped</Text>
            </View>
            <View style={styles.filterBox}>
              <Text style={[styles.filterNum, { color: D.primary }]}>{combined.signalsFired.toLocaleString()}</Text>
              <Text style={styles.filterLbl}>Clean signals{"\n"}traded</Text>
            </View>
          </View>
        </View>

        {assets.map(a => (
          <View key={a.asset} style={styles.section}>
            <View style={styles.assetHeader}>
              <Text style={styles.assetName}>{a.asset === "GOLD" ? "🥇 GOLD" : "💶 EUR/USD"}</Text>
              <Text style={[styles.assetWr, { color: a.winRate >= 60 ? D.green : a.winRate >= 50 ? D.yellow : D.red }]}>
                {a.winRate}% WR
              </Text>
            </View>
            <View style={styles.assetRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.assetStat}>{a.trades} trades  •  {a.wins}W / {a.losses}L</Text>
                <Text style={[styles.assetPnl, { color: a.grossPnl >= 0 ? D.green : D.red }]}>
                  P&L: {a.grossPnl >= 0 ? "+" : ""}${a.grossPnl.toFixed(2)}  |  DD: -${a.maxDrawdown.toFixed(2)}
                </Text>
                <Text style={styles.assetStat}>{a.totalCandles.toLocaleString()} candles analysed</Text>
              </View>
              <EquitySpark points={a.equity} color={a.grossPnl >= 0 ? D.green : D.red} />
            </View>
          </View>
        ))}
      </>
    );
  };

  const renderHours = () => {
    const allHours: HourStat[] = [];
    assets.forEach(a => a.byHour.forEach(h => {
      const ex = allHours.find(x => x.hour === h.hour);
      if (ex) {
        const tw = ex.wins + (h.wins);
        const tl = (ex.trades - ex.wins) + (h.trades - h.wins);
        ex.trades += h.trades; ex.wins += h.wins;
        ex.winRate = ex.trades > 0 ? Math.round(ex.wins / ex.trades * 100) : 0;
      } else {
        allHours.push({ ...h });
      }
    }));
    allHours.sort((a, b) => a.hour - b.hour);
    const maxWr = Math.max(...allHours.map(h => h.winRate), 1);

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Best Hours to Trade (UTC)</Text>
        <View style={styles.newsNote}>
          <Text style={styles.newsNoteText}>⚡ News windows (13:20–14:10, 12:40–13:05, 11:55–12:25 UTC) are automatically excluded</Text>
        </View>
        {allHours.filter(h => h.trades > 0).map(h => (
          <BarRow key={h.hour}
            label={`${String(h.hour).padStart(2, "0")}:00`}
            value={h.winRate} max={maxWr} color={h.winRate >= 65 ? D.green : h.winRate >= 55 ? D.yellow : D.red}
            suffix={`% (${h.trades}t)`}
          />
        ))}
      </View>
    );
  };

  const renderMonthly = () => {
    const monthMap: Record<string, MonthlyStat> = {};
    assets.forEach(a => a.monthly.forEach(m => {
      if (!monthMap[m.month]) monthMap[m.month] = { month: m.month, trades: 0, wins: 0, losses: 0, pnl: 0 };
      monthMap[m.month].trades += m.trades;
      monthMap[m.month].wins   += m.wins;
      monthMap[m.month].losses += m.losses;
      monthMap[m.month].pnl   += m.pnl;
    }));
    const months = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));
    const totalPnl = months.reduce((s, m) => s + m.pnl, 0);
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Monthly Breakdown</Text>
        <View style={styles.monthHeader}>
          <Text style={styles.monthHeaderText}>Month</Text>
          <Text style={styles.monthHeaderText}>Trades</Text>
          <Text style={styles.monthHeaderText}>WR</Text>
          <Text style={styles.monthHeaderText}>P&L ($5/t)</Text>
        </View>
        {months.map(m => <MonthlyRow key={m.month} m={m} />)}
        <View style={[styles.monthRow, { borderTopWidth: 1, borderTopColor: D.border, marginTop: 4, paddingTop: 8 }]}>
          <Text style={[styles.monthLabel, { color: D.text, fontWeight: "700" }]}>Total</Text>
          <Text style={[styles.monthTrades, { color: D.text }]}>{months.reduce((s, m) => s + m.trades, 0)}t</Text>
          <Text style={styles.monthWr} />
          <Text style={[styles.monthPnl, { color: totalPnl >= 0 ? D.green : D.red, fontWeight: "700" }]}>
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
          </Text>
        </View>
      </View>
    );
  };

  const renderConfidence = () => {
    const confMap: Record<string, ConfStat> = {};
    assets.forEach(a => a.byConfidence.forEach(c => {
      if (!confMap[c.range]) confMap[c.range] = { range: c.range, trades: 0, wins: 0, winRate: 0 };
      confMap[c.range].trades += c.trades;
      confMap[c.range].wins   += c.wins;
      confMap[c.range].winRate = confMap[c.range].trades > 0
        ? Math.round(confMap[c.range].wins / confMap[c.range].trades * 100) : 0;
    }));
    const buckets = ["75–79", "80–84", "85–89", "90+"].map(r => confMap[r]).filter(Boolean);
    const maxWr = Math.max(...buckets.map(b => b.winRate), 1);

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Win Rate by Confidence</Text>
        <Text style={[styles.sub, { marginBottom: 12 }]}>Higher confidence → stronger signal accuracy</Text>
        {buckets.map(b => (
          <View key={b.range} style={{ marginBottom: 12 }}>
            <BarRow label={`${b.range}%`} value={b.winRate} max={maxWr}
              color={b.winRate >= 65 ? D.green : b.winRate >= 55 ? D.yellow : D.red}
              suffix={`% WR`}
            />
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
        <View>
          <Text style={styles.title}>📊 Strategy Backtest</Text>
          <Text style={styles.subtitle}>EMA9/21 + RSI14 + BB — news-filtered</Text>
        </View>
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
          {(isRunning || starting) ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.runBtnText}>▶  Run Backtest</Text>
          )}
        </Pressable>
      </View>

      {/* Progress */}
      {isRunning && run && (
        <View style={styles.progressCard}>
          <ProgressRing pct={run.progress} />
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={styles.progressTitle}>Running backtest…</Text>
            <Text style={styles.progressMsg}>{run.message ?? "Initialising…"}</Text>
            <Text style={styles.progressSub}>{run.months}-month history  •  GOLD + EUR/USD</Text>
          </View>
        </View>
      )}

      {/* Error */}
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
            <View style={styles.summaryLeft}>
              <Text style={styles.summaryTitle}>{run.months}-Month Backtest</Text>
              <Text style={styles.summarySub}>
                {new Date(run.finishedAt!).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}
              </Text>
            </View>
            <View style={styles.summaryRight}>
              <Text style={[styles.summaryWr, {
                color: combined.winRate >= 60 ? D.green : combined.winRate >= 50 ? D.yellow : D.red,
              }]}>
                {combined.winRate}%
              </Text>
              <Text style={styles.summarySub}>Win Rate</Text>
            </View>
          </View>

          {/* Tab bar */}
          <View style={styles.tabBar}>
            {(["overview", "monthly", "hours", "confidence"] as const).map(t => (
              <Pressable key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                  {t === "overview" ? "Overview" : t === "monthly" ? "Monthly" : t === "hours" ? "Hours" : "Confidence"}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === "overview"    && renderOverview()}
          {tab === "monthly"     && renderMonthly()}
          {tab === "hours"       && renderHours()}
          {tab === "confidence"  && renderConfidence()}
        </Animated.View>
      )}

      {/* Empty state */}
      {!run && !loading && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📈</Text>
          <Text style={styles.emptyTitle}>No backtest run yet</Text>
          <Text style={styles.emptySub}>Run a backtest to see how the strategy performed over historical data with news events filtered out.</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scroll:   { flex: 1 },
  center:   { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: D.bg },
  header:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, marginBottom: 12 },
  title:    { color: D.text, fontSize: 20, fontWeight: "700" },
  subtitle: { color: D.muted, fontSize: 12, marginTop: 2 },
  sub:      { color: D.sub, fontSize: 11 },

  runCard:  { margin: 12, backgroundColor: D.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: D.border },
  runLabel: { color: D.sub, fontSize: 12, marginBottom: 8 },
  monthPicker: { flexDirection: "row", marginBottom: 12, gap: 8 },
  monthBtn:    { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8, backgroundColor: D.card2, borderWidth: 1, borderColor: D.border },
  monthBtnActive: { backgroundColor: D.primary, borderColor: D.primary },
  monthBtnText:     { color: D.muted, fontSize: 13, fontWeight: "600" },
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
  summaryLeft: {},
  summaryRight: { alignItems: "flex-end" },
  summaryTitle: { color: D.text, fontSize: 16, fontWeight: "700" },
  summarySub:   { color: D.muted, fontSize: 11, marginTop: 3 },
  summaryWr:    { fontSize: 28, fontWeight: "800" },

  tabBar:    { flexDirection: "row", marginHorizontal: 12, marginBottom: 4, backgroundColor: D.card, borderRadius: 10, borderWidth: 1, borderColor: D.border, overflow: "hidden" },
  tabBtn:    { flex: 1, paddingVertical: 9, alignItems: "center" },
  tabBtnActive: { backgroundColor: D.primary },
  tabText:   { color: D.muted, fontSize: 11, fontWeight: "600" },
  tabTextActive: { color: "#fff" },

  section:   { margin: 12, backgroundColor: D.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: D.border },
  sectionTitle: { color: D.text, fontSize: 13, fontWeight: "700", marginBottom: 10 },

  statGrid:  { flexDirection: "row", flexWrap: "wrap", marginHorizontal: 8, gap: 8, marginVertical: 4 },
  statBox:   { flex: 1, minWidth: "30%", backgroundColor: D.card, borderRadius: 10, padding: 12, alignItems: "center", borderWidth: 1, borderColor: D.border },
  statVal:   { color: D.text, fontSize: 15, fontWeight: "700" },
  statLbl:   { color: D.muted, fontSize: 10, marginTop: 3 },

  filterRow: { flexDirection: "row", gap: 8 },
  filterBox: { flex: 1, alignItems: "center", backgroundColor: D.card2, borderRadius: 8, padding: 10 },
  filterNum: { fontSize: 18, fontWeight: "700" },
  filterLbl: { color: D.muted, fontSize: 10, textAlign: "center", marginTop: 4 },

  assetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  assetName:  { color: D.text, fontSize: 14, fontWeight: "700" },
  assetWr:    { fontSize: 13, fontWeight: "700" },
  assetRow:   { flexDirection: "row", alignItems: "center" },
  assetStat:  { color: D.sub, fontSize: 11, marginBottom: 2 },
  assetPnl:   { fontSize: 12, fontWeight: "600", marginBottom: 2 },

  barRow:    { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  barLabel:  { color: D.sub, fontSize: 11, width: 52 },
  barTrack:  { flex: 1, height: 8, backgroundColor: D.card2, borderRadius: 4, overflow: "hidden", marginHorizontal: 6 },
  barFill:   { height: "100%", borderRadius: 4 },
  barValue:  { fontSize: 11, width: 72, textAlign: "right" },

  monthHeader:     { flexDirection: "row", marginBottom: 6 },
  monthHeaderText: { color: D.muted, fontSize: 10, fontWeight: "600", flex: 1, textAlign: "center" },
  monthRow:  { flexDirection: "row", alignItems: "center", paddingVertical: 5 },
  monthLabel: { color: D.sub, fontSize: 12, width: 52 },
  monthTrades:{ color: D.sub, fontSize: 12, flex: 1, textAlign: "center" },
  monthWr:   { fontSize: 12, fontWeight: "600", flex: 1, textAlign: "center" },
  monthPnl:  { fontSize: 12, fontWeight: "600", flex: 1, textAlign: "right" },

  newsNote:  { backgroundColor: "#1a1a10", borderRadius: 8, padding: 8, marginBottom: 10, borderWidth: 1, borderColor: "#333320" },
  newsNoteText: { color: D.yellow, fontSize: 11 },

  emptyState:  { alignItems: "center", paddingTop: 60, paddingHorizontal: 40 },
  emptyIcon:   { fontSize: 48, marginBottom: 16 },
  emptyTitle:  { color: D.text, fontSize: 18, fontWeight: "700", marginBottom: 8 },
  emptySub:    { color: D.muted, fontSize: 13, textAlign: "center", lineHeight: 20 },
});
