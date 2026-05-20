import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useWallet } from "@/context/WalletContext";
import { getPublicApiBase } from "@/services/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

// ── Types ─────────────────────────────────────────────────────────────────────
type Asset   = "V100" | "V50" | "GOLD" | "EURUSD";
type Dir     = "UP" | "DOWN";
type Duration = "1m" | "5m" | "15m" | "1h";
type Screen  = "trade" | "confirm" | "active" | "result";

interface Prices  { V100: number; V50: number; GOLD: number; EURUSD: number }
interface Proposal {
  proposalId: string; payout: number; askPrice: number;
  spotPrice: number; longCode: string;
}
interface Trade {
  tradeId: string; asset: Asset; direction: Dir; amount: number;
  payout: number; entryPrice: number; expiresAt: string; status: string;
}
interface TradeResult {
  id: string; asset: string; direction: string; amount_usdt: number;
  payout_usdt: number; entry_price: number; exit_price: number | null;
  status: string; opened_at: string; resolved_at: string | null;
}

const ASSETS: Asset[] = ["V100", "V50", "GOLD", "EURUSD"];
const DURATIONS: Duration[] = ["1m", "5m", "15m", "1h"];
const DURATION_LABEL: Record<Duration, string> = { "1m": "1 Min", "5m": "5 Min", "15m": "15 Min", "1h": "1 Hour" };

const ASSET_ICON: Record<Asset, string>  = { V100: "V₁₀₀", V50: "V₅₀", GOLD: "Au", EURUSD: "€/$" };
const ASSET_LABEL: Record<Asset, string> = { V100: "Vol 100", V50: "Vol 50", GOLD: "Gold", EURUSD: "EUR/USD" };
const ASSET_COLOR: Record<Asset, string> = { V100: "#8B5CF6", V50: "#06B6D4", GOLD: "#EAB308", EURUSD: "#3B82F6" };

function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toFixed(4);
}

function formatCountdown(expiresAt: string): string {
  const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function fetchPrices(): Promise<Prices> {
  const r = await fetch(`${getPublicApiBase()}/trading/prices`);
  if (!r.ok) throw new Error("Price fetch failed");
  return r.json() as Promise<Prices>;
}

async function fetchProposal(asset: Asset, direction: Dir, amount: number, duration: Duration): Promise<Proposal> {
  const r = await fetch(`${getPublicApiBase()}/trading/proposal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asset, direction, amount, duration }),
  });
  const data = await r.json() as Proposal & { error?: string };
  if (!r.ok) throw new Error(data.error ?? "Proposal failed");
  return data;
}

async function openTrade(params: {
  walletAddress: string; asset: Asset; direction: Dir;
  amount: number; duration: Duration;
}): Promise<Trade> {
  const r = await fetch(`${getPublicApiBase()}/trading/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await r.json() as Trade & { error?: string };
  if (!r.ok) throw new Error(data.error ?? "Trade failed");
  return data;
}

async function fetchTradeStatus(tradeId: string): Promise<TradeResult> {
  const r = await fetch(`${getPublicApiBase()}/trading/trade/${tradeId}`);
  if (!r.ok) throw new Error("Status fetch failed");
  return r.json() as Promise<TradeResult>;
}

async function fetchBalance(address: string): Promise<number> {
  const r = await fetch(`${getPublicApiBase()}/trading/balance/${address}`);
  if (!r.ok) return 0;
  const d = await r.json() as { balance: number };
  return d.balance ?? 0;
}

async function fetchHistory(address: string): Promise<TradeResult[]> {
  const r = await fetch(`${getPublicApiBase()}/trading/history/${address}`);
  if (!r.ok) return [];
  return r.json() as Promise<TradeResult[]>;
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function TradeScreen() {
  const colors    = useColors();
  const insets    = useSafeAreaInsets();
  const { mxcAddress, ethAddress } = useWallet();
  const qc        = useQueryClient();

  const [screen,   setScreen]   = useState<Screen>("trade");
  const [asset,    setAsset]    = useState<Asset>("V100");
  const [dir,      setDir]      = useState<Dir>("UP");
  const [duration, setDuration] = useState<Duration>("1m");
  const [amount,   setAmount]   = useState("1");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [activeTrade, setActiveTrade] = useState<Trade | null>(null);
  const [result,   setResult]   = useState<TradeResult | null>(null);
  const [err,      setErr]      = useState("");
  const [countdown, setCountdown] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const address = ethAddress?.toLowerCase() ?? mxcAddress?.toLowerCase() ?? "";

  const resultScale = useRef(new Animated.Value(0)).current;
  const priceFlash  = useRef(new Animated.Value(1)).current;

  useFocusEffect(useCallback(() => { qc.invalidateQueries({ queryKey: ["trade_prices"] }); }, [qc]));

  // Live prices — refresh every 5 s
  const { data: prices, isError: pricesErr } = useQuery<Prices>({
    queryKey: ["trade_prices"],
    queryFn:  fetchPrices,
    refetchInterval: 5000,
    staleTime: 4000,
  });

  // Trading balance
  const { data: balance = 0, refetch: refetchBalance } = useQuery<number>({
    queryKey: ["trade_balance", address],
    queryFn:  () => fetchBalance(address),
    enabled:  !!address,
    staleTime: 10000,
  });

  // Trade history
  const { data: history = [] } = useQuery<TradeResult[]>({
    queryKey: ["trade_history", address],
    queryFn:  () => fetchHistory(address),
    enabled:  !!address && showHistory,
    staleTime: 30000,
  });

  // Countdown timer for active trade
  useEffect(() => {
    if (screen !== "active" || !activeTrade) return;
    const tick = setInterval(() => setCountdown(formatCountdown(activeTrade.expiresAt)), 500);
    return () => clearInterval(tick);
  }, [screen, activeTrade]);

  // Poll trade status when active
  const { data: liveStatus } = useQuery<TradeResult>({
    queryKey: ["trade_status", activeTrade?.tradeId],
    queryFn:  () => fetchTradeStatus(activeTrade!.tradeId),
    enabled:  screen === "active" && !!activeTrade,
    refetchInterval: 4000,
    staleTime: 3000,
  });

  useEffect(() => {
    if (!liveStatus) return;
    if (liveStatus.status !== "open") {
      setResult(liveStatus);
      setScreen("result");
      Animated.spring(resultScale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 6 }).start();
      if (Platform.OS !== "web") {
        liveStatus.status === "won"
          ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      void refetchBalance();
      qc.invalidateQueries({ queryKey: ["trade_history", address] });
    }
  }, [liveStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flash price on change
  const prevPriceRef = useRef<number | null>(null);
  useEffect(() => {
    if (!prices) return;
    const cur = prices[asset];
    if (prevPriceRef.current !== null && prevPriceRef.current !== cur) {
      Animated.sequence([
        Animated.timing(priceFlash, { toValue: 0.3, duration: 80, useNativeDriver: true }),
        Animated.timing(priceFlash, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
    prevPriceRef.current = cur;
  }, [prices, asset]); // eslint-disable-line react-hooks/exhaustive-deps

  // Proposal mutation
  const proposalMut = useMutation({
    mutationFn: () => {
      const amt = parseFloat(amount);
      if (!amt || amt < 0.35) throw new Error("Minimum amount is $0.35");
      if (amt > balance) throw new Error("Insufficient USDT balance");
      return fetchProposal(asset, dir, amt, duration);
    },
    onSuccess: (p) => { setProposal(p); setScreen("confirm"); setErr(""); },
    onError:   (e) => setErr(e instanceof Error ? e.message : "Failed to get quote"),
  });

  // Open trade mutation
  const tradeMut = useMutation({
    mutationFn: () => {
      if (!address) throw new Error("Not ready");
      return openTrade({
        walletAddress: address, asset, direction: dir,
        amount: parseFloat(amount), duration,
      });
    },
    onSuccess: (t) => {
      setActiveTrade(t);
      setScreen("active");
      setCountdown(formatCountdown(t.expiresAt));
      setErr("");
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    onError: (e) => { setErr(e instanceof Error ? e.message : "Trade failed"); setScreen("trade"); },
  });

  function reset() {
    setScreen("trade"); setProposal(null); setActiveTrade(null);
    setResult(null); setErr(""); resultScale.setValue(0);
  }

  const s = StyleSheet.create({
    container:   { flex: 1, backgroundColor: colors.background },
    header:      {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 12),
      paddingHorizontal: 20, paddingBottom: 14,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    },
    title:       { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
    balancePill: {
      flexDirection: "row", alignItems: "center", gap: 5,
      paddingHorizontal: 12, paddingVertical: 6,
      backgroundColor: colors.card, borderRadius: 20,
      borderWidth: 1, borderColor: colors.border,
    },
    balanceText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#10B981" },
    scroll:      { paddingHorizontal: 20, paddingBottom: 120 },
    card:        {
      backgroundColor: colors.card, borderRadius: 20,
      borderWidth: 1, borderColor: colors.border,
      padding: 18, marginBottom: 14,
    },
    sectionLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 1.5, marginBottom: 10 },
    assetRow:    { flexDirection: "row", gap: 8 },
    assetBtn:    {
      flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 14,
      borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background, gap: 4,
    },
    assetBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + "10" },
    assetEmoji:  { fontSize: 18, fontFamily: "Inter_700Bold" },
    assetName:   { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    assetPrice:  { fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    priceRow:    { flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8, marginBottom: 6 },
    bigPrice:    { fontSize: 32, fontFamily: "Inter_700Bold", color: colors.foreground },
    priceUnit:   { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    dirRow:      { flexDirection: "row", gap: 10, marginBottom: 14 },
    dirBtn:      {
      flex: 1, paddingVertical: 18, borderRadius: 16, alignItems: "center",
      borderWidth: 2, borderColor: colors.border, gap: 6, backgroundColor: colors.background,
    },
    dirBtnUp:    { borderColor: "#10B981", backgroundColor: "#10B98112" },
    dirBtnDown:  { borderColor: "#EF4444", backgroundColor: "#EF444412" },
    dirIcon:     { fontSize: 22 },
    dirLabel:    { fontSize: 15, fontFamily: "Inter_700Bold", color: colors.mutedForeground },
    dirLabelUp:  { color: "#10B981" },
    dirLabelDown:{ color: "#EF4444" },
    durRow:      { flexDirection: "row", gap: 8 },
    durBtn:      {
      flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center",
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
    },
    durBtnActive:{ borderColor: colors.primary, backgroundColor: colors.primary + "15" },
    durText:     { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    durTextActive:{ color: colors.primary },
    amtRow:      { flexDirection: "row", alignItems: "center", backgroundColor: colors.background, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, overflow: "hidden" },
    amtInput:    { flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
    amtSuffix:   { paddingHorizontal: 14, fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    payoutRow:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
    payoutLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    payoutValue: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#10B981" },
    errBox:      { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EF444412", borderRadius: 10, borderWidth: 1, borderColor: "#EF444430", padding: 12, marginBottom: 14 },
    errText:     { fontSize: 13, fontFamily: "Inter_400Regular", color: "#EF4444", flex: 1 },
    primaryBtn:  { borderRadius: 16, overflow: "hidden", marginBottom: 8 },
    primaryGrad: { paddingVertical: 17, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
    primaryTxt:  { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFF", letterSpacing: 0.2 },
    ghostBtn:    { paddingVertical: 12, alignItems: "center" },
    ghostTxt:    { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    confirmRow:  { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    confirmLabel:{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    confirmVal:  { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    activeCenter:{ alignItems: "center", paddingVertical: 24 },
    countdownBig:{ fontSize: 52, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: -2 },
    countdownSub:{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4 },
    livePriceRow:{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 },
    liveLabel:   { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    livePrice:   { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
    progressBar: { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: "hidden", marginVertical: 16 },
    progressFill:{ height: 4, backgroundColor: colors.primary, borderRadius: 2 },
    tradeSummaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
    tradeSummaryLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    tradeSummaryVal:   { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    resultIcon:  { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", marginBottom: 20, alignSelf: "center" },
    resultTitle: { fontSize: 28, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 8 },
    resultAmt:   { fontSize: 16, fontFamily: "Inter_400Regular", textAlign: "center", color: colors.mutedForeground, marginBottom: 24 },
    historyRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    historyAsset:{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    historyAmt:  { fontSize: 13, fontFamily: "Inter_700Bold" },
    historyMeta: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    noBalanceBanner: {
      flexDirection: "row", alignItems: "flex-start", gap: 10,
      backgroundColor: "#F59E0B10", borderRadius: 14, borderWidth: 1,
      borderColor: "#F59E0B30", padding: 14, marginBottom: 14,
    },
  });

  const currentPrice = prices?.[asset] ?? 0;
  const estPayout    = proposal?.payout ?? (parseFloat(amount || "0") * 1.87);

  // ── Screens ────────────────────────────────────────────────────────────────
  if (screen === "result" && result) {
    const won  = result.status === "won";
    const draw = result.status === "draw";
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.title}>Trade</Text>
          <View style={s.balancePill}>
            <Icon name="wallet-outline" size={12} color="#10B981" />
            <Text style={s.balanceText}>${balance.toFixed(2)} USDT</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={[s.scroll, { paddingTop: 20, alignItems: "center" }]}>
          <Animated.View style={{ transform: [{ scale: resultScale }], width: "100%" }}>
            <View style={[s.resultIcon, {
              backgroundColor: won ? "#10B98118" : draw ? "#F59E0B18" : "#EF444418",
              borderWidth: 1,
              borderColor: won ? "#10B98140" : draw ? "#F59E0B40" : "#EF444440",
            }]}>
              <Text style={{ fontSize: 40 }}>{won ? "🏆" : draw ? "🤝" : "😞"}</Text>
            </View>
            <Text style={[s.resultTitle, { color: won ? "#10B981" : draw ? "#F59E0B" : "#EF4444" }]}>
              {won ? "You Won!" : draw ? "Draw" : "You Lost"}
            </Text>
            <Text style={s.resultAmt}>
              {won
                ? `+$${(result.payout_usdt - result.amount_usdt).toFixed(2)} profit`
                : draw
                ? `$${result.amount_usdt.toFixed(2)} refunded`
                : `-$${result.amount_usdt.toFixed(2)}`}
            </Text>

            <View style={s.card}>
              {[
                ["Asset",       result.asset],
                ["Direction",   result.direction],
                ["Staked",      `$${result.amount_usdt.toFixed(2)}`],
                ["Entry Price", result.entry_price ? `$${formatPrice(result.entry_price)}` : "—"],
                ["Exit Price",  result.exit_price  ? `$${formatPrice(result.exit_price)}`  : "—"],
                ["Payout",      won ? `$${result.payout_usdt.toFixed(2)}` : "$0.00"],
              ].map(([label, val]) => (
                <View key={label} style={s.confirmRow}>
                  <Text style={s.confirmLabel}>{label}</Text>
                  <Text style={[s.confirmVal, label === "Payout" && won ? { color: "#10B981" } : {}]}>{val}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={s.primaryBtn} onPress={reset} activeOpacity={0.85}>
              <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
                <Icon name="refresh-outline" size={18} color="#FFF" />
                <Text style={s.primaryTxt}>Trade Again</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </View>
    );
  }

  if (screen === "active" && activeTrade) {
    const total  = new Date(activeTrade.expiresAt).getTime() - new Date(activeTrade.expiresAt).getTime() + 1;
    const remain = Math.max(0, new Date(activeTrade.expiresAt).getTime() - Date.now());
    const durationMs = (() => {
      const map: Record<string, number> = { "1m": 60000, "5m": 300000, "15m": 900000, "1h": 3600000 };
      return map[duration] ?? 60000;
    })();
    const progress = Math.max(0, Math.min(1, 1 - remain / durationMs));

    return (
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.title}>Trade Active</Text>
          <View style={s.balancePill}>
            <Icon name="wallet-outline" size={12} color="#10B981" />
            <Text style={s.balanceText}>${balance.toFixed(2)} USDT</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={[s.scroll, { paddingTop: 8 }]}>
          <View style={s.card}>
            <View style={s.activeCenter}>
              <Text style={[s.sectionLabel, { textAlign: "center", marginBottom: 4 }]}>TIME REMAINING</Text>
              <Text style={s.countdownBig}>{countdown || "…"}</Text>
              <Text style={s.countdownSub}>Resolving at expiry</Text>
            </View>

            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
            </View>

            <View style={s.livePriceRow}>
              <Text style={s.liveLabel}>Live {activeTrade.asset}</Text>
              <Animated.Text style={[s.livePrice, { opacity: priceFlash }]}>
                ${currentPrice ? formatPrice(currentPrice) : "—"}
              </Animated.Text>
              {currentPrice && activeTrade.entryPrice && (
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold",
                  color: currentPrice > activeTrade.entryPrice ? "#10B981" : "#EF4444" }}>
                  {currentPrice > activeTrade.entryPrice ? "▲" : "▼"}
                </Text>
              )}
            </View>
          </View>

          <View style={s.card}>
            {[
              ["Direction", activeTrade.direction === "UP" ? "▲ UP" : "▼ DOWN"],
              ["Staked",    `$${activeTrade.amount.toFixed(2)} USDT`],
              ["If Win",    `$${activeTrade.payout.toFixed(2)} USDT`],
              ["Entry",     `$${formatPrice(activeTrade.entryPrice)}`],
            ].map(([label, val]) => (
              <View key={label} style={s.tradeSummaryRow}>
                <Text style={s.tradeSummaryLabel}>{label}</Text>
                <Text style={[s.tradeSummaryVal,
                  label === "Direction" && activeTrade.direction === "UP"  ? { color: "#10B981" } :
                  label === "Direction" && activeTrade.direction === "DOWN" ? { color: "#EF4444" } :
                  label === "If Win" ? { color: "#10B981" } : {}
                ]}>{val}</Text>
              </View>
            ))}
            <View style={{ alignItems: "center", marginTop: 8 }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[s.countdownSub, { marginTop: 6 }]}>Waiting for result…</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (screen === "confirm" && proposal) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen("trade")}>
            <Icon name="arrow-back" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={s.title}>Confirm Trade</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={[s.scroll, { paddingTop: 8 }]}>
          <View style={s.card}>
            {[
              ["Asset",     asset],
              ["Direction", dir === "UP" ? "▲ UP" : "▼ DOWN"],
              ["Amount",    `$${parseFloat(amount).toFixed(2)} USDT`],
              ["Duration",  DURATION_LABEL[duration]],
              ["Entry Price", `$${formatPrice(proposal.spotPrice)}`],
              ["Payout if Win", `$${proposal.payout.toFixed(2)} USDT`],
              ["Net Profit",    `+$${(proposal.payout - parseFloat(amount)).toFixed(2)}`],
            ].map(([label, val]) => (
              <View key={label} style={s.confirmRow}>
                <Text style={s.confirmLabel}>{label}</Text>
                <Text style={[s.confirmVal,
                  label === "Direction" && dir === "UP"   ? { color: "#10B981" } :
                  label === "Direction" && dir === "DOWN" ? { color: "#EF4444" } :
                  label === "Payout if Win" || label === "Net Profit" ? { color: "#10B981" } : {}
                ]}>{val}</Text>
              </View>
            ))}
          </View>

          {err ? (
            <View style={s.errBox}>
              <Icon name="alert-circle-outline" size={16} color="#EF4444" />
              <Text style={s.errText}>{err}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[s.primaryBtn, tradeMut.isPending && { opacity: 0.7 }]}
            disabled={tradeMut.isPending}
            onPress={() => tradeMut.mutate()}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={dir === "UP" ? ["#059669", "#10B981"] : ["#DC2626", "#EF4444"]}
              style={s.primaryGrad}
            >
              {tradeMut.isPending
                ? <ActivityIndicator color="#FFF" />
                : <>
                    <Text style={{ fontSize: 20 }}>{dir === "UP" ? "▲" : "▼"}</Text>
                    <Text style={s.primaryTxt}>Place Trade — {dir}</Text>
                  </>}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={s.ghostBtn} onPress={() => setScreen("trade")}>
            <Text style={s.ghostTxt}>← Back</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Main trade form ────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Trade</Text>
        <View style={s.balancePill}>
          <Icon name="wallet-outline" size={12} color="#10B981" />
          <Text style={s.balanceText}>${balance.toFixed(2)} USDT</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* No balance banner */}
        {balance < 0.35 && (
          <View style={s.noBalanceBanner}>
            <Icon name="information-circle-outline" size={18} color="#F59E0B" />
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "#F59E0B", flex: 1, lineHeight: 20 }}>
              You need USDT to trade. Deposit via the Card section to get started.
            </Text>
          </View>
        )}

        {/* Asset selector */}
        <View style={s.card}>
          <Text style={s.sectionLabel}>SELECT ASSET</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {ASSETS.map(a => (
              <TouchableOpacity
                key={a}
                style={[s.assetBtn, { width: "47%" }, asset === a && s.assetBtnActive]}
                onPress={() => { setAsset(a); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                activeOpacity={0.75}
              >
                <Text style={[s.assetEmoji, { color: ASSET_COLOR[a], fontSize: 14, letterSpacing: -0.5 }]}>{ASSET_ICON[a]}</Text>
                <Text style={[s.assetName, asset === a && { color: colors.primary }]}>{ASSET_LABEL[a]}</Text>
                {prices && <Text style={s.assetPrice}>${formatPrice(prices[a])}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Live price */}
        <View style={[s.card, { alignItems: "center" }]}>
          <Text style={s.sectionLabel}>LIVE PRICE</Text>
          {pricesErr
            ? <Text style={{ color: "#EF4444", fontSize: 13 }}>Price unavailable</Text>
            : (
              <View style={s.priceRow}>
                <Animated.Text style={[s.bigPrice, { opacity: priceFlash, color: ASSET_COLOR[asset] }]}>
                  ${currentPrice ? formatPrice(currentPrice) : "—"}
                </Animated.Text>
                <Text style={s.priceUnit}>USD</Text>
              </View>
            )}
        </View>

        {/* Direction */}
        <View style={s.card}>
          <Text style={s.sectionLabel}>PREDICTION</Text>
          <View style={s.dirRow}>
            <TouchableOpacity
              style={[s.dirBtn, dir === "UP" && s.dirBtnUp]}
              onPress={() => { setDir("UP"); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.8}
            >
              <Text style={s.dirIcon}>▲</Text>
              <Text style={[s.dirLabel, dir === "UP" && s.dirLabelUp]}>UP</Text>
              <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: dir === "UP" ? "#10B981" : colors.mutedForeground }}>
                Price rises
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.dirBtn, dir === "DOWN" && s.dirBtnDown]}
              onPress={() => { setDir("DOWN"); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.8}
            >
              <Text style={s.dirIcon}>▼</Text>
              <Text style={[s.dirLabel, dir === "DOWN" && s.dirLabelDown]}>DOWN</Text>
              <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: dir === "DOWN" ? "#EF4444" : colors.mutedForeground }}>
                Price falls
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Duration */}
        <View style={s.card}>
          <Text style={s.sectionLabel}>DURATION</Text>
          <View style={s.durRow}>
            {DURATIONS.map(d => (
              <TouchableOpacity
                key={d}
                style={[s.durBtn, duration === d && s.durBtnActive]}
                onPress={() => setDuration(d)}
                activeOpacity={0.75}
              >
                <Text style={[s.durText, duration === d && s.durTextActive]}>{DURATION_LABEL[d]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Amount */}
        <View style={s.card}>
          <Text style={s.sectionLabel}>STAKE AMOUNT</Text>
          <View style={s.amtRow}>
            <TextInput
              style={s.amtInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="1.00"
              placeholderTextColor={colors.mutedForeground}
            />
            <Text style={s.amtSuffix}>USDT</Text>
          </View>
          <View style={s.payoutRow}>
            <Text style={s.payoutLabel}>Estimated payout if correct</Text>
            <Text style={s.payoutValue}>${estPayout.toFixed(2)} USDT</Text>
          </View>
          <View style={[s.payoutRow, { marginTop: 2 }]}>
            <Text style={s.payoutLabel}>Profit</Text>
            <Text style={s.payoutValue}>+${Math.max(0, estPayout - parseFloat(amount || "0")).toFixed(2)}</Text>
          </View>
        </View>

        {/* Quick amounts */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
          {["1", "5", "10", "25"].map(v => (
            <TouchableOpacity
              key={v}
              onPress={() => setAmount(v)}
              style={{
                flex: 1, paddingVertical: 8, borderRadius: 10,
                borderWidth: 1, borderColor: amount === v ? colors.primary : colors.border,
                backgroundColor: amount === v ? colors.primary + "12" : colors.card,
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: amount === v ? colors.primary : colors.mutedForeground }}>
                ${v}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {err ? (
          <View style={s.errBox}>
            <Icon name="alert-circle-outline" size={16} color="#EF4444" />
            <Text style={s.errText}>{err}</Text>
          </View>
        ) : null}

        {/* Predict button */}
        <TouchableOpacity
          style={[s.primaryBtn, (proposalMut.isPending || balance < 0.35) && { opacity: 0.5 }]}
          disabled={proposalMut.isPending || balance < 0.35}
          onPress={() => proposalMut.mutate()}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={dir === "UP" ? ["#059669", "#10B981"] : ["#DC2626", "#EF4444"]}
            style={s.primaryGrad}
          >
            {proposalMut.isPending
              ? <ActivityIndicator color="#FFF" />
              : <>
                  <Text style={{ fontSize: 18 }}>{dir === "UP" ? "▲" : "▼"}</Text>
                  <Text style={s.primaryTxt}>Predict {dir} · {DURATION_LABEL[duration]}</Text>
                </>}
          </LinearGradient>
        </TouchableOpacity>

        <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", marginBottom: 20, lineHeight: 17 }}>
          Trading involves risk. Only stake what you can afford to lose.
        </Text>

        {/* History toggle */}
        <TouchableOpacity
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}
          onPress={() => setShowHistory(v => !v)}
        >
          <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>Recent Trades</Text>
          <Icon name={showHistory ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedForeground} />
        </TouchableOpacity>

        {showHistory && (
          <View style={s.card}>
            {history.length === 0
              ? <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", paddingVertical: 16 }}>
                  No trades yet
                </Text>
              : history.map(h => (
                <View key={h.id} style={s.historyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.historyAsset}>{h.asset} · {h.direction}</Text>
                    <Text style={s.historyMeta}>${h.amount_usdt.toFixed(2)} · {new Date(h.opened_at).toLocaleDateString()}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[s.historyAmt, {
                      color: h.status === "won" ? "#10B981" : h.status === "lost" ? "#EF4444" : h.status === "open" ? "#F59E0B" : colors.mutedForeground
                    }]}>
                      {h.status === "won" ? `+$${(h.payout_usdt - h.amount_usdt).toFixed(2)}` :
                       h.status === "lost" ? `-$${h.amount_usdt.toFixed(2)}` :
                       h.status === "open" ? "Active" : "Draw"}
                    </Text>
                    <Text style={s.historyMeta}>{h.status.toUpperCase()}</Text>
                  </View>
                </View>
              ))
            }
          </View>
        )}

      </ScrollView>
    </View>
  );
}
