import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import {
  api,
  type GasReward,
  type TreasuryReward,
  type ValidatorBlock,
} from "@/services/api";
import { Toast } from "@/components/Toast";
import { useColors } from "@/hooks/useColors";

type SubTab = "treasury" | "gas" | "blocks";

function parsePeriodLabel(period: string): string {
  const [datePart, hourPart] = period.split("T");
  if (!datePart) return period;
  const d = new Date(`${datePart}T${(hourPart ?? "00").padStart(2, "0")}:00:00Z`);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${date} – ${(hourPart ?? "00").padStart(2, "0")}:00`;
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function uptimeColor(pct: number): string {
  if (pct >= 80) return "#10B981";
  if (pct >= 50) return "#F59E0B";
  return "#EF4444";
}

function SkeletonRow({ colors }: { colors: ReturnType<typeof useColors> }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [opacity]);
  return (
    <Animated.View style={{ opacity, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ height: 12, width: "60%", backgroundColor: colors.muted, borderRadius: 6, marginBottom: 8 }} />
      <View style={{ height: 10, width: "40%", backgroundColor: colors.muted, borderRadius: 6 }} />
    </Animated.View>
  );
}

export default function EarningsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mxcAddress } = useWallet();

  const [activeTab, setActiveTab] = useState<SubTab>("treasury");
  const [toast, setToast] = useState("");

  const [treasuryItems, setTreasuryItems] = useState<TreasuryReward[]>([]);
  const [treasuryTotal, setTreasuryTotal] = useState(0);
  const [treasuryOffset, setTreasuryOffset] = useState(0);
  const [treasuryInitLoading, setTreasuryInitLoading] = useState(true);
  const [treasuryLoadingMore, setTreasuryLoadingMore] = useState(false);
  const [treasuryError, setTreasuryError] = useState<string | null>(null);

  const [gasItems, setGasItems] = useState<GasReward[]>([]);
  const [gasTotal, setGasTotal] = useState(0);
  const [gasOffset, setGasOffset] = useState(0);
  const [gasInitLoading, setGasInitLoading] = useState(true);
  const [gasLoadingMore, setGasLoadingMore] = useState(false);
  const [gasError, setGasError] = useState<string | null>(null);

  const [blocksItems, setBlocksItems] = useState<ValidatorBlock[]>([]);
  const [blocksTotal, setBlocksTotal] = useState(0);
  const [blocksOffset, setBlocksOffset] = useState(0);
  const [blocksInitLoading, setBlocksInitLoading] = useState(true);
  const [blocksLoadingMore, setBlocksLoadingMore] = useState(false);
  const [blocksError, setBlocksError] = useState<string | null>(null);

  const earningsQuery = useQuery({
    queryKey: ["earnings", mxcAddress],
    queryFn: () => api.getValidatorEarnings(mxcAddress!),
    enabled: !!mxcAddress,
    refetchInterval: 60_000,
    retry: 1,
  });

  const earnings = earningsQuery.data;
  const is404 =
    (earningsQuery.error as (Error & { status?: number }) | null)?.status === 404;

  const loadTreasury = useCallback(
    async (offset: number, append: boolean) => {
      if (!mxcAddress) return;
      if (offset === 0) setTreasuryInitLoading(true);
      else setTreasuryLoadingMore(true);
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
    },
    [mxcAddress]
  );

  const loadGas = useCallback(
    async (offset: number, append: boolean) => {
      if (!mxcAddress) return;
      if (offset === 0) setGasInitLoading(true);
      else setGasLoadingMore(true);
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
    },
    [mxcAddress]
  );

  const loadBlocks = useCallback(
    async (offset: number, append: boolean) => {
      if (!mxcAddress) return;
      if (offset === 0) setBlocksInitLoading(true);
      else setBlocksLoadingMore(true);
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
    },
    [mxcAddress]
  );

  useEffect(() => {
    if (mxcAddress) loadTreasury(0, false);
  }, [mxcAddress, loadTreasury]);

  useEffect(() => {
    if (mxcAddress && activeTab === "gas" && gasItems.length === 0) loadGas(0, false);
  }, [activeTab, mxcAddress, gasItems.length, loadGas]);

  useEffect(() => {
    if (mxcAddress && activeTab === "blocks" && blocksItems.length === 0) loadBlocks(0, false);
  }, [activeTab, mxcAddress, blocksItems.length, loadBlocks]);

  async function copyText(text: string, label: string) {
    await Clipboard.setStringAsync(text);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setToast(`${label} copied`);
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    headerTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground },
    notRegistered: {
      marginHorizontal: 20,
      marginTop: 12,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      alignItems: "center",
      gap: 8,
    },
    notRegText: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground, textAlign: "center" },
    summaryGrad: { marginHorizontal: 20, borderRadius: colors.radius + 4, overflow: "hidden", marginBottom: 12 },
    summaryInner: { padding: 16 },
    summaryTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.6)", letterSpacing: 1.5, marginBottom: 12 },
    statBoxRow: { flexDirection: "row", gap: 8 },
    statBox: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 10, padding: 10 },
    statBoxLabel: { fontSize: 9, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.5)", letterSpacing: 1, marginBottom: 4 },
    statBoxValue: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#FFFFFF", marginBottom: 2 },
    statBoxSub: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)" },
    pillRow: { flexDirection: "row", gap: 8, marginHorizontal: 20, marginBottom: 12 },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    pillText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.foreground },
    tabRow: {
      flexDirection: "row",
      marginHorizontal: 20,
      marginBottom: 4,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 3,
    },
    tabBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: colors.radius - 2 },
    tabBtnActive: { backgroundColor: colors.primary },
    tabBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    tabBtnTextActive: { color: "#FFFFFF" },
    listSeparator: { height: 1, backgroundColor: colors.border, marginLeft: 20 },
    treasuryRow: { paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    treasuryTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
    treasuryPeriod: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground, flex: 1 },
    treasuryAmount: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.success },
    uptimeBarBg: { height: 6, backgroundColor: colors.muted, borderRadius: 3, marginBottom: 6, overflow: "hidden" },
    uptimeBarFill: { height: "100%", borderRadius: 3 },
    treasuryBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    uptimePctText: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    statusChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    statusChipText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
    gasRow: { paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    gasTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
    gasBlock: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    gasShare: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.success },
    gasMid: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    gasFee: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    splitChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    splitChipText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
    gasTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4 },
    tableHeader: {
      flexDirection: "row",
      paddingHorizontal: 20,
      paddingVertical: 8,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    thBlock: { width: 80, fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1 },
    thTxs: { width: 36, fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1 },
    thGas: { flex: 1, fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1 },
    thTime: { width: 90, fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1, textAlign: "right" },
    blockRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    blockRowHighlight: { borderLeftWidth: 3, borderLeftColor: "#10B98160", paddingLeft: 17 },
    blockHeight: { width: 80, fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    blockTxs: { width: 36, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground },
    blockGas: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    blockTime: { width: 90, fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "right" },
    loadMoreBtn: { marginHorizontal: 20, marginVertical: 16, paddingVertical: 12, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
    loadMoreText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primary },
    emptyState: { paddingVertical: 40, alignItems: "center", gap: 8 },
    emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    errorBanner: {
      marginHorizontal: 20,
      marginVertical: 12,
      backgroundColor: "#1A0000",
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: "#EF444440",
      padding: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    errorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#F87171" },
    retryBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "#EF444420" },
    retryText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#F87171" },
  });

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
          <Text style={s.uptimePctText}>{item.uptimePct}% uptime • {item.activeMinutes}/{item.totalNetworkMinutes} min</Text>
          {isDistributed ? (
            <View style={[s.statusChip, { backgroundColor: "#10B98120" }]}>
              <Text style={[s.statusChipText, { color: "#10B981" }]}>distributed</Text>
            </View>
          ) : (
            <View style={[s.statusChip, { backgroundColor: "#F59E0B20" }]}>
              <Text style={[s.statusChipText, { color: "#F59E0B" }]}>pending</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  function GasRowItem({ item }: { item: GasReward }) {
    const chipColor = item.isStaked ? "#10B981" : "#F59E0B";
    const chipBg = item.isStaked ? "#10B98120" : "#F59E0B20";
    return (
      <TouchableOpacity style={s.gasRow} onPress={() => copyText(String(item.blockHeight), `Block #${item.blockHeight}`)} activeOpacity={0.7}>
        <View style={s.gasTop}>
          <Text style={s.gasBlock}>Block #{item.blockHeight.toLocaleString()} — {item.txCount} tx{item.txCount !== 1 ? "s" : ""}</Text>
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
      <TouchableOpacity style={[s.blockRow, hasActivity && s.blockRowHighlight]} onPress={() => copyText(item.hash, `Block hash`)} activeOpacity={0.7}>
        <Text style={s.blockHeight}>#{item.height.toLocaleString()}</Text>
        <Text style={[s.blockTxs, hasActivity && { color: colors.success }]}>{item.txCount}</Text>
        <Text style={s.blockGas}>{item.gasUsed.toLocaleString()}</Text>
        <Text style={s.blockTime}>{timeLabel}</Text>
      </TouchableOpacity>
    );
  }

  const SummaryHeader = (
    <>
      <View style={s.header}>
        <Text style={s.headerTitle}>Earnings</Text>
      </View>

      {is404 && (
        <View style={s.notRegistered}>
          <Ionicons name="shield-half-outline" size={28} color={colors.mutedForeground} />
          <Text style={s.notRegText}>Validator not registered yet</Text>
        </View>
      )}

      {earnings && (
        <>
          <LinearGradient colors={["#0D2B4E", "#091929"]} style={s.summaryGrad}>
            <View style={s.summaryInner}>
              <Text style={s.summaryTitle}>EARNINGS SUMMARY</Text>
              <View style={s.statBoxRow}>
                <View style={s.statBox}>
                  <Text style={s.statBoxLabel}>TREASURY</Text>
                  <Text style={s.statBoxValue}>{parseFloat(earnings.earnings.treasuryTotalMc).toFixed(4)}</Text>
                  <Text style={s.statBoxSub}>{earnings.stats.totalRewardPeriods} periods</Text>
                </View>
                <View style={s.statBox}>
                  <Text style={s.statBoxLabel}>GAS FEES</Text>
                  <Text style={s.statBoxValue}>{parseFloat(earnings.earnings.gasTotalMc).toFixed(4)}</Text>
                  <Text style={s.statBoxSub}>{earnings.stats.totalBlocksProposed} blk · {earnings.stats.totalTxsProcessed} tx</Text>
                </View>
                <View style={s.statBox}>
                  <Text style={s.statBoxLabel}>COMBINED</Text>
                  <Text style={[s.statBoxValue, { color: "#10B981" }]}>{parseFloat(earnings.earnings.combinedTotalMc).toFixed(4)}</Text>
                  <Text style={s.statBoxSub}>all time</Text>
                </View>
              </View>
            </View>
          </LinearGradient>

          <View style={s.pillRow}>
            <View style={s.pill}>
              <Ionicons name="cube-outline" size={12} color={colors.mutedForeground} />
              <Text style={s.pillText}>Blocks: {earnings.stats.totalBlocksProposed.toLocaleString()}</Text>
            </View>
            <View style={s.pill}>
              <Ionicons name="repeat-outline" size={12} color={colors.mutedForeground} />
              <Text style={s.pillText}>Txs: {earnings.stats.totalTxsProcessed.toLocaleString()}</Text>
            </View>
          </View>
        </>
      )}

      {earningsQuery.isLoading && !earnings && (
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <View style={{ height: 110, backgroundColor: colors.card, borderRadius: colors.radius + 4, borderWidth: 1, borderColor: colors.border }} />
        </View>
      )}

      <View style={s.tabRow}>
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
    </>
  );

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

  function activeItems() {
    if (activeTab === "treasury") return treasuryItems;
    if (activeTab === "gas") return gasItems;
    return blocksItems;
  }

  function activeTotal() {
    if (activeTab === "treasury") return treasuryTotal;
    if (activeTab === "gas") return gasTotal;
    return blocksTotal;
  }

  function activeOffset() {
    if (activeTab === "treasury") return treasuryOffset;
    if (activeTab === "gas") return gasOffset;
    return blocksOffset;
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

  const items = activeItems();
  const hasMore = activeOffset() < activeTotal();

  return (
    <View style={s.container}>
      <FlatList
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              loadTreasury(0, false);
              if (activeTab === "gas") loadGas(0, false);
              if (activeTab === "blocks") loadBlocks(0, false);
            }}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            {SummaryHeader}
            {activeError() && (
              <View style={s.errorBanner}>
                <Ionicons name="alert-circle-outline" size={18} color="#F87171" />
                <Text style={s.errorText}>{activeError()}</Text>
                <TouchableOpacity style={s.retryBtn} onPress={handleRetry}>
                  <Text style={s.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
            {activeTab === "blocks" && items.length > 0 && (
              <View style={s.tableHeader}>
                <Text style={s.thBlock}>BLOCK</Text>
                <Text style={s.thTxs}>TXS</Text>
                <Text style={s.thGas}>GAS</Text>
                <Text style={s.thTime}>TIME</Text>
              </View>
            )}
            {activeInitLoading() && (
              <>
                <SkeletonRow colors={colors} />
                <SkeletonRow colors={colors} />
                <SkeletonRow colors={colors} />
              </>
            )}
          </>
        }
        data={activeInitLoading() ? [] : items}
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
          !activeInitLoading() && !activeError() ? (
            <View style={s.emptyState}>
              <Ionicons name="bar-chart-outline" size={32} color={colors.mutedForeground} />
              <Text style={s.emptyText}>No data yet</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          hasMore ? (
            <TouchableOpacity style={s.loadMoreBtn} onPress={handleLoadMore} disabled={activeLoadingMore()}>
              {activeLoadingMore() ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
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
