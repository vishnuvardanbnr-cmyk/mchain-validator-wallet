import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useWallet } from "@/context/WalletContext";
import {
  CardAccount,
  CardDeposit,
  getCardAccount,
  getCardDeposits,
  initCardAccount,
  verifyCardDeposit,
  toggleCardFreeze,
} from "@/services/api";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";

// ── Chip component ────────────────────────────────────────────────────────────
function CardChip({ color = "#FFD700" }: { color?: string }) {
  return (
    <View style={{ width: 34, height: 26, borderRadius: 5, backgroundColor: color, opacity: 0.9,
      borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" }}>
      <View style={{ position: "absolute", top: 8, left: 4, right: 4, height: 1,
        backgroundColor: "rgba(255,255,255,0.35)" }} />
      <View style={{ position: "absolute", top: 4, left: 12, bottom: 4, width: 1,
        backgroundColor: "rgba(255,255,255,0.25)" }} />
    </View>
  );
}

// ── Contactless icon ──────────────────────────────────────────────────────────
function ContactlessIcon({ color = "rgba(255,255,255,0.7)" }: { color?: string }) {
  return (
    <View style={{ width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
      {[8, 13, 18].map((size, i) => (
        <View key={i} style={{
          position: "absolute",
          width: size, height: size,
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor: color,
          borderLeftColor: "transparent",
          borderBottomColor: "transparent",
          transform: [{ rotate: "45deg" }],
          opacity: 0.55 + i * 0.2,
        }} />
      ))}
    </View>
  );
}

// ── Network badge ─────────────────────────────────────────────────────────────
function NetworkBadge() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: "#F0B90B18", borderWidth: 1, borderColor: "#F0B90B30",
      borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, alignSelf: "flex-start" }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#F0B90B" }} />
      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#F0B90B", letterSpacing: 0.3 }}>
        BNB Smart Chain · BEP20
      </Text>
    </View>
  );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function Skeleton({ width, height, borderRadius = 8, style }: {
  width: number | string; height: number; borderRadius?: number; style?: object;
}) {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);
  return (
    <Animated.View style={[{ width, height, borderRadius, backgroundColor: "#ffffff18", opacity: anim }, style]} />
  );
}

// ── Deposit row in history ─────────────────────────────────────────────────────
function DepositRow({ deposit, colors }: { deposit: CardDeposit; colors: ReturnType<typeof useColors> }) {
  const amount = parseFloat(deposit.amount_usdt);
  const date = new Date(deposit.created_at);
  const shortHash = deposit.tx_hash.slice(0, 8) + "…" + deposit.tx_hash.slice(-6);
  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12,
      paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ width: 40, height: 40, borderRadius: 20,
        backgroundColor: "#22C55E18", alignItems: "center", justifyContent: "center" }}>
        <Icon name="arrow-down-outline" size={18} color="#22C55E" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
          USDT Deposit
        </Text>
        <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular",
          color: colors.mutedForeground, marginTop: 2 }}>
          {shortHash} · {deposit.network.toUpperCase()}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#22C55E" }}>
          +{amount.toFixed(2)} USDT
        </Text>
        <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
          {dateStr} · {timeStr}
        </Text>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function CardsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { ethAddress } = useWallet();

  const [account, setAccount] = useState<CardAccount | null>(null);
  const [deposits, setDeposits] = useState<CardDeposit[]>([]);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [activating, setActivating] = useState(false);
  const [activeTab, setActiveTab] = useState<"deposit" | "history">("deposit");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const verifyAnim = useRef(new Animated.Value(0)).current;
  const msgAnim = useRef(new Animated.Value(0)).current;

  // ── Load account ─────────────────────────────────────────────────────────
  const loadAccount = useCallback(async (silent = false) => {
    if (!ethAddress) return;
    if (!silent) setLoadingAccount(true);
    try {
      const [accRes, depRes] = await Promise.all([
        getCardAccount(ethAddress),
        getCardDeposits(ethAddress),
      ]);
      setAccount(accRes.account);
      setDeposits(depRes.deposits);
    } catch {
      // silent
    } finally {
      setLoadingAccount(false);
      setRefreshing(false);
    }
  }, [ethAddress]);

  useEffect(() => { loadAccount(); }, [loadAccount]);

  // ── Show feedback message ─────────────────────────────────────────────────
  const showMsg = (type: "success" | "error" | "info", text: string) => {
    setVerifyMsg({ type, text });
    msgAnim.setValue(0);
    Animated.timing(msgAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    setTimeout(() => {
      Animated.timing(msgAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() =>
        setVerifyMsg(null)
      );
    }, 4000);
  };

  // ── Activate card ─────────────────────────────────────────────────────────
  const handleActivate = async () => {
    if (!ethAddress || activating) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActivating(true);
    try {
      const res = await initCardAccount(ethAddress);
      setAccount(res.account);
    } catch {
      showMsg("error", "Failed to activate card. Please try again.");
    } finally {
      setActivating(false);
    }
  };

  // ── Copy address ──────────────────────────────────────────────────────────
  const handleCopy = async () => {
    if (!account?.deposit_address) return;
    await Clipboard.setStringAsync(account.deposit_address);
    setCopied(true);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopied(false), 2500);
  };

  // ── Verify deposit ────────────────────────────────────────────────────────
  const handleVerify = async () => {
    if (!ethAddress || isVerifying) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsVerifying(true);
    setVerifyMsg(null);
    Animated.loop(
      Animated.timing(verifyAnim, { toValue: 1, duration: 1200, useNativeDriver: true })
    ).start();
    try {
      const result = await verifyCardDeposit(ethAddress);
      verifyAnim.stopAnimation();
      verifyAnim.setValue(0);
      if (result.credited > 0) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showMsg("success", `+${result.credited.toFixed(2)} USDT added to your card!`);
        await loadAccount(true);
      } else {
        showMsg("info", result.message);
      }
    } catch {
      verifyAnim.stopAnimation();
      verifyAnim.setValue(0);
      showMsg("error", "Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  // ── Freeze toggle ─────────────────────────────────────────────────────────
  const handleFreeze = async () => {
    if (!ethAddress || isToggling || !account) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsToggling(true);
    try {
      const res = await toggleCardFreeze(ethAddress);
      setAccount((prev) => prev ? { ...prev, frozen: res.frozen } : prev);
      showMsg("info", res.frozen ? "Card frozen — all transactions blocked." : "Card unfrozen — ready to use.");
    } catch {
      showMsg("error", "Failed to update card status.");
    } finally {
      setIsToggling(false);
    }
  };

  const balance = parseFloat(account?.balance_usdt ?? "0");
  const balanceUsd = (balance * 1).toFixed(2); // 1:1 USDT:USD

  const msgBgColor = verifyMsg?.type === "success"
    ? "#22C55E20"
    : verifyMsg?.type === "error"
    ? "#EF444420"
    : "#0EA5E920";
  const msgTextColor = verifyMsg?.type === "success"
    ? "#22C55E"
    : verifyMsg?.type === "error"
    ? "#EF4444"
    : "#0EA5E9";

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 12),
      paddingHorizontal: 20,
      paddingBottom: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      alignItems: "center", justifyContent: "center",
    },
    headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground, flex: 1 },

    scroll: { paddingHorizontal: 20, paddingBottom: 120 },

    // Card visual
    cardVisual: {
      borderRadius: 22, overflow: "hidden",
      aspectRatio: 1.586,
      shadowColor: "#000",
      shadowOpacity: 0.4, shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 16, marginBottom: 20,
    },
    cardGrad: { flex: 1, padding: 24 },

    // Balance section
    balanceCard: {
      backgroundColor: colors.card,
      borderRadius: 18, borderWidth: 1, borderColor: colors.border,
      padding: 20, marginBottom: 16,
    },
    balanceLabel: {
      fontSize: 11, fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground, letterSpacing: 1.5, marginBottom: 6,
    },
    balanceAmount: {
      fontSize: 36, fontFamily: "Inter_700Bold",
      color: colors.foreground, letterSpacing: -0.5,
    },
    balanceSuffix: {
      fontSize: 16, fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    balanceUsd: {
      fontSize: 14, fontFamily: "Inter_400Regular",
      color: colors.mutedForeground, marginTop: 4,
    },

    // Action buttons row
    actionsRow: {
      flexDirection: "row", gap: 10, marginBottom: 20,
    },
    actionBtn: {
      flex: 1, borderRadius: 14, borderWidth: 1,
      borderColor: colors.border, backgroundColor: colors.card,
      paddingVertical: 14, alignItems: "center", gap: 6,
    },
    actionBtnText: {
      fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground,
    },

    // Tabs
    tabRow: {
      flexDirection: "row", backgroundColor: colors.card,
      borderRadius: 14, borderWidth: 1, borderColor: colors.border,
      padding: 4, marginBottom: 20,
    },
    tab: {
      flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 11,
    },
    tabActive: { backgroundColor: colors.primary },
    tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    tabTextActive: { color: "#FFF" },

    // Deposit panel
    depositPanel: {
      backgroundColor: colors.card,
      borderRadius: 18, borderWidth: 1, borderColor: colors.border,
      padding: 20, gap: 20,
    },
    qrWrapper: {
      alignItems: "center", padding: 20,
      backgroundColor: "#FFFFFF",
      borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    },
    addressBox: {
      backgroundColor: colors.background,
      borderRadius: 12, borderWidth: 1, borderColor: colors.border,
      padding: 14, flexDirection: "row", alignItems: "center", gap: 10,
    },
    addressText: {
      flex: 1, fontSize: 12, fontFamily: "Inter_500Medium",
      color: colors.mutedForeground, letterSpacing: 0.3,
    },
    copyBtn: {
      paddingHorizontal: 14, paddingVertical: 8,
      backgroundColor: colors.primary + "20",
      borderRadius: 10, borderWidth: 1, borderColor: colors.primary + "40",
    },
    copyBtnText: {
      fontSize: 12, fontFamily: "Inter_700Bold", color: colors.primary,
    },
    verifyBtn: {
      borderRadius: 14, overflow: "hidden",
    },
    verifyGrad: {
      paddingVertical: 16, alignItems: "center",
      flexDirection: "row", justifyContent: "center", gap: 8,
    },
    verifyText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFF" },

    warningBox: {
      flexDirection: "row", gap: 8, alignItems: "flex-start",
      backgroundColor: "#F59E0B12",
      borderRadius: 12, borderWidth: 1, borderColor: "#F59E0B30",
      padding: 12,
    },
    warningText: {
      flex: 1, fontSize: 12, fontFamily: "Inter_400Regular",
      color: "#F59E0B", lineHeight: 18,
    },

    // Feedback banner
    msgBanner: {
      borderRadius: 12, borderWidth: 1,
      padding: 12, flexDirection: "row", gap: 8, alignItems: "center",
      marginBottom: 16,
    },
    msgText: {
      flex: 1, fontSize: 13, fontFamily: "Inter_500Medium",
    },

    // History
    historyEmpty: {
      alignItems: "center", paddingVertical: 40, gap: 10,
    },
    historyEmptyText: {
      fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground,
      textAlign: "center",
    },

    // Activate screen
    activateContainer: {
      flex: 1, alignItems: "center", justifyContent: "center",
      paddingHorizontal: 40, gap: 20, paddingBottom: 80,
    },
    activateIcon: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: colors.primary + "15",
      borderWidth: 1, borderColor: colors.primary + "30",
      alignItems: "center", justifyContent: "center",
    },
    activateTitle: {
      fontSize: 24, fontFamily: "Inter_700Bold",
      color: colors.foreground, textAlign: "center",
    },
    activateDesc: {
      fontSize: 14, fontFamily: "Inter_400Regular",
      color: colors.mutedForeground, textAlign: "center", lineHeight: 22,
    },
    activateBtn: {
      width: "100%", borderRadius: 16, overflow: "hidden",
      shadowColor: colors.primary, shadowOpacity: 0.35,
      shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    activateBtnGrad: {
      paddingVertical: 18, alignItems: "center",
      flexDirection: "row", justifyContent: "center", gap: 8,
    },
    activateBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFF" },

    // Coming soon card
    comingSoonCard: {
      borderRadius: 18, overflow: "hidden",
      marginTop: 28,
      shadowColor: "#000",
      shadowOpacity: 0.2, shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
  });

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loadingAccount) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Icon name="arrow-back" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Virtual Cards</Text>
        </View>
        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          <Skeleton width="100%" height={200} borderRadius={22} />
          <Skeleton width="100%" height={100} borderRadius={18} />
          <Skeleton width="100%" height={52} borderRadius={14} />
          <Skeleton width="100%" height={280} borderRadius={18} />
        </View>
      </View>
    );
  }

  // ── No account — activate screen ───────────────────────────────────────────
  if (!account) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Icon name="arrow-back" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Virtual Cards</Text>
        </View>

        <View style={s.activateContainer}>
          <View style={s.activateIcon}>
            <Icon name="card-outline" size={34} color={colors.primary} />
          </View>

          <Text style={s.activateTitle}>Your MChain Card</Text>
          <Text style={s.activateDesc}>
            Deposit USDT and spend anywhere Mastercard is accepted — online, in stores, and via Apple Pay & Google Pay.
          </Text>

          {[
            { icon: "swap-horizontal-outline", text: "USDT automatically converted at checkout" },
            { icon: "flash-outline", text: "Instant deposits — verify with one tap" },
            { icon: "lock-closed-outline", text: "Freeze & unfreeze anytime" },
          ].map((f, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "center", alignSelf: "stretch" }}>
              <View style={{ width: 32, height: 32, borderRadius: 10,
                backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
                <Icon name={f.icon} size={16} color={colors.primary} />
              </View>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular",
                color: colors.foreground, flex: 1 }}>{f.text}</Text>
            </View>
          ))}

          {verifyMsg && (
            <Animated.View style={[s.msgBanner, {
              backgroundColor: msgBgColor, borderColor: msgTextColor + "40",
              opacity: msgAnim, width: "100%",
            }]}>
              <Icon
                name={verifyMsg.type === "success" ? "checkmark-circle-outline"
                  : verifyMsg.type === "error" ? "alert-circle-outline" : "information-circle-outline"}
                size={18} color={msgTextColor}
              />
              <Text style={[s.msgText, { color: msgTextColor }]}>{verifyMsg.text}</Text>
            </Animated.View>
          )}

          <TouchableOpacity
            style={[s.activateBtn, { opacity: activating ? 0.7 : 1 }]}
            activeOpacity={0.85}
            onPress={handleActivate}
            disabled={activating || !ethAddress}
          >
            <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.activateBtnGrad}>
              {activating ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Icon name="card-outline" size={20} color="#FFF" />
                  <Text style={s.activateBtnText}>Activate My Card</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {!ethAddress && (
            <Text style={{ fontSize: 12, color: colors.mutedForeground, textAlign: "center" }}>
              Connect a wallet first to activate your card.
            </Text>
          )}
        </View>
      </View>
    );
  }

  // ── Card active — main screen ──────────────────────────────────────────────
  const depositAddr = account.deposit_address;
  const shortAddr = depositAddr
    ? depositAddr.slice(0, 10) + "····" + depositAddr.slice(-8)
    : "";

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Icon name="arrow-back" size={18} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Virtual Cards</Text>
        <View style={{
          paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
          backgroundColor: account.frozen ? "#EF444418" : "#22C55E18",
          borderWidth: 1, borderColor: account.frozen ? "#EF444440" : "#22C55E40",
        }}>
          <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold",
            color: account.frozen ? "#EF4444" : "#22C55E", letterSpacing: 1 }}>
            {account.frozen ? "FROZEN" : "ACTIVE"}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadAccount(); }}
            tintColor={colors.primary}
          />
        }
      >
        {/* ── Card Visual ── */}
        <View style={[s.cardVisual, account.frozen && { opacity: 0.7 }]}>
          <LinearGradient
            colors={account.frozen
              ? ["#1a1a2e", "#16213e", "#0f3460"]
              : ["#0A1628", "#0EA5E9", "#0369A1"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.cardGrad}
          >
            {/* Top row */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View>
                <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold",
                  color: "#FFF", letterSpacing: 1.5 }}>MChain</Text>
                <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular",
                  color: "rgba(255,255,255,0.5)", letterSpacing: 2, marginTop: 2 }}>VIRTUAL CARD</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <ContactlessIcon color={account.frozen ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)"} />
                <CardChip color={account.frozen ? "#6B7280" : "#FFD700"} />
              </View>
            </View>

            {/* Balance — centre */}
            <View style={{ flex: 1, justifyContent: "center" }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium",
                color: "rgba(255,255,255,0.5)", letterSpacing: 1.5, marginBottom: 4 }}>
                CARD BALANCE
              </Text>
              <Text style={{ fontSize: 30, fontFamily: "Inter_700Bold", color: "#FFF", letterSpacing: -0.5 }}>
                {balance.toFixed(2)}
                <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.6)" }}> USDT</Text>
              </Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular",
                color: "rgba(255,255,255,0.45)", marginTop: 3 }}>≈ ${balanceUsd} USD</Text>
            </View>

            {/* Bottom row */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
              <View>
                <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium",
                  color: "rgba(255,255,255,0.4)", letterSpacing: 1 }}>CARD NUMBER</Text>
                <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold",
                  color: "rgba(255,255,255,0.8)", letterSpacing: 2.5, marginTop: 3 }}>
                  •••• •••• •••• ••••
                </Text>
                <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular",
                  color: "rgba(255,255,255,0.35)", marginTop: 4 }}>VALID THRU  ••/••</Text>
              </View>
              <View style={{ alignItems: "center", gap: 3 }}>
                <View style={{ flexDirection: "row" }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12,
                    backgroundColor: "#EB001B", opacity: 0.9 }} />
                  <View style={{ width: 24, height: 24, borderRadius: 12,
                    backgroundColor: "#F79E1B", opacity: 0.9, marginLeft: -9 }} />
                </View>
                <Text style={{ fontSize: 7, fontFamily: "Inter_700Bold",
                  color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>MASTERCARD</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* ── Balance card ── */}
        <View style={s.balanceCard}>
          <Text style={s.balanceLabel}>AVAILABLE BALANCE</Text>
          <Text style={s.balanceAmount}>
            {balance.toFixed(6).replace(/\.?0+$/, "") || "0"}
            <Text style={s.balanceSuffix}> USDT</Text>
          </Text>
          <Text style={s.balanceUsd}>≈ ${balanceUsd} USD · Rate 1:1</Text>
        </View>

        {/* ── Action buttons ── */}
        <View style={s.actionsRow}>
          <TouchableOpacity
            style={s.actionBtn}
            activeOpacity={0.7}
            onPress={() => { setActiveTab("deposit"); }}
          >
            <Icon name="arrow-down-circle-outline" size={22} color={colors.primary} />
            <Text style={s.actionBtnText}>Deposit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, account.frozen && { borderColor: "#EF444440", backgroundColor: "#EF444408" }]}
            activeOpacity={0.7}
            onPress={handleFreeze}
            disabled={isToggling}
          >
            {isToggling
              ? <ActivityIndicator size="small" color={account.frozen ? "#EF4444" : colors.foreground} />
              : <Icon name={account.frozen ? "lock-open-outline" : "lock-closed-outline"}
                  size={22} color={account.frozen ? "#EF4444" : colors.foreground} />
            }
            <Text style={[s.actionBtnText, account.frozen && { color: "#EF4444" }]}>
              {account.frozen ? "Unfreeze" : "Freeze"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.actionBtn}
            activeOpacity={0.7}
            onPress={() => setActiveTab("history")}
          >
            <Icon name="time-outline" size={22} color={colors.foreground} />
            <Text style={s.actionBtnText}>History</Text>
          </TouchableOpacity>
        </View>

        {/* ── Feedback banner ── */}
        {verifyMsg && (
          <Animated.View style={[s.msgBanner, {
            backgroundColor: msgBgColor,
            borderColor: msgTextColor + "40",
            opacity: msgAnim,
          }]}>
            <Icon
              name={verifyMsg.type === "success" ? "checkmark-circle-outline"
                : verifyMsg.type === "error" ? "alert-circle-outline" : "information-circle-outline"}
              size={18} color={msgTextColor}
            />
            <Text style={[s.msgText, { color: msgTextColor }]}>{verifyMsg.text}</Text>
          </Animated.View>
        )}

        {/* ── Tabs ── */}
        <View style={s.tabRow}>
          {(["deposit", "history"] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[s.tab, activeTab === tab && s.tabActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.8}
            >
              <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
                {tab === "deposit" ? "Deposit USDT" : `History${deposits.length > 0 ? ` (${deposits.length})` : ""}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Deposit tab ── */}
        {activeTab === "deposit" && (
          <View style={s.depositPanel}>

            {/* Network badge */}
            <View>
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold",
                color: colors.mutedForeground, letterSpacing: 0.5, marginBottom: 10 }}>
                SEND USDT TO THIS ADDRESS
              </Text>
              <NetworkBadge />
            </View>

            {/* QR code */}
            <View style={s.qrWrapper}>
              <QRCode
                value={depositAddr || "mchain"}
                size={160}
                color="#000000"
                backgroundColor="#FFFFFF"
              />
              <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium",
                color: "#666", marginTop: 12, letterSpacing: 0.5 }}>
                Scan to deposit USDT (BEP20)
              </Text>
            </View>

            {/* Address */}
            <View>
              <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold",
                color: colors.mutedForeground, letterSpacing: 1.2, marginBottom: 8 }}>
                YOUR DEPOSIT ADDRESS
              </Text>
              <View style={s.addressBox}>
                <Text style={s.addressText} numberOfLines={1} ellipsizeMode="middle">
                  {depositAddr}
                </Text>
                <TouchableOpacity style={s.copyBtn} onPress={handleCopy} activeOpacity={0.7}>
                  <Text style={s.copyBtnText}>{copied ? "Copied!" : "Copy"}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Warning */}
            <View style={s.warningBox}>
              <Icon name="warning-outline" size={16} color="#F59E0B" />
              <Text style={s.warningText}>
                Only send <Text style={{ fontFamily: "Inter_700Bold" }}>USDT (BEP20)</Text> on the{" "}
                <Text style={{ fontFamily: "Inter_700Bold" }}>BNB Smart Chain</Text>. Sending other tokens or networks will result in permanent loss.
              </Text>
            </View>

            {/* Verify button */}
            <TouchableOpacity
              style={[s.verifyBtn, isVerifying && { opacity: 0.75 }]}
              activeOpacity={0.85}
              onPress={handleVerify}
              disabled={isVerifying}
            >
              <LinearGradient
                colors={["#0EA5E9", "#0284C7"]}
                style={s.verifyGrad}
              >
                {isVerifying
                  ? <ActivityIndicator color="#FFF" size="small" />
                  : <Icon name="checkmark-circle-outline" size={20} color="#FFF" />
                }
                <Text style={s.verifyText}>
                  {isVerifying ? "Checking blockchain…" : "Verify Deposit"}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular",
              color: colors.mutedForeground, textAlign: "center", lineHeight: 17 }}>
              After sending USDT, tap Verify Deposit to confirm on-chain and credit your card balance.
            </Text>
          </View>
        )}

        {/* ── History tab ── */}
        {activeTab === "history" && (
          <View style={{ backgroundColor: colors.card, borderRadius: 18,
            borderWidth: 1, borderColor: colors.border, padding: 20 }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold",
              color: colors.mutedForeground, letterSpacing: 1.2, marginBottom: 4 }}>
              DEPOSIT HISTORY
            </Text>
            {deposits.length === 0 ? (
              <View style={s.historyEmpty}>
                <View style={{ width: 56, height: 56, borderRadius: 28,
                  backgroundColor: colors.border, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="receipt-outline" size={24} color={colors.mutedForeground} />
                </View>
                <Text style={s.historyEmptyText}>
                  No deposits yet.{"\n"}Send USDT to your deposit address to get started.
                </Text>
              </View>
            ) : (
              deposits.map((dep) => (
                <DepositRow key={dep.id} deposit={dep} colors={colors} />
              ))
            )}
          </View>
        )}

        {/* ── Coming soon card ── */}
        <View style={{ marginTop: 28 }}>
          <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold",
            color: colors.mutedForeground, letterSpacing: 1.5, marginBottom: 16 }}>
            COMING SOON
          </Text>
          <View style={[s.comingSoonCard, { opacity: 0.6 }]}>
            <LinearGradient
              colors={["#1a1a2e", "#16213e", "#0f3460"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[s.cardGrad, { aspectRatio: 1.586 }]}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold",
                    color: "#FFF", letterSpacing: 1.5 }}>MChain</Text>
                  <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular",
                    color: "rgba(255,255,255,0.5)", letterSpacing: 2, marginTop: 2 }}>WEB3 CARD</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <ContactlessIcon color="rgba(255,255,255,0.3)" />
                  <CardChip color="#6B7280" />
                </View>
              </View>
              <View style={{ flex: 1, justifyContent: "center" }}>
                <View style={{ alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4,
                  backgroundColor: "#ffffff15", borderRadius: 20, borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.15)" }}>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold",
                    color: "rgba(255,255,255,0.6)", letterSpacing: 1.5 }}>COMING SOON</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                <View>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium",
                    color: "rgba(255,255,255,0.3)", letterSpacing: 1 }}>DIRECT USDT CARD</Text>
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold",
                    color: "rgba(255,255,255,0.5)", letterSpacing: 2.5, marginTop: 3 }}>
                    •••• •••• •••• ••••
                  </Text>
                </View>
                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold",
                  color: "rgba(255,255,255,0.35)", letterSpacing: 1 }}>USDT</Text>
              </View>
            </LinearGradient>
          </View>

          <View style={{ backgroundColor: colors.card, borderRadius: 16,
            borderWidth: 1, borderColor: colors.border, padding: 18, marginTop: 12, opacity: 0.7 }}>
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold",
              color: colors.foreground, marginBottom: 6 }}>Direct Spending USDT Card</Text>
            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular",
              color: colors.mutedForeground, lineHeight: 20, marginBottom: 14 }}>
              Spend USDT directly — no fiat conversion. Pay at merchants natively with stablecoins.
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="time-outline" size={14} color={colors.mutedForeground} />
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                We'll notify you when this is ready
              </Text>
            </View>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}
