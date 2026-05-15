import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { api } from "@/services/api";
import { formatDate, formatUptime, weiToMc } from "@/services/crypto";
import { PulsingDot } from "@/components/PulsingDot";
import { SessionTimer } from "@/components/SessionTimer";
import { Toast } from "@/components/Toast";
import { useColors } from "@/hooks/useColors";

export default function ValidatorScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const {
    mxcAddress,
    ethAddress,
    publicKey,
    deviceId,
    moniker,
    sessionExpired,
    sessionExpiresAt,
    isStaked,
    setSessionExpired,
    setSessionExpiresAt,
    setIsStaked,
  } = useWallet();

  const [regMoniker, setRegMoniker] = useState(moniker || "");
  const [commissionRate, setCommissionRate] = useState("5");
  const [regError, setRegError] = useState("");
  const [toast, setToast] = useState("");
  const [restartLoading, setRestartLoading] = useState(false);
  const [monikerFocused, setMonikerFocused] = useState(false);
  const [commissionFocused, setCommissionFocused] = useState(false);

  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0.3)).current;
  const expiredShake = useRef(new Animated.Value(0)).current;
  const cardFade = useRef(new Animated.Value(0)).current;

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

  const { data: rewardsData, refetch: refetchRewards } = useQuery({
    queryKey: ["rewards", mxcAddress],
    queryFn: () => api.getRewards(mxcAddress!, 30),
    enabled: !!validatorData?.validator,
    refetchInterval: 60_000,
  });

  const registerMutation = useMutation({
    mutationFn: () => {
      if (!mxcAddress || !ethAddress || !publicKey)
        throw new Error("Wallet not initialized");
      const rate = parseFloat(commissionRate);
      if (isNaN(rate) || rate < 0 || rate > 100)
        throw new Error("Commission rate must be between 0 and 100");
      if (!regMoniker.trim()) throw new Error("Moniker cannot be empty");
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

  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (validator?.status === "active" && !sessionExpired) {
      anim = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseScale, { toValue: 1.4, duration: 1800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
            Animated.timing(pulseScale, { toValue: 1, duration: 1800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          ]),
          Animated.sequence([
            Animated.timing(pulseOpacity, { toValue: 0, duration: 1800, useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0.6, duration: 1800, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(ring2Scale, { toValue: 1.8, duration: 2400, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
            Animated.timing(ring2Scale, { toValue: 1, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(ring2Opacity, { toValue: 0, duration: 2400, useNativeDriver: true }),
            Animated.timing(ring2Opacity, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );
      anim.start();
    } else {
      pulseScale.setValue(1);
      pulseOpacity.setValue(0);
      ring2Scale.setValue(1);
      ring2Opacity.setValue(0);
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
    if (validator) {
      Animated.timing(cardFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    }
  }, [!!validator, cardFade]);

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

  function statusColor(status: string | undefined) {
    if (sessionExpired) return "#F59E0B";
    switch (status) {
      case "active": return colors.success;
      case "pending": return colors.warning;
      case "banned": return colors.destructive;
      default: return colors.mutedForeground;
    }
  }

  function statusLabel(status: string | undefined) {
    if (sessionExpired) return "Paused";
    if (!status) return "Unknown";
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    headerTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground },
    headerSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4 },
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
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primary + "15",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.primary + "30",
    },
    registerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 8 },
    registerDesc: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 22, marginBottom: 24 },
    featureRow: { flexDirection: "row", gap: 8, marginBottom: 24 },
    featureChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.primary + "15",
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.primary + "25",
    },
    featureChipText: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.primary },
    fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.5, marginBottom: 8 },
    input: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      marginBottom: 16,
    },
    inputFocused: { borderColor: colors.primary },
    commissionRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      marginBottom: 20,
    },
    commissionInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.foreground },
    commissionUnit: { paddingRight: 14, fontSize: 15, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    registerBtn: { borderRadius: colors.radius, overflow: "hidden" },
    registerBtnGrad: { paddingVertical: 15, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
    registerBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
    errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.destructive, marginBottom: 12 },
    statusCardWrap: { marginHorizontal: 20, borderRadius: colors.radius + 4, overflow: "hidden", marginBottom: 16 },
    statusGrad: { padding: 20 },
    statusTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
    statusLeft: { flex: 1 },
    statusMoniker: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#FFFFFF", marginBottom: 4 },
    statusAddressText: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.45)" },
    statusBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.35)",
    },
    statusBadgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
    pulseCenter: { alignItems: "center", marginBottom: 20 },
    pulseRing: {
      position: "absolute",
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 2,
    },
    pulseRing2: {
      position: "absolute",
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 1,
    },
    pulseInner: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: "rgba(0,0,0,0.3)",
      alignItems: "center",
      justifyContent: "center",
    },
    statsGrid: { flexDirection: "row", gap: 10 },
    statBox: { flex: 1, backgroundColor: "rgba(0,0,0,0.22)", borderRadius: 10, padding: 11 },
    statLabel: { fontSize: 9, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.5)", letterSpacing: 1, marginBottom: 5 },
    statValue: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
    expiredBanner: {
      marginTop: 16,
      backgroundColor: "rgba(245,158,11,0.12)",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "rgba(245,158,11,0.4)",
      padding: 14,
    },
    expiredBannerTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#F59E0B", marginBottom: 4 },
    expiredBannerDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)", lineHeight: 18, marginBottom: 12 },
    restartBtn: { borderRadius: 10, overflow: "hidden" },
    restartGrad: { paddingVertical: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
    restartBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
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
    totalIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#10B98115", alignItems: "center", justifyContent: "center" },
    totalLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 3, letterSpacing: 0.5 },
    totalValue: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.success },
    sectionTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.5, marginHorizontal: 20, marginBottom: 8 },
    rewardRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 12 },
    rewardIconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#10B98115", alignItems: "center", justifyContent: "center" },
    rewardDate: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground, flex: 1 },
    rewardAmount: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.success },
    rewardShare: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 },
    emptyState: { padding: 40, alignItems: "center", gap: 8 },
    emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
  });

  if (validatorLoading) {
    return (
      <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const showRegisterForm = !isRegistered;
  const activeColor = sessionExpired ? "#F59E0B" : statusColor(validator?.status);

  function centerIcon() {
    if (sessionExpired) return "pause-circle-outline";
    if (validator?.status === "active") return "pulse-outline";
    if (validator?.status === "pending") return "time-outline";
    return "shield-half-outline";
  }

  const RegisterForm = (
    <View style={s.registerCard}>
      <View style={s.registerIcon}>
        <Ionicons name="shield-outline" size={28} color={colors.primary} />
      </View>
      <Text style={s.registerTitle}>Become a Validator</Text>
      <Text style={s.registerDesc}>
        Register your device on the MChain network. Keep it online to earn MC rewards through uptime-based treasury payouts and gas fee sharing.
      </Text>

      <View style={s.featureRow}>
        <View style={s.featureChip}>
          <Ionicons name="time-outline" size={11} color={colors.primary} />
          <Text style={s.featureChipText}>Uptime Rewards</Text>
        </View>
        <View style={s.featureChip}>
          <Ionicons name="flash-outline" size={11} color={colors.primary} />
          <Text style={s.featureChipText}>Gas Fees</Text>
        </View>
        <View style={s.featureChip}>
          <Ionicons name="hardware-chip-outline" size={11} color={colors.primary} />
          <Text style={s.featureChipText}>Chain ID 1888</Text>
        </View>
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
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={40}
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
        activeOpacity={0.85}
      >
        <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.registerBtnGrad}>
          {registerMutation.isPending ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Ionicons name="shield-outline" size={18} color="#FFFFFF" />
              <Text style={s.registerBtnText}>Register as Validator</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const ValidatorStats = validator ? (
    <Animated.View style={{ opacity: cardFade }}>
      <Animated.View style={[s.statusCardWrap, sessionExpired && { transform: [{ translateX: expiredShake }] }]}>
        <LinearGradient
          colors={sessionExpired ? ["#2A1A00", "#1A1000"] : ["#0D2B4E", "#091929"]}
          style={s.statusGrad}
        >
          <View style={s.statusTop}>
            <View style={s.statusLeft}>
              <Text style={s.statusMoniker}>{validator.moniker}</Text>
              <Text style={s.statusAddressText} numberOfLines={1}>
                {mxcAddress?.substring(0, 20)}…
              </Text>
            </View>
            <View style={[s.statusBadge, sessionExpired && { backgroundColor: "rgba(245,158,11,0.15)" }]}>
              <PulsingDot status={sessionExpired ? "pending" : validator.status} size={7} />
              <Text style={[s.statusBadgeText, { color: activeColor }]}>
                {statusLabel(validator.status)}
              </Text>
            </View>
          </View>

          <View style={s.pulseCenter}>
            <Animated.View style={[s.pulseRing2, { borderColor: activeColor, transform: [{ scale: ring2Scale }], opacity: ring2Opacity }]} />
            <Animated.View style={[s.pulseRing, { borderColor: activeColor, transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
            <View style={[s.pulseInner, { borderWidth: 1.5, borderColor: activeColor + "40" }]}>
              <Ionicons name={centerIcon()} size={28} color={activeColor} />
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
                  style={{ fontSize: 13, fontFamily: "Inter_700Bold" }}
                />
              ) : (
                <Text style={s.statValue}>—</Text>
              )}
            </View>
          </View>

          {sessionExpired && (
            <View style={s.expiredBanner}>
              <Text style={s.expiredBannerTitle}>⚠ Session Paused</Text>
              <Text style={s.expiredBannerDesc}>
                Your 2-hour validator session has ended. Restart to resume earning rewards.
              </Text>
              <TouchableOpacity style={s.restartBtn} onPress={handleRestartSession} disabled={restartLoading} activeOpacity={0.85}>
                <LinearGradient colors={["#F59E0B", "#D97706"]} style={s.restartGrad}>
                  {restartLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="refresh-outline" size={14} color="#FFFFFF" />
                      <Text style={s.restartBtnText}>Restart Session</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </LinearGradient>
      </Animated.View>

      <View style={s.totalCard}>
        <View style={s.totalIcon}>
          <Ionicons name="trophy-outline" size={20} color={colors.success} />
        </View>
        <View>
          <Text style={s.totalLabel}>TOTAL MC EARNED</Text>
          <Text style={s.totalValue}>{weiToMc(totalEarned.toString())} MC</Text>
        </View>
      </View>

      <Text style={s.sectionTitle}>RECENT REWARDS</Text>
    </Animated.View>
  ) : null;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        style={s.container}
        contentContainerStyle={{ paddingBottom: 110 }}
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
                <Text style={s.headerSubtitle}>Register to start earning MC rewards</Text>
              )}
            </View>
            {showRegisterForm ? RegisterForm : ValidatorStats}
          </>
        }
        data={isRegistered ? rewards : []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={s.rewardRow}>
            <View style={s.rewardIconWrap}>
              <Ionicons name="trophy-outline" size={16} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rewardDate}>{formatDate(item.createdAt)}</Text>
              <Text style={s.rewardShare}>{item.type}</Text>
            </View>
            <Text style={s.rewardAmount}>+{weiToMc(item.amount)} MC</Text>
          </View>
        )}
        ListEmptyComponent={
          isRegistered ? (
            <View style={s.emptyState}>
              <Ionicons name="trophy-outline" size={32} color={colors.mutedForeground} />
              <Text style={s.emptyText}>No rewards yet</Text>
            </View>
          ) : null
        }
      />
      <Toast message={toast} visible={!!toast} onHide={() => setToast("")} />
    </View>
  );
}
