import { AddTokenModal } from "@/components/AddTokenModal";
import { Icon } from "@/components/Icon";
import { NewWalletModal } from "@/components/NewWalletModal";
import { WalletSwitcherModal } from "@/components/WalletSwitcherModal";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import { api } from "@/services/api";
import { formatDate, formatUptime, shortenAddress, weiToMc } from "@/services/crypto";
import { getCustomTokens, removeCustomToken, type CustomToken } from "@/services/tokens";
import { PulsingDot } from "@/components/PulsingDot";
import { SessionTimer } from "@/components/SessionTimer";
import { Toast } from "@/components/Toast";
import { useColors } from "@/hooks/useColors";

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    mxcAddress,
    moniker,
    validatorStatus,
    setValidatorStatus,
    pendingHeartbeat,
    sessionExpired,
    setSessionExpired,
    sessionExpiresAt,
    isStaked,
  } = useWallet();
  const { restartSession } = useHeartbeat();
  const [toastMessage, setToastMessage] = React.useState("");
  const [isRestarting, setIsRestarting] = React.useState(false);
  const [showNewWallet, setShowNewWallet] = React.useState(false);
  const [showSwitcher, setShowSwitcher] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"assets" | "nft" | "approvals">("assets");
  const [showAddToken, setShowAddToken] = React.useState(false);
  const [rpcMs, setRpcMs] = React.useState<number | null>(null);
  const [rpcPinging, setRpcPinging] = React.useState(false);
  const [showRpcBadge, setShowRpcBadge] = React.useState(false);
  const rpcBadgeOpacity = useRef(new Animated.Value(0)).current;
  const rpcHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On-tap ping — updates dot colour AND shows ms badge
  async function handlePingRpc() {
    if (rpcPinging) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRpcPinging(true);
    if (rpcHideTimer.current) clearTimeout(rpcHideTimer.current);
    Animated.timing(rpcBadgeOpacity, { toValue: 0, duration: 100, useNativeDriver: true }).start();
    try {
      const start = Date.now();
      await api.ping();
      setRpcMs(Date.now() - start);
    } catch {
      setRpcMs(-1);
    } finally {
      setRpcPinging(false);
      setShowRpcBadge(true);
      Animated.timing(rpcBadgeOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      rpcHideTimer.current = setTimeout(() => {
        Animated.timing(rpcBadgeOpacity, { toValue: 0, duration: 400, useNativeDriver: true }).start();
        setTimeout(() => setShowRpcBadge(false), 400);
      }, 4000);
    }
  }

  // Auto-poll: ping immediately, then every 30 s.
  // The `cancelled` flag ensures results from a stale effect invocation
  // (Expo Router remounts) never overwrite state from the live one.
  React.useEffect(() => {
    let cancelled = false;

    async function ping() {
      if (cancelled) return;
      try {
        const start = Date.now();
        await api.ping();
        if (!cancelled) setRpcMs(Date.now() - start);
      } catch {
        if (!cancelled) setRpcMs(-1);
      }
    }

    ping();
    const id = setInterval(ping, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function handleRestartSession() {
    setIsRestarting(true);
    try {
      await restartSession();
      setToastMessage("Session restarted — you're earning rewards again");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to restart session";
      setToastMessage(msg);
    } finally {
      setIsRestarting(false);
    }
  }

  const { data: account, isLoading: acctLoading, refetch: refetchAccount } = useQuery({
    queryKey: ["account", mxcAddress],
    queryFn: () => api.getAccount(mxcAddress!),
    enabled: !!mxcAddress,
    refetchInterval: 10_000,
  });

  const { data: chainInfo, refetch: refetchChain } = useQuery({
    queryKey: ["chainInfo"],
    queryFn: () => api.getChainInfo(),
    refetchInterval: 10_000,
  });

  const { data: validatorData, refetch: refetchValidator } = useQuery({
    queryKey: ["validator", mxcAddress],
    queryFn: () => api.getValidatorStatus(mxcAddress!),
    enabled: !!mxcAddress,
    refetchInterval: 30_000,
  });

  const {
    data: customTokens = [],
    refetch: refetchTokens,
  } = useQuery<CustomToken[]>({
    queryKey: ["customTokens"],
    queryFn: getCustomTokens,
    staleTime: 0,
  });

  useEffect(() => {
    if (validatorData?.validator?.status) {
      setValidatorStatus(validatorData.validator.status);
    }
  }, [validatorData, setValidatorStatus]);

  const isRefreshing = false;

  async function handleRefresh() {
    await Promise.all([refetchAccount(), refetchChain(), refetchValidator()]);
  }

  async function copyAddress() {
    if (!mxcAddress) return;
    await Clipboard.setStringAsync(mxcAddress);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const balance = account?.balance ? weiToMc(account.balance) : "0.00";
  const vStatus = validatorData?.validator?.status ?? validatorStatus;

  const s = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      paddingBottom: 100,
    },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 8),
      paddingHorizontal: 20,
      paddingBottom: 16,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    headerIconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    rpcBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rpcBadgeDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    rpcBadgeText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    balanceCard: {
      marginHorizontal: 20,
      borderRadius: colors.radius + 4,
      overflow: "hidden",
      marginBottom: 16,
    },
    balanceGrad: {
      padding: 24,
    },
    balanceLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: "rgba(255,255,255,0.6)",
      letterSpacing: 2,
      marginBottom: 6,
    },
    balanceAmount: {
      fontSize: 44,
      fontFamily: "Inter_700Bold",
      color: "#FFFFFF",
      marginBottom: 4,
    },
    balanceSub: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: "rgba(255,255,255,0.5)",
      marginBottom: 20,
    },
    addressRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "rgba(0,0,0,0.2)",
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    addressText: {
      flex: 1,
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: "rgba(255,255,255,0.7)",
    },
    validatorCard: {
      marginHorizontal: 20,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 16,
    },
    validatorHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    validatorTitle: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      letterSpacing: 1.5,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    statusText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: vStatus === "active" ? "#10B981" : vStatus === "pending" ? "#F59E0B" : vStatus === "banned" ? "#EF4444" : colors.mutedForeground,
    },
    uptimeText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    pendingBanner: {
      marginHorizontal: 20,
      marginBottom: 16,
      backgroundColor: "#1A1000",
      borderRadius: colors.radius - 4,
      borderWidth: 1,
      borderColor: "#F59E0B40",
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    pendingText: {
      flex: 1,
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: "#D4A017",
    },
    quickActions: {
      flexDirection: "row",
      paddingHorizontal: 20,
      gap: 12,
      marginBottom: 16,
    },
    tabsContainer: {
      marginHorizontal: 20,
      marginBottom: 20,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    tabBar: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tabItem: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 14,
      position: "relative",
    },
    tabLabel: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    tabLabelActive: {
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    tabUnderline: {
      position: "absolute",
      bottom: 0,
      left: "20%",
      right: "20%",
      height: 2,
      borderRadius: 1,
      backgroundColor: colors.primary,
    },
    tabPanel: {
      paddingVertical: 4,
    },
    tokenRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
    },
    tokenIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary + "20",
      borderWidth: 1,
      borderColor: colors.primary + "40",
      alignItems: "center",
      justifyContent: "center",
    },
    tokenIconText: {
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
    },
    tokenInfo: {
      flex: 1,
      gap: 2,
    },
    tokenName: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    tokenSymbol: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    tokenAmountCol: {
      alignItems: "flex-end",
      gap: 2,
    },
    tokenAmount: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    tokenSub: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    tokenLogoImg: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    verifiedBadge: {
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 5,
      backgroundColor: "#10B98115",
      borderWidth: 1,
      borderColor: "#10B98140",
    },
    verifiedText: {
      fontSize: 9,
      fontFamily: "Inter_700Bold",
      color: "#10B981",
    },
    addTokenRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 10,
      marginBottom: 2,
      paddingVertical: 13,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary + "38",
      backgroundColor: colors.primary + "0A",
    },
    addTokenLabel: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
      letterSpacing: 0.25,
    },
    emptyPanel: {
      alignItems: "center",
      paddingVertical: 32,
      paddingHorizontal: 24,
      gap: 10,
    },
    emptyTitle: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    emptyDesc: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 18,
    },
    actionBtn: {
      flex: 1,
      borderRadius: colors.radius - 4,
      overflow: "hidden",
    },
    actionGrad: {
      paddingVertical: 14,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    actionText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: "#FFFFFF",
    },
    sessionCard: {
      marginHorizontal: 20,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 16,
    },
    sessionRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      flexWrap: "wrap" as const,
    },
    sessionTimerHint: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 4,
    },
    sessionExpiredHeader: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
      marginBottom: 8,
    },
    sessionExpiredTitle: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: "#F59E0B",
    },
    sessionExpiredDesc: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 20,
      marginBottom: 16,
    },
    restartBtn: {
      borderRadius: colors.radius - 4,
      overflow: "hidden" as const,
    },
    restartGrad: {
      paddingVertical: 14,
      alignItems: "center" as const,
      flexDirection: "row" as const,
      justifyContent: "center" as const,
      gap: 8,
    },
    restartBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: "#FFFFFF",
    },
    stakedBadge: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
    },
    stakedText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.success,
    },
  });

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <View style={s.header}>
          <TouchableOpacity style={s.headerLeft} onPress={() => setShowSwitcher(true)} activeOpacity={0.7}>
            <Icon name="menu" size={22} color={colors.foreground} />
            <TouchableOpacity
              onPress={handlePingRpc}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              {rpcPinging ? (
                <ActivityIndicator size={10} color={colors.primary} style={{ width: 10, height: 10 }} />
              ) : (
                <View style={[s.statusDot, {
                  backgroundColor:
                    rpcMs === null ? colors.mutedForeground :
                    rpcMs < 0 ? "#EF4444" :
                    rpcMs < 300 ? "#10B981" :
                    rpcMs < 700 ? "#F59E0B" : "#EF4444",
                }]} />
              )}
            </TouchableOpacity>
            {showRpcBadge && rpcMs !== null && (
              <Animated.View style={[s.rpcBadge, { opacity: rpcBadgeOpacity }]} pointerEvents="none">
                <View style={[s.rpcBadgeDot, {
                  backgroundColor:
                    rpcMs < 0 ? "#EF4444" :
                    rpcMs < 300 ? "#10B981" :
                    rpcMs < 700 ? "#F59E0B" : "#EF4444",
                }]} />
                <Text style={s.rpcBadgeText}>
                  {rpcMs < 0 ? "error" : `${rpcMs} ms`}
                </Text>
              </Animated.View>
            )}
          </TouchableOpacity>
          <View style={s.headerRight}>
            <TouchableOpacity style={s.headerIconBtn} onPress={() => setShowNewWallet(true)}>
              <Icon name="wallet" size={18} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity style={s.headerIconBtn} onPress={() => router.push("/(tabs)/send")}>
              <Icon name="scan" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.balanceCard}>
          <LinearGradient
            colors={["#0D2B4E", "#0EA5E9"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.balanceGrad}
          >
            <Text style={s.balanceLabel}>MC BALANCE</Text>
            {acctLoading ? (
              <ActivityIndicator color="#FFFFFF" style={{ marginBottom: 4 }} />
            ) : (
              <Text style={s.balanceAmount}>{balance}</Text>
            )}

            <TouchableOpacity style={s.addressRow} onPress={copyAddress}>
              <Text style={s.addressText} numberOfLines={1}>
                {mxcAddress ? shortenAddress(mxcAddress, 8) : "—"}
              </Text>
              <Icon name="copy-outline" size={14} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </LinearGradient>
        </View>

        {vStatus === "banned" && (
          <View style={[s.pendingBanner, { borderColor: "#EF444440", backgroundColor: "#1A0000" }]}>
            <Icon name="alert-circle-outline" size={16} color="#EF4444" />
            <Text style={[s.pendingText, { color: "#F87171" }]}>Validator has been banned</Text>
          </View>
        )}


        <View style={s.quickActions}>
          <TouchableOpacity style={s.actionBtn} onPress={() => router.push("/(tabs)/send")}>
            <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.actionGrad}>
              <Icon name="paper-plane-outline" size={16} color="#FFFFFF" />
              <Text style={s.actionText}>Send</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={() => router.push("/(tabs)/receive")}>
            <LinearGradient colors={["#152238", "#1E3A5F"]} style={s.actionGrad}>
              <Icon name="download-outline" size={16} color={colors.primary} />
              <Text style={[s.actionText, { color: colors.primary }]}>Receive</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ── Portfolio tabs ─────────────────────────────────── */}
        <View style={s.tabsContainer}>
          {/* Tab bar */}
          <View style={s.tabBar}>
            {(["assets", "nft", "approvals"] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={s.tabItem}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.7}
              >
                <Text style={[s.tabLabel, activeTab === tab && s.tabLabelActive]}>
                  {tab === "assets" ? "Assets" : tab === "nft" ? "NFT" : "Approvals"}
                </Text>
                {activeTab === tab && <View style={s.tabUnderline} />}
              </TouchableOpacity>
            ))}
          </View>

          {/* Assets */}
          {activeTab === "assets" && (
            <View style={s.tabPanel}>
              {/* Native MC row */}
              <View style={s.tokenRow}>
                <View style={s.tokenIconWrap}>
                  <Text style={s.tokenIconText}>MC</Text>
                </View>
                <View style={s.tokenInfo}>
                  <Text style={s.tokenName}>MChain</Text>
                  <Text style={s.tokenSymbol}>MC · Native</Text>
                </View>
                <View style={s.tokenAmountCol}>
                  <Text style={s.tokenAmount}>{balance}</Text>
                  <Text style={s.tokenSub}>MC</Text>
                </View>
              </View>

              {/* Custom tokens */}
              {customTokens.map((token) => (
                <View key={token.id} style={s.tokenRow}>
                  {token.logoUrl ? (
                    <Image source={{ uri: token.logoUrl }} style={s.tokenLogoImg} />
                  ) : (
                    <View style={s.tokenIconWrap}>
                      <Text style={s.tokenIconText}>{token.symbol.slice(0, 3)}</Text>
                    </View>
                  )}
                  <View style={s.tokenInfo}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={s.tokenName}>{token.symbol}</Text>
                      {token.verified && (
                        <View style={s.verifiedBadge}>
                          <Text style={s.verifiedText}>✓</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.tokenSymbol} numberOfLines={1}>{token.name}</Text>
                  </View>
                  <View style={s.tokenAmountCol}>
                    <Text style={[s.tokenAmount, { color: colors.mutedForeground }]}>—</Text>
                    <TouchableOpacity
                      onPress={async () => {
                        await removeCustomToken(token.contractAddress);
                        refetchTokens();
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Icon name="trash-outline" size={14} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* Add token button */}
              <TouchableOpacity
                style={s.addTokenRow}
                onPress={() => setShowAddToken(true)}
                activeOpacity={0.75}
              >
                <Icon name="plus-circle" size={15} color={colors.primary} />
                <Text style={s.addTokenLabel}>Add Token</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* NFT */}
          {activeTab === "nft" && (
            <View style={s.emptyPanel}>
              <Icon name="cube-outline" size={36} color={colors.border} />
              <Text style={s.emptyTitle}>No NFTs found</Text>
              <Text style={s.emptyDesc}>NFTs held by this wallet will appear here.</Text>
            </View>
          )}

          {/* Approvals */}
          {activeTab === "approvals" && (
            <View style={s.emptyPanel}>
              <Icon name="shield-outline" size={36} color={colors.border} />
              <Text style={s.emptyTitle}>No active approvals</Text>
              <Text style={s.emptyDesc}>
                Contract approvals grant a smart contract permission to spend your tokens.
                {"\n"}None have been detected for this wallet.
              </Text>
            </View>
          )}
        </View>

      </ScrollView>
      <Toast
        message={toastMessage}
        visible={!!toastMessage}
        onHide={() => setToastMessage("")}
      />
      <WalletSwitcherModal
        visible={showSwitcher}
        onClose={() => setShowSwitcher(false)}
        onAddWallet={() => setShowNewWallet(true)}
      />
      <NewWalletModal
        visible={showNewWallet}
        onClose={() => setShowNewWallet(false)}
      />
      <AddTokenModal
        visible={showAddToken}
        onClose={() => setShowAddToken(false)}
        onAdded={() => { refetchTokens(); }}
      />
    </View>
  );
}
