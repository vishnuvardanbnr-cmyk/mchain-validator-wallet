import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { api } from "@/services/api";
import { formatDate, formatUptime, weiToMc } from "@/services/crypto";
import { PulsingDot } from "@/components/PulsingDot";
import { useColors } from "@/hooks/useColors";

export default function ValidatorScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { mxcAddress, ethAddress, publicKey, deviceId, moniker } = useWallet();

  const [regMoniker, setRegMoniker] = useState(moniker || "");
  const [commissionRate, setCommissionRate] = useState("5");
  const [regError, setRegError] = useState("");

  const {
    data: validatorData,
    isLoading: validatorLoading,
    isError: validatorError,
    refetch: refetchValidator,
  } = useQuery({
    queryKey: ["validatorDetail", mxcAddress],
    queryFn: () => api.getValidatorStatus(mxcAddress!),
    enabled: !!mxcAddress,
    refetchInterval: 30_000,
    retry: 1,
  });

  const { data: rewardsData, refetch: refetchRewards } = useQuery({
    queryKey: ["rewards", mxcAddress],
    queryFn: () => api.getRewards(mxcAddress!, 30),
    enabled: !!validatorData?.validator,
    refetchInterval: 60_000,
  });

  const registerMutation = useMutation({
    mutationFn: () => {
      if (!mxcAddress || !ethAddress || !publicKey) {
        throw new Error("Wallet not initialized");
      }
      const rate = parseFloat(commissionRate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        throw new Error("Commission rate must be between 0 and 100");
      }
      if (!regMoniker.trim()) {
        throw new Error("Moniker cannot be empty");
      }
      return api.registerValidator({
        address: mxcAddress,
        ethAddress,
        publicKey,
        deviceId,
        moniker: regMoniker.trim(),
        commissionRate: rate.toFixed(2),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["validatorDetail", mxcAddress] });
      setRegError("");
    },
    onError: (err: Error) => {
      setRegError(err.message || "Registration failed. Please try again.");
      Alert.alert("Registration Failed", err.message || "Please try again.");
    },
  });

  const validator = validatorData?.validator;
  const isRegistered = !!validator;
  const rewards = rewardsData?.rewards ?? [];
  const totalEarned = rewards.reduce((acc, r) => {
    try { return acc + BigInt(r.amount); } catch { return acc; }
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
    container: { flex: 1, backgroundColor: colors.background },
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
    headerSubtitle: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 4,
    },
    registerCard: {
      marginHorizontal: 20,
      backgroundColor: colors.card,
      borderRadius: colors.radius + 4,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      marginBottom: 16,
    },
    registerIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary + "20",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    registerTitle: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 8,
    },
    registerDesc: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 20,
      marginBottom: 20,
    },
    label: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      letterSpacing: 1.5,
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      marginBottom: 16,
    },
    inputFocused: {
      borderColor: colors.primary,
    },
    commissionRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      marginBottom: 20,
    },
    commissionInput: {
      flex: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    commissionUnit: {
      paddingRight: 14,
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    registerBtn: {
      borderRadius: colors.radius,
      overflow: "hidden",
    },
    registerBtnGrad: {
      paddingVertical: 14,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    registerBtnText: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: "#FFFFFF",
    },
    errorText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.destructive,
      marginBottom: 12,
    },
    statusCard: {
      marginHorizontal: 20,
      borderRadius: colors.radius + 4,
      overflow: "hidden",
      marginBottom: 16,
    },
    statusGrad: { padding: 20 },
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
    statsGrid: { flexDirection: "row", gap: 12 },
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
    sectionTitle: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      letterSpacing: 1.5,
      marginHorizontal: 20,
      marginBottom: 8,
    },
    rewardRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
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
    emptyState: { padding: 32, alignItems: "center" },
    emptyText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 8,
    },
  });

  if (validatorLoading) {
    return (
      <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const showRegisterForm = !isRegistered;

  const RegisterForm = (
    <View style={s.registerCard}>
      <View style={s.registerIcon}>
        <Feather name="shield" size={26} color={colors.primary} />
      </View>
      <Text style={s.registerTitle}>Become a Validator</Text>
      <Text style={s.registerDesc}>
        Register your node on the MChain network to earn MC rewards by keeping
        your device online and sending regular heartbeats.
      </Text>

      <Text style={s.label}>NODE MONIKER</Text>
      <TextInput
        style={s.input}
        value={regMoniker}
        onChangeText={setRegMoniker}
        placeholder="e.g. my-mchain-node"
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={40}
        editable={!registerMutation.isPending}
      />

      <Text style={s.label}>COMMISSION RATE</Text>
      <View style={s.commissionRow}>
        <TextInput
          style={s.commissionInput}
          value={commissionRate}
          onChangeText={setCommissionRate}
          placeholder="5"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="decimal-pad"
          maxLength={5}
          editable={!registerMutation.isPending}
        />
        <Text style={s.commissionUnit}>%</Text>
      </View>

      {regError ? <Text style={s.errorText}>{regError}</Text> : null}

      <TouchableOpacity
        style={s.registerBtn}
        onPress={() => registerMutation.mutate()}
        disabled={registerMutation.isPending}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={["#0EA5E9", "#0284C7"]}
          style={s.registerBtnGrad}
        >
          {registerMutation.isPending ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Feather name="shield" size={18} color="#FFFFFF" />
              <Text style={s.registerBtnText}>Register as Validator</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const ValidatorStats = validator ? (
    <>
      <View style={s.statusCard}>
        <LinearGradient colors={["#0D2B4E", "#091929"]} style={s.statusGrad}>
          <View style={s.statusTop}>
            <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFFFFF" }}>
              {validator.moniker}
            </Text>
            <View style={s.statusBadge}>
              <PulsingDot status={validator.status} size={7} />
              <Text style={[s.statusBadgeText, { color: statusColor(validator.status) }]}>
                {validator.status ? validator.status.charAt(0).toUpperCase() + validator.status.slice(1) : "Unknown"}
              </Text>
            </View>
          </View>
          <View style={s.statsGrid}>
            <View style={s.statBox}>
              <Text style={s.statLabel}>UPTIME</Text>
              <Text style={s.statValue}>{formatUptime(validator.totalActiveMinutes)}</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statLabel}>COMMISSION</Text>
              <Text style={s.statValue}>{validator.commissionRate}%</Text>
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

      <Text style={s.sectionTitle}>REWARDS HISTORY</Text>
    </>
  ) : null;

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
            {showRegisterForm && (
              <Text style={s.headerSubtitle}>
                Your address is not yet registered on MChain
              </Text>
            )}
          </View>
          {showRegisterForm ? RegisterForm : ValidatorStats}
        </>
      }
      data={showRegisterForm ? [] : rewards}
      keyExtractor={(item) => item.id}
      renderItem={({ item: reward }) => (
        <View style={s.rewardRow}>
          <Text style={s.rewardDate}>{formatDate(reward.timestamp ?? reward.date)}</Text>
          <Text style={s.rewardAmount}>+{weiToMc(reward.amount)} MC</Text>
          <Text style={s.rewardShare}>{reward.poolShare}%</Text>
        </View>
      )}
      ListEmptyComponent={
        !showRegisterForm ? (
          <View style={s.emptyState}>
            <Feather name="award" size={32} color={colors.mutedForeground} />
            <Text style={s.emptyText}>No rewards yet</Text>
          </View>
        ) : null
      }
    />
  );
}
