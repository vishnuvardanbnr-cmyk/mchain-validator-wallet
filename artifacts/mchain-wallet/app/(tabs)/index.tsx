import { Icon } from "@/components/Icon";
import { NewWalletModal } from "@/components/NewWalletModal";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
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
          <View style={s.headerLeft}>
            <Icon name="menu" size={22} color={colors.foreground} />
            <View style={[s.statusDot, {
              backgroundColor:
                vStatus === "active" ? "#10B981" :
                vStatus === "pending" ? "#F59E0B" :
                vStatus === "banned" ? "#EF4444" :
                colors.mutedForeground,
            }]} />
          </View>
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

      </ScrollView>
      <Toast
        message={toastMessage}
        visible={!!toastMessage}
        onHide={() => setToastMessage("")}
      />
      <NewWalletModal
        visible={showNewWallet}
        onClose={() => setShowNewWallet(false)}
      />
    </View>
  );
}
