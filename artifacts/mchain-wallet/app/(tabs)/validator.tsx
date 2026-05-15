import { Icon } from "@/components/Icon";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import {
  api,
  type GasReward,
  type TreasuryReward,
  type ValidatorBlock,
} from "@/services/api";
import { formatUptime, weiToMc } from "@/services/crypto";
import { PulsingDot } from "@/components/PulsingDot";
import { SessionTimer } from "@/components/SessionTimer";
import { Toast } from "@/components/Toast";
import { useColors } from "@/hooks/useColors";

type SubTab = "treasury" | "gas" | "blocks";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parsePeriodLabel(period: string): string {
  const [datePart, hourPart] = period.split("T");
  if (!datePart) return period;
  const d = new Date(`${datePart}T${(hourPart ?? "00").padStart(2, "0")}:00:00Z`);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} – ${(hourPart ?? "00").padStart(2, "0")}:00`;
}
function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function uptimeColor(pct: number): string {
  if (pct >= 80) return "#10B981";
  if (pct >= 50) return "#F59E0B";
  return "#EF4444";
}

function SkeletonRow({ colors }: { colors: ReturnType<typeof useColors> }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
    ])).start();
  }, [opacity]);
  return (
    <Animated.View style={{ opacity, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ height: 12, width: "60%", backgroundColor: colors.muted, borderRadius: 6, marginBottom: 8 }} />
      <View style={{ height: 10, width: "40%", backgroundColor: colors.muted, borderRadius: 6 }} />
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ValidatorScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const {
    validatorWallet,
    deviceId,
    moniker,
    sessionExpired,
    sessionExpiresAt,
    isStaked,
    setSessionExpired,
    setSessionExpiresAt,
    setIsStaked,
  } = useWallet();

  const mxcAddress = validatorWallet?.mxcAddress ?? null;
  const ethAddress = validatorWallet?.ethAddress ?? null;
  const publicKey = validatorWallet?.publicKey ?? null;

  // ── Registration form state ─────────────────────────────────────────────────
  const [regMoniker, setRegMoniker] = useState(moniker || "");
  const [commissionRate, setCommissionRate] = useState("5");
  const [regError, setRegError] = useState("");
  const [monikerFocused, setMonikerFocused] = useState(false);
  const [commissionFocused, setCommissionFocused] = useState(false);
  const [restartLoading, setRestartLoading] = useState(false);
  const [toast, setToast] = useState("");

  // ── Sub-tab state ───────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<SubTab>("treasury");

  // ── Paginated lists ─────────────────────────────────────────────────────────
  const [treasuryItems, setTreasuryItems] = useState<TreasuryReward[]>([]);
  const [treasuryTotal, setTreasuryTotal] = useState(0);
  const [treasuryOffset, setTreasuryOffset] = useState(0);
  const [treasuryInitLoading, setTreasuryInitLoading] = useState(false);
  const [treasuryLoadingMore, setTreasuryLoadingMore] = useState(false);
  const [treasuryError, setTreasuryError] = useState<string | null>(null);

  const [gasItems, setGasItems] = useState<GasReward[]>([]);
  const [gasTotal, setGasTotal] = useState(0);
  const [gasOffset, setGasOffset] = useState(0);
  const [gasInitLoading, setGasInitLoading] = useState(false);
  const [gasLoadingMore, setGasLoadingMore] = useState(false);
  const [gasError, setGasError] = useState<string | null>(null);

  const [blocksItems, setBlocksItems] = useState<ValidatorBlock[]>([]);
  const [blocksTotal, setBlocksTotal] = useState(0);
  const [blocksOffset, setBlocksOffset] = useState(0);
  const [blocksInitLoading, setBlocksInitLoading] = useState(false);
  const [blocksLoadingMore, setBlocksLoadingMore] = useState(false);
  const [blocksError, setBlocksError] = useState<string | null>(null);

  // ── Animation refs ──────────────────────────────────────────────────────────
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0.3)).current;
  const expiredShake = useRef(new Animated.Value(0)).current;
  const cardFade = useRef(new Animated.Value(0)).current;

  // ── API queries ─────────────────────────────────────────────────────────────
  const {
    data: validatorData,
    isLoading: validatorLoading,
    refetch: refetchValidator,
  } = useQuery({
    queryKey: ["validatorDetail", mxcAddress],
    queryFn: () => api.getValidatorStatus(mxcAddress!),
    enabled: !!mxcAddress,
    refetchInterval: 30_000,
    retry: 1,
  });

  const { data: earningsData, refetch: refetchEarnings } = useQuery({
    queryKey: ["earnings", mxcAddress],
    queryFn: () => api.getValidatorEarnings(mxcAddress!),
    enabled: !!mxcAddress && !!validatorData?.validator,
    refetchInterval: 60_000,
    retry: 1,
  });

  const validator = validatorData?.validator;
  const isRegistered = !!validator;
  const earnings = earningsData?.earnings;
  const stats = earningsData?.stats;

  // ── Pagination loaders ──────────────────────────────────────────────────────
  const loadTreasury = useCallback(async (offset: number, append: boolean) => {
    if (!mxcAddress) return;
    if (offset === 0) setTreasuryInitLoading(true); else setTreasuryLoadingMore(true);
    setTreasuryError(null);
    try {
      const res = await api.getTreasuryRewards(mxcAddress, 50, offset);
      setTreasuryItems((prev) => append ? [...prev, ...res.rewards] : res.rewards);
      setTreasuryTotal(res.total);
      setTreasuryOffset(offset + res.rewards.length);
    } catch (err) {
      setTreasuryError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setTreasuryInitLoading(false);
      setTreasuryLoadingMore(false);
    }
  }, [mxcAddress]);

  const loadGas = useCallback(async (offset: number, append: boolean) => {
    if (!mxcAddress) return;
    if (offset === 0) setGasInitLoading(true); else setGasLoadingMore(true);
    setGasError(null);
    try {
      const res = await api.getGasRewards(mxcAddress, 50, offset);
      setGasItems((prev) => append ? [...prev, ...res.gasRewards] : res.gasRewards);
      setGasTotal(res.total);
      setGasOffset(offset + res.gasRewards.length);
    } catch (err) {
      setGasError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setGasInitLoading(false);
      setGasLoadingMore(false);
    }
  }, [mxcAddress]);

  const loadBlocks = useCallback(async (offset: number, append: boolean) => {
    if (!mxcAddress) return;
    if (offset === 0) setBlocksInitLoading(true); else setBlocksLoadingMore(true);
    setBlocksError(null);
    try {
      const res = await api.getValidatorBlocks(mxcAddress, 50, offset);
      setBlocksItems((prev) => append ? [...prev, ...res.blocks] : res.blocks);
      setBlocksTotal(res.total);
      setBlocksOffset(offset + res.blocks.length);
    } catch (err) {
      setBlocksError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setBlocksInitLoading(false);
      setBlocksLoadingMore(false);
    }
  }, [mxcAddress]);

  // Initial load when validator is registered
  useEffect(() => {
    if (mxcAddress && isRegistered) loadTreasury(0, false);
  }, [mxcAddress, isRegistered, loadTreasury]);
  useEffect(() => {
    if (mxcAddress && isRegistered && activeTab === "gas" && gasItems.length === 0) loadGas(0, false);
  }, [activeTab, mxcAddress, isRegistered, gasItems.length, loadGas]);
  useEffect(() => {
    if (mxcAddress && isRegistered && activeTab === "blocks" && blocksItems.length === 0) loadBlocks(0, false);
  }, [activeTab, mxcAddress, isRegistered, blocksItems.length, loadBlocks]);

  // ── Registration mutation ───────────────────────────────────────────────────
  const registerMutation = useMutation({
    mutationFn: () => {
      if (!mxcAddress || !ethAddress || !publicKey) throw new Error("Wallet not initialized");
      const rate = parseFloat(commissionRate);
      if (isNaN(rate) || rate < 0 || rate > 100) throw new Error("Commission rate must be between 0 and 100");
      if (!regMoniker.trim()) throw new Error("Moniker cannot be empty");
      return api.registerValidator({ address: mxcAddress, ethAddress, publicKey, deviceId, moniker: regMoniker.trim(), commissionRate: rate.toFixed(2) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["validatorDetail", mxcAddress] }); setRegError(""); },
    onError: (err: Error) => { setRegError(err.message || "Registration failed."); Alert.alert("Registration Failed", err.message || "Please try again."); },
  });

  // ── Animations ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (validator?.status === "active" && !sessionExpired) {
      anim = Animated.loop(Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseScale, { toValue: 1.5, duration: 2000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(pulseScale, { toValue: 1, duration: 2000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 0, duration: 2000, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.5, duration: 2000, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(ring2Scale, { toValue: 2.2, duration: 2800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(ring2Scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(ring2Opacity, { toValue: 0, duration: 2800, useNativeDriver: true }),
          Animated.timing(ring2Opacity, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ]));
      anim.start();
    } else {
      pulseScale.setValue(1); pulseOpacity.setValue(0);
      ring2Scale.setValue(1); ring2Opacity.setValue(0);
    }
    return () => anim?.stop();
  }, [validator?.status, sessionExpired, pulseScale, pulseOpacity, ring2Scale, ring2Opacity]);

  useEffect(() => {
    if (sessionExpired) {
      Animated.sequence([
        Animated.timing(expiredShake, { toValue: 8, duration: 60, useNativeDriver: true }),
        Animated.timing(expiredShake, { toValue: -8, duration: 60, useNativeDriver: true }),
        Animated.timing(expiredShake, { toValue: 6, duration: 60, useNativeDriver: true }),
        Animated.timing(expiredShake, { toValue: -6, duration: 60, useNativeDriver: true }),
        Animated.timing(expiredShake, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]).start();
    }
  }, [sessionExpired, expiredShake]);

  useEffect(() => {
    if (validator) Animated.timing(cardFade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [!!validator, cardFade]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  async function handleRestartSession() {
    if (!mxcAddress) return;
    setRestartLoading(true);
    try {
      const result = await api.restartSession(mxcAddress);
      await setSessionExpiresAt(result.sessionExpiresAt);
      setSessionExpired(false);
      setIsStaked(false);
      setToast("Session restarted — earning rewards again");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Failed to restart session");
    } finally {
      setRestartLoading(false);
    }
  }

  async function copyText(text: string, label: string) {
    await Clipboard.setStringAsync(text);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setToast(`${label} copied`);
  }

  function statusColor(status: string | undefined) {
    if (sessionExpired) return "#F59E0B";
    switch (status) {
      case "active": return "#10B981";
      case "pending": return "#F59E0B";
      case "banned": return "#EF4444";
      default: return colors.mutedForeground;
    }
  }
  function statusLabel(status: string | undefined) {
    if (sessionExpired) return "Paused";
    if (!status) return "Unknown";
    return status.charAt(0).toUpperCase() + status.slice(1);
  }
  function centerIcon() {
    if (sessionExpired) return "pause-circle-outline";
    if (validator?.status === "active") return "pulse-outline";
    if (validator?.status === "pending") return "time-outline";
    return "shield-half-outline";
  }

  function activeError() {
    if (activeTab === "treasury") return treasuryError;
    if (activeTab === "gas") return gasError;
    return blocksError;
  }
  function activeInitLoading() {
    if (activeTab === "treasury") return treasuryInitLoading;
    if (activeTab === "gas") return gasInitLoading;
    return blocksInitLoading;
  }
  function activeItems(): (TreasuryReward | GasReward | ValidatorBlock)[] {
    if (activeTab === "treasury") return treasuryItems;
    if (activeTab === "gas") return gasItems;
    return blocksItems;
  }
  function activeHasMore() {
    if (activeTab === "treasury") return treasuryOffset < treasuryTotal;
    if (activeTab === "gas") return gasOffset < gasTotal;
    return blocksOffset < blocksTotal;
  }
  function activeLoadingMore() {
    if (activeTab === "treasury") return treasuryLoadingMore;
    if (activeTab === "gas") return gasLoadingMore;
    return blocksLoadingMore;
  }
  function handleLoadMore() {
    if (activeTab === "treasury") loadTreasury(treasuryOffset, true);
    else if (activeTab === "gas") loadGas(gasOffset, true);
    else loadBlocks(blocksOffset, true);
  }
  function handleRetry() {
    if (activeTab === "treasury") loadTreasury(0, false);
    else if (activeTab === "gas") loadGas(0, false);
    else loadBlocks(0, false);
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    // Header
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 18),
      paddingHorizontal: 20,
      paddingBottom: 14,
    },
    headerTitle: { fontSize: 26, fontFamily: "Inter_700Bold", color: colors.foreground },
    headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 3 },

    // Register card
    registerCard: {
      marginHorizontal: 20, backgroundColor: colors.card,
      borderRadius: 20, borderWidth: 1, borderColor: colors.border,
      padding: 24, marginBottom: 20,
    },
    registerIcon: {
      width: 68, height: 68, borderRadius: 34,
      backgroundColor: colors.primary + "18",
      alignItems: "center", justifyContent: "center",
      marginBottom: 18, borderWidth: 1, borderColor: colors.primary + "30",
    },
    registerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 8 },
    registerDesc: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 22, marginBottom: 24 },
    featureRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 },
    featureChip: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: colors.primary + "15", borderRadius: 20,
      paddingHorizontal: 12, paddingVertical: 6,
      borderWidth: 1, borderColor: colors.primary + "25",
    },
    featureChipText: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.primary },
    fieldLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.5, marginBottom: 8 },
    input: {
      backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
      fontSize: 15, fontFamily: "Inter_400Regular", color: colors.foreground, marginBottom: 16,
    },
    inputFocused: { borderColor: colors.primary },
    commissionRow: {
      flexDirection: "row", alignItems: "center", backgroundColor: colors.background,
      borderWidth: 1, borderColor: colors.border, borderRadius: 12, marginBottom: 20,
    },
    commissionInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.foreground },
    commissionUnit: { paddingRight: 14, fontSize: 15, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    registerBtn: { borderRadius: 14, overflow: "hidden" },
    registerBtnGrad: { paddingVertical: 15, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
    registerBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
    errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.destructive, marginBottom: 12 },

    // Hero card
    heroWrap: { marginHorizontal: 20, borderRadius: 22, overflow: "hidden", marginBottom: 14 },
    heroGrad: { paddingTop: 24, paddingHorizontal: 20, paddingBottom: 20 },
    heroTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 },
    heroNameWrap: { flex: 1, marginRight: 12 },
    heroLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.45)", letterSpacing: 2, marginBottom: 5 },
    heroMoniker: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#FFFFFF", lineHeight: 26 },
    heroAddress: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)", marginTop: 4 },
    statusBadge: {
      flexDirection: "row", alignItems: "center", gap: 7,
      paddingHorizontal: 13, paddingVertical: 7,
      borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)",
      borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    },
    statusBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
    pulseCenter: { alignItems: "center", marginBottom: 24 },
    pulseRing: {
      position: "absolute", width: 88, height: 88,
      borderRadius: 44, borderWidth: 1.5,
    },
    pulseRing2: {
      position: "absolute", width: 88, height: 88,
      borderRadius: 44, borderWidth: 1,
    },
    pulseInner: {
      width: 88, height: 88, borderRadius: 44,
      backgroundColor: "rgba(0,0,0,0.35)",
      alignItems: "center", justifyContent: "center",
      borderWidth: 1.5,
    },
    statsGrid: { flexDirection: "row", gap: 8 },
    statBox: { flex: 1, backgroundColor: "rgba(0,0,0,0.28)", borderRadius: 12, padding: 12 },
    statLabel: { fontSize: 8, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.45)", letterSpacing: 1.2, marginBottom: 6 },
    statValue: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
    statSub: { fontSize: 9, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)", marginTop: 2 },

    // Session expired banner
    expiredBanner: {
      marginTop: 16, backgroundColor: "rgba(245,158,11,0.10)",
      borderRadius: 14, borderWidth: 1, borderColor: "rgba(245,158,11,0.35)",
      padding: 14,
    },
    expiredTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#F59E0B", marginBottom: 4 },
    expiredDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.55)", lineHeight: 18, marginBottom: 12 },
    restartBtn: { borderRadius: 10, overflow: "hidden" },
    restartGrad: { paddingVertical: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
    restartBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },

    // Earnings overview card
    earningsCard: {
      marginHorizontal: 20, borderRadius: 18, overflow: "hidden",
      marginBottom: 14, borderWidth: 1, borderColor: "#10B98122",
    },
    earningsGrad: { padding: 18 },
    earningsTitle: { fontSize: 9, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.45)", letterSpacing: 2, marginBottom: 14 },
    earningsRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
    earningBox: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 12, padding: 12 },
    earningBoxLabel: { fontSize: 8, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.45)", letterSpacing: 1.2, marginBottom: 5 },
    earningBoxValue: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
    earningBoxUnit: { fontSize: 9, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.45)", marginTop: 2 },
    earningBoxHighlight: { color: "#10B981" },
    pillRow: { flexDirection: "row", gap: 8 },
    pill: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: "rgba(255,255,255,0.07)",
      borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5,
      borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    },
    pillText: { fontSize: 11, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.65)" },

    // Sub-tabs
    tabsWrap: {
      marginHorizontal: 20, marginBottom: 4,
      backgroundColor: colors.card, borderRadius: 14,
      borderWidth: 1, borderColor: colors.border,
      flexDirection: "row", padding: 4,
    },
    tabBtn: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: 10 },
    tabBtnActive: { backgroundColor: colors.primary + "20", borderWidth: 1, borderColor: colors.primary + "45" },
    tabBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    tabBtnTextActive: { color: colors.primary },

    // Table header (blocks)
    tableHeader: {
      flexDirection: "row", paddingHorizontal: 20, paddingVertical: 9,
      backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    thBlock: { width: 84, fontSize: 9, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 1 },
    thTxs: { width: 36, fontSize: 9, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 1 },
    thGas: { flex: 1, fontSize: 9, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 1 },
    thTime: { width: 94, fontSize: 9, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 1, textAlign: "right" },

    // Error banner
    errorBanner: {
      marginHorizontal: 20, marginVertical: 10,
      backgroundColor: "#1A0000", borderRadius: 12,
      borderWidth: 1, borderColor: "#EF444440",
      padding: 14, flexDirection: "row", alignItems: "center", gap: 10,
    },
    errorBannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#F87171" },
    retryBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "#EF444420" },
    retryText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#F87171" },

    // Row items
    treasuryRow: { paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
    treasuryTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 7 },
    treasuryPeriod: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground, flex: 1 },
    treasuryAmount: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#10B981" },
    uptimeBarBg: { height: 5, backgroundColor: colors.muted, borderRadius: 3, marginBottom: 6, overflow: "hidden" },
    uptimeBarFill: { height: "100%", borderRadius: 3 },
    treasuryBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    uptimePctText: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    statusChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    statusChipText: { fontSize: 9, fontFamily: "Inter_700Bold" },

    gasRow: { paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
    gasTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
    gasBlock: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    gasShare: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#10B981" },
    gasMid: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    gasFee: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    splitChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    splitChipText: { fontSize: 9, fontFamily: "Inter_700Bold" },
    gasTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 3 },

    blockRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
    blockRowHighlight: { borderLeftWidth: 3, borderLeftColor: "#10B98155", paddingLeft: 17 },
    blockHeight: { width: 84, fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    blockTxs: { width: 36, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground },
    blockGas: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    blockTime: { width: 94, fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "right" },

    loadMoreBtn: {
      marginHorizontal: 20, marginVertical: 16,
      paddingVertical: 13, borderRadius: 12,
      borderWidth: 1, borderColor: colors.border,
      alignItems: "center",
    },
    loadMoreText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primary },

    emptyState: { paddingVertical: 48, alignItems: "center", gap: 10 },
    emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    emptySubText: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground + "99", textAlign: "center", paddingHorizontal: 32 },
  });

  // ── Row renderers ────────────────────────────────────────────────────────────
  function TreasuryRowItem({ item }: { item: TreasuryReward }) {
    const pct = parseFloat(item.uptimePct);
    const barColor = uptimeColor(pct);
    const isDistributed = item.status === "distributed";
    return (
      <View style={s.treasuryRow}>
        <View style={s.treasuryTop}>
          <Text style={s.treasuryPeriod} numberOfLines={1}>{parsePeriodLabel(item.period)}</Text>
          <Text style={s.treasuryAmount}>+{parseFloat(item.amountMc).toFixed(4)} MC</Text>
        </View>
        <View style={s.uptimeBarBg}>
          <View style={[s.uptimeBarFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }]} />
        </View>
        <View style={s.treasuryBottom}>
          <Text style={s.uptimePctText}>{item.uptimePct}% uptime · {item.activeMinutes}/{item.totalNetworkMinutes} min</Text>
          <View style={[s.statusChip, { backgroundColor: isDistributed ? "#10B98118" : "#F59E0B18" }]}>
            <Text style={[s.statusChipText, { color: isDistributed ? "#10B981" : "#F59E0B" }]}>
              {isDistributed ? "distributed" : "pending"}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  function GasRowItem({ item }: { item: GasReward }) {
    const chipColor = item.isStaked ? "#10B981" : "#F59E0B";
    const chipBg = item.isStaked ? "#10B98118" : "#F59E0B18";
    return (
      <TouchableOpacity style={s.gasRow} onPress={() => copyText(String(item.blockHeight), `Block #${item.blockHeight}`)} activeOpacity={0.7}>
        <View style={s.gasTop}>
          <Text style={s.gasBlock}>Block #{item.blockHeight.toLocaleString()} · {item.txCount} tx{item.txCount !== 1 ? "s" : ""}</Text>
          <Text style={s.gasShare}>+{parseFloat(item.validatorShareMc).toFixed(6)} MC</Text>
        </View>
        <View style={s.gasMid}>
          <Text style={s.gasFee}>Total fee: {parseFloat(item.totalFeeMc).toFixed(6)} MC</Text>
          <View style={[s.splitChip, { backgroundColor: chipBg }]}>
            <Text style={[s.splitChipText, { color: chipColor }]}>{item.splitPct}</Text>
          </View>
        </View>
        <Text style={s.gasTime}>{formatTimestamp(item.timestamp)}</Text>
      </TouchableOpacity>
    );
  }

  function BlockRowItem({ item }: { item: ValidatorBlock }) {
    const hasActivity = item.txCount > 0;
    const d = new Date(item.timestamp);
    const timeLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    return (
      <TouchableOpacity style={[s.blockRow, hasActivity && s.blockRowHighlight]} onPress={() => copyText(item.hash, "Block hash")} activeOpacity={0.7}>
        <Text style={s.blockHeight}>#{item.height.toLocaleString()}</Text>
        <Text style={[s.blockTxs, hasActivity && { color: "#10B981" }]}>{item.txCount}</Text>
        <Text style={s.blockGas}>{item.gasUsed.toLocaleString()}</Text>
        <Text style={s.blockTime}>{timeLabel}</Text>
      </TouchableOpacity>
    );
  }

  // ── Loading state ────────────────────────────────────────────────────────────
  if (validatorLoading) {
    return (
      <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const activeColor = sessionExpired ? "#F59E0B" : statusColor(validator?.status);

  // ── Hero card (registered) ───────────────────────────────────────────────────
  const HeroCard = validator ? (
    <Animated.View style={[s.heroWrap, { opacity: cardFade }, sessionExpired && { transform: [{ translateX: expiredShake }] }]}>
      <LinearGradient
        colors={sessionExpired ? ["#1E1200", "#130C00", "#0A0600"] : ["#0E2F52", "#081E38", "#040E1C"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.heroGrad}
      >
        {/* Top row: name + status */}
        <View style={s.heroTopRow}>
          <View style={s.heroNameWrap}>
            <Text style={s.heroLabel}>VALIDATOR NODE</Text>
            <Text style={s.heroMoniker}>{validator.moniker}</Text>
            <TouchableOpacity onPress={() => copyText(mxcAddress ?? "", "Address")} activeOpacity={0.7}>
              <Text style={s.heroAddress} numberOfLines={1}>{mxcAddress?.substring(0, 22)}…</Text>
            </TouchableOpacity>
          </View>
          <View style={[s.statusBadge, sessionExpired && { borderColor: "rgba(245,158,11,0.3)" }]}>
            <PulsingDot status={sessionExpired ? "pending" : validator.status} size={7} />
            <Text style={[s.statusBadgeText, { color: activeColor }]}>{statusLabel(validator.status)}</Text>
          </View>
        </View>

        {/* Pulsing ring */}
        <View style={s.pulseCenter}>
          <Animated.View style={[s.pulseRing2, { borderColor: activeColor, transform: [{ scale: ring2Scale }], opacity: ring2Opacity }]} />
          <Animated.View style={[s.pulseRing, { borderColor: activeColor, transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
          <View style={[s.pulseInner, { borderColor: activeColor + "50" }]}>
            <Icon name={centerIcon()} size={34} color={activeColor} />
          </View>
        </View>

        {/* Stats grid */}
        <View style={s.statsGrid}>
          <View style={s.statBox}>
            <Text style={s.statLabel}>UPTIME</Text>
            <Text style={s.statValue}>{formatUptime(validator.totalActiveMinutes)}</Text>
            <Text style={s.statSub}>total active</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statLabel}>BLOCKS</Text>
            <Text style={s.statValue}>{stats?.totalBlocksProposed !== undefined ? stats.totalBlocksProposed.toLocaleString() : "—"}</Text>
            <Text style={s.statSub}>validated</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statLabel}>EARNED</Text>
            <Text style={[s.statValue, { color: "#10B981", fontSize: 13 }]}>
              {earnings?.combinedTotalMc !== undefined ? parseFloat(earnings.combinedTotalMc).toFixed(3) : "—"}
            </Text>
            <Text style={s.statSub}>MC total</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statLabel}>SESSION</Text>
            {isStaked ? (
              <Text style={[s.statValue, { color: "#10B981", fontSize: 12 }]}>Unlimited</Text>
            ) : sessionExpired ? (
              <Text style={[s.statValue, { color: "#F59E0B", fontSize: 12 }]}>Expired</Text>
            ) : sessionExpiresAt ? (
              <SessionTimer
                expiresAt={sessionExpiresAt}
                compact
                onExpired={() => setSessionExpired(true)}
                style={{ fontSize: 12, fontFamily: "Inter_700Bold", color: "#FFFFFF" }}
              />
            ) : (
              <Text style={s.statValue}>—</Text>
            )}
            <Text style={s.statSub}>{validator.commissionRate}% commission</Text>
          </View>
        </View>

        {/* Session expired banner (inside hero) */}
        {sessionExpired && (
          <View style={s.expiredBanner}>
            <Text style={s.expiredTitle}>⚠ Session Paused</Text>
            <Text style={s.expiredDesc}>
              Your 2-hour validator session has ended. Restart to resume earning rewards.
            </Text>
            <TouchableOpacity style={s.restartBtn} onPress={handleRestartSession} disabled={restartLoading} activeOpacity={0.85}>
              <LinearGradient colors={["#F59E0B", "#D97706"]} style={s.restartGrad}>
                {restartLoading ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
                  <>
                    <Icon name="refresh-outline" size={14} color="#FFFFFF" />
                    <Text style={s.restartBtnText}>Restart Session</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </LinearGradient>
    </Animated.View>
  ) : null;

  // ── Earnings overview card ──────────────────────────────────────────────────
  const EarningsCard = earnings ? (
    <View style={s.earningsCard}>
      <LinearGradient colors={["#071A2E", "#040F1C"]} style={s.earningsGrad}>
        <Text style={s.earningsTitle}>EARNINGS OVERVIEW</Text>
        <View style={s.earningsRow}>
          <View style={s.earningBox}>
            <Text style={s.earningBoxLabel}>TREASURY</Text>
            <Text style={s.earningBoxValue}>{parseFloat(earnings.treasuryTotalMc).toFixed(4)}</Text>
            <Text style={s.earningBoxUnit}>{stats?.totalRewardPeriods ?? 0} periods</Text>
          </View>
          <View style={s.earningBox}>
            <Text style={s.earningBoxLabel}>GAS FEES</Text>
            <Text style={s.earningBoxValue}>{parseFloat(earnings.gasTotalMc).toFixed(4)}</Text>
            <Text style={s.earningBoxUnit}>{stats?.totalTxsProcessed ?? 0} txs</Text>
          </View>
          <View style={s.earningBox}>
            <Text style={s.earningBoxLabel}>COMBINED</Text>
            <Text style={[s.earningBoxValue, s.earningBoxHighlight]}>{parseFloat(earnings.combinedTotalMc).toFixed(4)}</Text>
            <Text style={s.earningBoxUnit}>all time · MC</Text>
          </View>
        </View>
        <View style={s.pillRow}>
          <View style={s.pill}>
            <Icon name="cube-outline" size={11} color="rgba(255,255,255,0.5)" />
            <Text style={s.pillText}>Blocks: {stats?.totalBlocksProposed?.toLocaleString() ?? 0}</Text>
          </View>
          <View style={s.pill}>
            <Icon name="repeat-outline" size={11} color="rgba(255,255,255,0.5)" />
            <Text style={s.pillText}>Txs: {stats?.totalTxsProcessed?.toLocaleString() ?? 0}</Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  ) : null;

  // ── Register form ───────────────────────────────────────────────────────────
  const RegisterForm = (
    <View style={s.registerCard}>
      <View style={s.registerIcon}>
        <Icon name="shield-outline" size={30} color={colors.primary} />
      </View>
      <Text style={s.registerTitle}>Become a Validator</Text>
      <Text style={s.registerDesc}>
        Register your device on the MChain network. Keep it online to earn MC rewards through uptime-based treasury payouts and gas fee sharing.
      </Text>
      <View style={s.featureRow}>
        {[{ icon: "time-outline", label: "Uptime Rewards" }, { icon: "flash-outline", label: "Gas Fees" }, { icon: "hardware-chip-outline", label: "Chain ID 1888" }, { icon: "trophy-outline", label: "MC Earnings" }].map((f) => (
          <View key={f.label} style={s.featureChip}>
            <Icon name={f.icon} size={11} color={colors.primary} />
            <Text style={s.featureChipText}>{f.label}</Text>
          </View>
        ))}
      </View>
      <Text style={s.fieldLabel}>NODE MONIKER</Text>
      <TextInput
        style={[s.input, monikerFocused && s.inputFocused]}
        value={regMoniker}
        onChangeText={setRegMoniker}
        onFocus={() => setMonikerFocused(true)}
        onBlur={() => setMonikerFocused(false)}
        placeholder="e.g. my-mchain-node"
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="none" autoCorrect={false} maxLength={40}
        editable={!registerMutation.isPending}
      />
      <Text style={s.fieldLabel}>COMMISSION RATE</Text>
      <View style={[s.commissionRow, commissionFocused && { borderColor: colors.primary }]}>
        <TextInput
          style={s.commissionInput}
          value={commissionRate}
          onChangeText={setCommissionRate}
          onFocus={() => setCommissionFocused(true)}
          onBlur={() => setCommissionFocused(false)}
          placeholder="5"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="decimal-pad" maxLength={5}
          editable={!registerMutation.isPending}
        />
        <Text style={s.commissionUnit}>%</Text>
      </View>
      {regError ? <Text style={s.errorText}>{regError}</Text> : null}
      <TouchableOpacity style={s.registerBtn} onPress={() => registerMutation.mutate()} disabled={registerMutation.isPending} activeOpacity={0.85}>
        <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.registerBtnGrad}>
          {registerMutation.isPending ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
            <>
              <Icon name="shield-outline" size={18} color="#FFFFFF" />
              <Text style={s.registerBtnText}>Register as Validator</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  // ── List header ──────────────────────────────────────────────────────────────
  const ListHeader = (
    <>
      <View style={s.header}>
        <Text style={s.headerTitle}>Validator</Text>
        {!isRegistered && <Text style={s.headerSub}>Register to start earning MC rewards</Text>}
      </View>

      {!isRegistered && RegisterForm}

      {isRegistered && (
        <>
          {HeroCard}
          {EarningsCard}

          {/* Sub-tabs */}
          <View style={s.tabsWrap}>
            {(["treasury", "gas", "blocks"] as SubTab[]).map((tab) => {
              const label = tab === "treasury" ? "Treasury" : tab === "gas" ? "Gas Fees" : "Blocks";
              const isActive = activeTab === tab;
              return (
                <TouchableOpacity key={tab} style={[s.tabBtn, isActive && s.tabBtnActive]} onPress={() => setActiveTab(tab)}>
                  <Text style={[s.tabBtnText, isActive && s.tabBtnTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {activeError() && (
            <View style={s.errorBanner}>
              <Icon name="alert-circle-outline" size={18} color="#F87171" />
              <Text style={s.errorBannerText}>{activeError()}</Text>
              <TouchableOpacity style={s.retryBtn} onPress={handleRetry}>
                <Text style={s.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {activeTab === "blocks" && blocksItems.length > 0 && (
            <View style={s.tableHeader}>
              <Text style={s.thBlock}>BLOCK</Text>
              <Text style={s.thTxs}>TXS</Text>
              <Text style={s.thGas}>GAS USED</Text>
              <Text style={s.thTime}>TIME</Text>
            </View>
          )}

          {activeInitLoading() && (
            <>{[0, 1, 2, 3].map((i) => <SkeletonRow key={i} colors={colors} />)}</>
          )}
        </>
      )}
    </>
  );

  const items = activeItems();

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        style={s.container}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              refetchValidator();
              refetchEarnings();
              loadTreasury(0, false);
              if (activeTab === "gas") loadGas(0, false);
              if (activeTab === "blocks") loadBlocks(0, false);
            }}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={ListHeader}
        data={(isRegistered && !activeInitLoading() ? items : []) as any[]}
        keyExtractor={(item, i) => {
          if (activeTab === "treasury") return (item as TreasuryReward).id;
          if (activeTab === "gas") return String((item as GasReward).blockHeight);
          return String((item as ValidatorBlock).height) + i;
        }}
        renderItem={({ item }) => {
          if (activeTab === "treasury") return <TreasuryRowItem item={item as TreasuryReward} />;
          if (activeTab === "gas") return <GasRowItem item={item as GasReward} />;
          return <BlockRowItem item={item as ValidatorBlock} />;
        }}
        ListEmptyComponent={
          isRegistered && !activeInitLoading() && !activeError() ? (
            <View style={s.emptyState}>
              <Icon name="bar-chart-outline" size={36} color={colors.border} />
              <Text style={s.emptyText}>No {activeTab} data yet</Text>
              <Text style={s.emptySubText}>Data will appear here once your validator starts earning.</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          isRegistered && activeHasMore() ? (
            <TouchableOpacity style={s.loadMoreBtn} onPress={handleLoadMore} disabled={activeLoadingMore()}>
              {activeLoadingMore() ? <ActivityIndicator color={colors.primary} size="small" /> : (
                <Text style={s.loadMoreText}>Load More</Text>
              )}
            </TouchableOpacity>
          ) : null
        }
      />
      <Toast message={toast} visible={!!toast} onHide={() => setToast("")} />
    </View>
  );
}
