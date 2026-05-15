import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { api } from "@/services/api";
import { formatDate, formatUptime, weiToMc } from "@/services/crypto";
import { PulsingDot } from "@/components/PulsingDot";
import { useColors } from "@/hooks/useColors";

export default function ValidatorScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mxcAddress } = useWallet();

  const {
    data: validatorData,
    isLoading: validatorLoading,
    refetch: refetchValidator,
  } = useQuery({
    queryKey: ["validatorDetail", mxcAddress],
    queryFn: () => api.getValidatorStatus(mxcAddress!),
    enabled: !!mxcAddress,
    refetchInterval: 30_000,
  });

  const { data: rewardsData, refetch: refetchRewards } = useQuery({
    queryKey: ["rewards", mxcAddress],
    queryFn: () => api.getRewards(mxcAddress!, 30),
    enabled: !!mxcAddress,
    refetchInterval: 60_000,
  });

  const validator = validatorData?.validator;
  const rewards = rewardsData?.rewards ?? [];
  const totalEarned = rewards.reduce((acc, r) => {
    try {
      return acc + BigInt(r.amount);
    } catch {
      return acc;
    }
  }, BigInt(0));

  function statusColor(status: string | undefined) {
    switch (status) {
      case "active": return colors.success;
      case "pending": return colors.warning;
      case "banned": return colors.destructive;
      default: return colors.mutedForeground;
    }
  }

  const s = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    headerTitle: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    statusCard: {
      marginHorizontal: 20,
      borderRadius: colors.radius + 4,
      overflow: "hidden",
      marginBottom: 16,
    },
    statusGrad: {
      padding: 20,
    },
    statusTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    statusBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.3)",
    },
    statusBadgeText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
    },
    statsGrid: {
      flexDirection: "row",
      gap: 12,
    },
    statBox: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.2)",
      borderRadius: 10,
      padding: 12,
    },
    statLabel: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: "rgba(255,255,255,0.5)",
      letterSpacing: 1,
      marginBottom: 4,
    },
    statValue: {
      fontSize: 18,
      fontFamily: "Inter_700Bold",
      color: "#FFFFFF",
    },
    sectionCard: {
      marginHorizontal: 20,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
      overflow: "hidden",
    },
    sectionTitle: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      letterSpacing: 1.5,
      padding: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rewardRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    rewardDate: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      width: 90,
    },
    rewardAmount: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.success,
    },
    rewardShare: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    emptyState: {
      padding: 32,
      alignItems: "center",
    },
    emptyText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 8,
    },
    totalCard: {
      marginHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: "#10B98130",
      padding: 16,
      marginBottom: 16,
      gap: 14,
    },
    totalIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "#10B98120",
      alignItems: "center",
      justifyContent: "center",
    },
    totalLabel: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      marginBottom: 2,
    },
    totalValue: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.success,
    },
  });

  if (validatorLoading) {
    return (
      <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <FlatList
      style={s.container}
      contentContainerStyle={{ paddingBottom: 100 }}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => { refetchValidator(); refetchRewards(); }}
          tintColor={colors.primary}
        />
      }
      ListHeaderComponent={
        <>
          <View style={s.header}>
            <Text style={s.headerTitle}>Validator</Text>
          </View>

          <View style={s.statusCard}>
            <LinearGradient
              colors={["#0D2B4E", "#091929"]}
              style={s.statusGrad}
            >
              <View style={s.statusTop}>
                <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFFFFF" }}>
                  {validator?.moniker ?? "Your Node"}
                </Text>
                <View style={s.statusBadge}>
                  <PulsingDot
                    status={validator?.status ?? null}
                    size={7}
                  />
                  <Text
                    style={[
                      s.statusBadgeText,
                      { color: statusColor(validator?.status) },
                    ]}
                  >
                    {validator?.status
                      ? validator.status.charAt(0).toUpperCase() + validator.status.slice(1)
                      : "Unknown"}
                  </Text>
                </View>
              </View>
              <View style={s.statsGrid}>
                <View style={s.statBox}>
                  <Text style={s.statLabel}>UPTIME</Text>
                  <Text style={s.statValue}>
                    {validator ? formatUptime(validator.totalActiveMinutes) : "—"}
                  </Text>
                </View>
                <View style={s.statBox}>
                  <Text style={s.statLabel}>COMMISSION</Text>
                  <Text style={s.statValue}>
                    {validator ? `${validator.commissionRate}%` : "—"}
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          <View style={s.totalCard}>
            <View style={s.totalIcon}>
              <Feather name="award" size={20} color={colors.success} />
            </View>
            <View>
              <Text style={s.totalLabel}>TOTAL MC EARNED</Text>
              <Text style={s.totalValue}>{weiToMc(totalEarned.toString())} MC</Text>
            </View>
          </View>

          <Text style={[s.sectionTitle, { marginHorizontal: 20, marginBottom: 8 }]}>
            REWARDS HISTORY
          </Text>
        </>
      }
      data={rewards}
      keyExtractor={(item) => item.id}
      renderItem={({ item: reward }) => (
        <View style={[s.rewardRow, { marginHorizontal: 20, borderRadius: 0 }]}>
          <Text style={s.rewardDate}>{formatDate(reward.timestamp ?? reward.date)}</Text>
          <Text style={s.rewardAmount}>+{weiToMc(reward.amount)} MC</Text>
          <Text style={s.rewardShare}>{reward.poolShare}%</Text>
        </View>
      )}
      ListEmptyComponent={
        <View style={s.emptyState}>
          <Feather name="award" size={32} color={colors.mutedForeground} />
          <Text style={s.emptyText}>No rewards yet</Text>
        </View>
      }
    />
  );
}
