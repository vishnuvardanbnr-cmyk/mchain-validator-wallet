import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { PulsingDot } from "@/components/PulsingDot";
import { useColors } from "@/hooks/useColors";

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mxcAddress, moniker, validatorStatus, setValidatorStatus, pendingHeartbeat } = useWallet();
  useHeartbeat();

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

  const { data: txData, refetch: refetchTx } = useQuery({
    queryKey: ["transactions", mxcAddress],
    queryFn: () => api.getTransactions(mxcAddress!, 5),
    enabled: !!mxcAddress,
    refetchInterval: 15_000,
  });

  const { data: validatorData, refetch: refetchValidator } = useQuery({
    queryKey: ["validator", mxcAddress],
    queryFn: () => api.getValidatorStatus(mxcAddress!),
    enabled: !!mxcAddress,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (validatorData?.validator?.status) {
      setValidatorStatus(validatorData.validator.status);
    }
  }, [validatorData, setValidatorStatus]);

  const isRefreshing = false;

  async function handleRefresh() {
    await Promise.all([refetchAccount(), refetchChain(), refetchTx(), refetchValidator()]);
  }

  async function copyAddress() {
    if (!mxcAddress) return;
    await Clipboard.setStringAsync(mxcAddress);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const balance = account?.balance ? weiToMc(account.balance) : "0.00";
  const vStatus = validatorData?.validator?.status ?? validatorStatus;
  const transactions = txData?.transactions ?? [];

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
    headerMoniker: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    headerBlock: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
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
    sectionHeader: {
      paddingHorizontal: 20,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      letterSpacing: 1.5,
    },
    seeAll: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
    txRow: {
      marginHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    txIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    txAmount: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
    txAddr: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    txTime: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginLeft: "auto" as const,
    },
    emptyState: {
      marginHorizontal: 20,
      paddingVertical: 32,
      alignItems: "center",
    },
    emptyText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 8,
    },
    quickActions: {
      flexDirection: "row",
      paddingHorizontal: 20,
      gap: 12,
      marginBottom: 20,
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
          <Text style={s.headerMoniker}>{moniker || "Validator"}</Text>
          {chainInfo && (
            <Text style={s.headerBlock}>Block #{chainInfo.blockHeight?.toLocaleString() ?? "—"}</Text>
          )}
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
            <Text style={s.balanceSub}>MC • Fixed Supply 180M</Text>
            <TouchableOpacity style={s.addressRow} onPress={copyAddress}>
              <Text style={s.addressText} numberOfLines={1}>
                {mxcAddress ? shortenAddress(mxcAddress, 8) : "—"}
              </Text>
              <Feather name="copy" size={14} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </LinearGradient>
        </View>

        {(pendingHeartbeat || vStatus === "pending") && (
          <View style={s.pendingBanner}>
            <Feather name="clock" size={16} color="#F59E0B" />
            <Text style={s.pendingText}>Waiting for admin approval to start validating</Text>
          </View>
        )}

        {vStatus === "banned" && (
          <View style={[s.pendingBanner, { borderColor: "#EF444440", backgroundColor: "#1A0000" }]}>
            <Feather name="alert-circle" size={16} color="#EF4444" />
            <Text style={[s.pendingText, { color: "#F87171" }]}>Validator has been banned</Text>
          </View>
        )}

        <View style={s.validatorCard}>
          <View style={s.validatorHeader}>
            <Text style={s.validatorTitle}>VALIDATOR STATUS</Text>
            <View style={s.statusRow}>
              <PulsingDot status={vStatus ?? null} size={8} />
              <Text style={s.statusText}>
                {vStatus ? vStatus.charAt(0).toUpperCase() + vStatus.slice(1) : "Unknown"}
              </Text>
            </View>
          </View>
          {validatorData?.validator && (
            <Text style={s.uptimeText}>
              Uptime: {formatUptime(validatorData.validator.totalActiveMinutes)}
              {validatorData.validator.lastSeenAt && (
                `  •  Last seen: ${formatDate(validatorData.validator.lastSeenAt)}`
              )}
            </Text>
          )}
        </View>

        <View style={s.quickActions}>
          <TouchableOpacity style={s.actionBtn} onPress={() => router.push("/(tabs)/send")}>
            <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.actionGrad}>
              <Feather name="send" size={16} color="#FFFFFF" />
              <Text style={s.actionText}>Send</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={() => router.push("/(tabs)/receive")}>
            <LinearGradient colors={["#152238", "#1E3A5F"]} style={s.actionGrad}>
              <Feather name="download" size={16} color={colors.primary} />
              <Text style={[s.actionText, { color: colors.primary }]}>Receive</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>RECENT TRANSACTIONS</Text>
        </View>

        {transactions.length === 0 ? (
          <View style={s.emptyState}>
            <Feather name="inbox" size={32} color={colors.mutedForeground} />
            <Text style={s.emptyText}>No transactions yet</Text>
          </View>
        ) : (
          transactions.map((tx) => {
            const isOut = tx.from === mxcAddress;
            const otherAddr = isOut ? tx.to : tx.from;
            return (
              <View style={s.txRow} key={tx.hash}>
                <View style={[s.txIcon, { backgroundColor: isOut ? "#0EA5E920" : "#10B98120" }]}>
                  <Feather
                    name={isOut ? "arrow-up-right" : "arrow-down-left"}
                    size={18}
                    color={isOut ? colors.primary : colors.success}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.txAmount, { color: isOut ? colors.primary : colors.success }]}>
                    {isOut ? "-" : "+"}{weiToMc(tx.amount)} MC
                  </Text>
                  <Text style={s.txAddr}>{shortenAddress(otherAddr)}</Text>
                </View>
                <Text style={s.txTime}>{formatDate(tx.timestamp)}</Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
