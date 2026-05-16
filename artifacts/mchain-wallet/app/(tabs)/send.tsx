import { Icon } from "@/components/Icon";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { api } from "@/services/api";
import { mcToWei, shortenAddress, signTransaction, weiToMc } from "@/services/crypto";
import { QRScannerModal } from "@/components/QRScannerModal";
import { Toast } from "@/components/Toast";
import { useColors } from "@/hooks/useColors";

type SendStep = "input" | "confirm" | "success";
const RECENT_KEY = "mchain_recent_recipients";

export default function SendScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { mxcAddress, getPrivateKey } = useWallet();

  const [step, setStep] = useState<SendStep>("input");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [txHash, setTxHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [recentAddresses, setRecentAddresses] = useState<string[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [recipientFocused, setRecipientFocused] = useState(false);
  const [amountFocused, setAmountFocused] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const checkRotate = useRef(new Animated.Value(0)).current;
  const hashOpacity = useRef(new Animated.Value(0)).current;

  const { data: account, refetch: refetchAccount } = useQuery({
    queryKey: ["account", mxcAddress],
    queryFn: () => api.getAccount(mxcAddress!),
    enabled: !!mxcAddress,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY).then((raw) => {
      if (raw) setRecentAddresses(JSON.parse(raw));
    });
  }, []);

  const saveRecent = useCallback(async (address: string) => {
    const updated = [address, ...recentAddresses.filter((a) => a !== address)].slice(0, 5);
    setRecentAddresses(updated);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  }, [recentAddresses]);

  function slideToStep(nextStep: SendStep) {
    Animated.timing(slideAnim, {
      toValue: -30,
      duration: 150,
      useNativeDriver: true,
      easing: Easing.in(Easing.ease),
    }).start(() => {
      setStep(nextStep);
      slideAnim.setValue(30);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }).start();
    });
  }

  useEffect(() => {
    if (step === "success") {
      Animated.parallel([
        Animated.spring(successScale, {
          toValue: 1,
          useNativeDriver: true,
          bounciness: 14,
          speed: 8,
        }),
        Animated.timing(successOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(checkRotate, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.out(Easing.back(1.5)) }),
        ]),
      ]).start(() => {
        Animated.timing(hashOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      });
    }
  }, [step, successScale, successOpacity, checkRotate, hashOpacity]);

  const balance = weiToMc(account?.balance ?? "0");
  const balanceNum = parseFloat(balance.replace(/,/g, ""));

  function validateInput(): string | null {
    if (!recipient.trim()) return "Enter a recipient address";
    if (!recipient.startsWith("mxc1")) return "Address must start with mxc1";
    if (recipient.trim() === mxcAddress) return "Cannot send to your own address";
    if (recipient.length < 20) return "Invalid address length";
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return "Enter a valid amount";
    if (amt > balanceNum) return "Insufficient balance";
    return null;
  }

  function handleContinue() {
    setShowRecent(false);
    const err = validateInput();
    if (err) {
      setError(err);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setError("");
    slideToStep("confirm");
  }

  async function handleSend() {
    if (!mxcAddress) return;
    setLoading(true);
    try {
      const privateKey = await getPrivateKey();
      if (!privateKey) throw new Error("Private key not found");
      const nonce = account?.nonce ?? 0;
      const weiAmount = mcToWei(amount);
      const signature = signTransaction(mxcAddress, recipient, weiAmount, nonce, privateKey);
      const result = await api.sendTransaction({ from: mxcAddress, to: recipient, amount: weiAmount, nonce, signature });
      setTxHash(result.txHash);
      await saveRecent(recipient);
      qc.invalidateQueries({ queryKey: ["account", mxcAddress] });
      slideToStep("success");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      const e = err as Error;
      setToast(e.message || "Transaction failed");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  async function handlePasteAddress() {
    const text = await Clipboard.getStringAsync();
    if (text?.startsWith("mxc1")) {
      setRecipient(text.trim());
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      setToast("Clipboard doesn't contain a valid mxc1 address");
    }
  }

  function setAmountPct(pct: number) {
    const val = (balanceNum * pct).toFixed(6).replace(/\.?0+$/, "");
    setAmount(val);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function reset() {
    setStep("input");
    setRecipient("");
    setAmount("");
    setMemo("");
    setTxHash("");
    setError("");
    successScale.setValue(0);
    successOpacity.setValue(0);
    checkRotate.setValue(0);
    hashOpacity.setValue(0);
  }

  const spin = checkRotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { paddingBottom: 120 },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20,
      paddingBottom: 20,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
    balanceCard: {
      marginHorizontal: 20,
      marginBottom: 20,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    balanceLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, letterSpacing: 0.5, marginBottom: 2 },
    balanceValue: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground },
    refreshBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    fieldBlock: { marginHorizontal: 20, marginBottom: 16 },
    fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.5, marginBottom: 8 },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.input,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
    },
    inputRowFocused: { borderColor: colors.primary },
    textInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.foreground },
    inputAction: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 4,
      flexDirection: "row",
      alignItems: "center",
    },
    inputActionText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primary },
    amountSuffix: { paddingRight: 14, fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    pctRow: { flexDirection: "row", gap: 8, marginTop: 8 },
    pctBtn: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    pctBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    recentDropdown: {
      marginHorizontal: 20,
      marginTop: -8,
      marginBottom: 12,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    recentHeader: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    recentHeaderText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1 },
    recentItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    recentAddress: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground },
    errorText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.destructive, marginHorizontal: 20, marginBottom: 8 },
    primaryBtn: { marginHorizontal: 20, borderRadius: colors.radius, overflow: "hidden", marginTop: 4 },
    primaryGrad: { paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
    primaryBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
    confirmCard: {
      marginHorizontal: 20,
      backgroundColor: colors.card,
      borderRadius: colors.radius + 4,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
      marginBottom: 16,
    },
    confirmRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    confirmLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    confirmValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground, flex: 1, textAlign: "right", marginLeft: 16 },
    confirmAmount: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.primary, textAlign: "right" },
    networkBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.primary + "15",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
    },
    networkBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.primary },
    warningNote: {
      marginHorizontal: 20,
      backgroundColor: "#F59E0B10",
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: "#F59E0B30",
      padding: 12,
      flexDirection: "row",
      gap: 10,
      marginBottom: 16,
      alignItems: "flex-start",
    },
    warningText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 18 },
    ghostBtn: { marginHorizontal: 20, paddingVertical: 14, alignItems: "center", marginTop: 4 },
    ghostBtnText: { fontSize: 15, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    successContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
    successCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: "#10B98115",
      borderWidth: 2,
      borderColor: "#10B98150",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 24,
    },
    successTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 6, textAlign: "center" },
    successSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", marginBottom: 28 },
    txHashBox: {
      width: "100%",
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 28,
    },
    txHashLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.5, marginBottom: 6 },
    txHashText: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.primary, lineHeight: 18 },
    successBtnRow: { flexDirection: "row", gap: 12, width: "100%" },
    successBtn: { flex: 1, borderRadius: colors.radius, overflow: "hidden" },
    successBtnGrad: { paddingVertical: 14, alignItems: "center" },
    successBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
    secondaryBtn: {
      flex: 1,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
      alignItems: "center",
      backgroundColor: colors.card,
    },
    secondaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
  });

  if (step === "success") {
    return (
      <View style={[s.container, s.successContainer]}>
        <Animated.View style={{ transform: [{ scale: successScale }], opacity: successOpacity, alignItems: "center" }}>
          <View style={s.successCircle}>
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Icon name="checkmark" size={42} color={colors.success} />
            </Animated.View>
          </View>
          <Text style={s.successTitle}>Sent Successfully</Text>
          <Text style={s.successSub}>{amount} MC → {shortenAddress(recipient, 8)}</Text>
        </Animated.View>
        <Animated.View style={{ opacity: hashOpacity, width: "100%" }}>
          <View style={s.txHashBox}>
            <Text style={s.txHashLabel}>TRANSACTION HASH</Text>
            <Text style={s.txHashText} selectable numberOfLines={3}>{txHash}</Text>
          </View>
          <View style={s.successBtnRow}>
            <TouchableOpacity
              style={s.secondaryBtn}
              onPress={async () => {
                await Clipboard.setStringAsync(txHash);
                setToast("TX hash copied");
              }}
            >
              <Text style={s.secondaryBtnText}>Copy Hash</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.successBtn} onPress={reset}>
              <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.successBtnGrad}>
                <Text style={s.successBtnText}>Send Again</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>
        <Toast message={toast} visible={!!toast} onHide={() => setToast("")} />
      </View>
    );
  }

  if (step === "confirm") {
    return (
      <View style={s.container}>
        <Animated.View style={{ flex: 1, transform: [{ translateX: slideAnim }] }}>
          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
            <View style={s.header}>
              <TouchableOpacity style={s.backBtn} onPress={() => slideToStep("input")}>
                <Icon name="arrow-back" size={18} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={s.headerTitle}>Review Transaction</Text>
            </View>

            <View style={s.confirmCard}>
              <LinearGradient colors={["#0D2B4E", "#091929"]} style={{ padding: 18 }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.5)", letterSpacing: 1, marginBottom: 8 }}>
                  SENDING
                </Text>
                <Text style={{ fontSize: 36, fontFamily: "Inter_700Bold", color: "#FFFFFF" }}>
                  {amount} <Text style={{ fontSize: 20, color: "rgba(255,255,255,0.6)" }}>MC</Text>
                </Text>
              </LinearGradient>
              <View style={s.confirmRow}>
                <Text style={s.confirmLabel}>To</Text>
                <Text style={[s.confirmValue, { fontSize: 12 }]} numberOfLines={1}>{recipient}</Text>
              </View>
              <View style={s.confirmRow}>
                <Text style={s.confirmLabel}>Network</Text>
                <View style={s.networkBadge}>
                  <Icon name="flash-outline" size={10} color={colors.primary} />
                  <Text style={s.networkBadgeText}>MChain · 1729</Text>
                </View>
              </View>
              <View style={s.confirmRow}>
                <Text style={s.confirmLabel}>Fee</Text>
                <Text style={s.confirmValue}>~0.0001 MC</Text>
              </View>
              <View style={[s.confirmRow, { borderBottomWidth: 0 }]}>
                <Text style={s.confirmLabel}>Nonce</Text>
                <Text style={s.confirmValue}>#{account?.nonce ?? 0}</Text>
              </View>
            </View>

            <View style={s.warningNote}>
              <Icon name="warning-outline" size={14} color="#F59E0B" style={{ marginTop: 1 }} />
              <Text style={s.warningText}>
                This transaction will be signed with your private key and is irreversible. Double-check the recipient address.
              </Text>
            </View>

            <TouchableOpacity
              style={[s.primaryBtn, loading && { opacity: 0.7 }]}
              onPress={handleSend}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Icon name="lock-closed-outline" size={16} color="#FFFFFF" />
                    <Text style={s.primaryBtnText}>Sign & Broadcast</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={s.ghostBtn} onPress={() => slideToStep("input")}>
              <Text style={s.ghostBtnText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
        <Toast message={toast} visible={!!toast} onHide={() => setToast("")} />
        <QRScannerModal
          visible={showScanner}
          onClose={() => setShowScanner(false)}
          onScan={(address) => { setRecipient(address); setError(""); }}
        />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <Animated.View style={{ flex: 1, transform: [{ translateX: slideAnim }] }}>
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={s.header}>
            <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
              <Icon name="close" size={18} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Send MC</Text>
          </View>

          <View style={s.balanceCard}>
            <View>
              <Text style={s.balanceLabel}>AVAILABLE BALANCE</Text>
              <Text style={s.balanceValue}>{balance} MC</Text>
            </View>
            <TouchableOpacity style={s.refreshBtn} onPress={() => refetchAccount()}>
              <Icon name="refresh-outline" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <View style={s.fieldBlock}>
            <Text style={s.fieldLabel}>RECIPIENT ADDRESS</Text>
            <View style={[s.inputRow, recipientFocused && s.inputRowFocused]}>
              <TextInput
                style={s.textInput}
                placeholder="mxc1..."
                placeholderTextColor={colors.mutedForeground}
                value={recipient}
                onChangeText={(t) => { setRecipient(t); setError(""); }}
                onFocus={() => { setRecipientFocused(true); setShowRecent(recentAddresses.length > 0); }}
                onBlur={() => { setRecipientFocused(false); }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={s.inputAction}
                onPress={() => { setShowRecent(false); setShowScanner(true); }}
              >
                <Icon name="scan" size={16} color={colors.primary} />
              </TouchableOpacity>
              <View style={{ width: 1, height: 20, backgroundColor: colors.border }} />
              <TouchableOpacity style={s.inputAction} onPress={handlePasteAddress}>
                <Icon name="clipboard-outline" size={14} color={colors.primary} />
                <Text style={s.inputActionText}>Paste</Text>
              </TouchableOpacity>
            </View>
          </View>

          {showRecent && recentAddresses.length > 0 && (
            <View style={s.recentDropdown}>
              <View style={s.recentHeader}>
                <Text style={s.recentHeaderText}>RECENT</Text>
              </View>
              {recentAddresses.map((addr) => (
                <TouchableOpacity
                  key={addr}
                  style={s.recentItem}
                  onPress={() => {
                    setRecipient(addr);
                    setShowRecent(false);
                    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Icon name="time-outline" size={13} color={colors.mutedForeground} />
                  <Text style={s.recentAddress} numberOfLines={1}>
                    {shortenAddress(addr, 10)}
                  </Text>
                  <Icon name="chevron-forward" size={13} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={s.fieldBlock}>
            <Text style={s.fieldLabel}>AMOUNT</Text>
            <View style={[s.inputRow, amountFocused && s.inputRowFocused]}>
              <TextInput
                style={[s.textInput, { fontSize: 20, fontFamily: "Inter_600SemiBold" }]}
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                value={amount}
                onChangeText={(t) => { setAmount(t); setError(""); }}
                onFocus={() => setAmountFocused(true)}
                onBlur={() => setAmountFocused(false)}
                keyboardType="decimal-pad"
              />
              <Text style={s.amountSuffix}>MC</Text>
            </View>
            <View style={s.pctRow}>
              {[0.25, 0.5, 0.75, 1].map((pct) => (
                <TouchableOpacity key={pct} style={s.pctBtn} onPress={() => setAmountPct(pct)}>
                  <Text style={s.pctBtnText}>{pct === 1 ? "MAX" : `${pct * 100}%`}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={s.fieldBlock}>
            <Text style={s.fieldLabel}>MEMO (OPTIONAL)</Text>
            <View style={s.inputRow}>
              <TextInput
                style={s.textInput}
                placeholder="Add a note..."
                placeholderTextColor={colors.mutedForeground}
                value={memo}
                onChangeText={setMemo}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={100}
              />
            </View>
          </View>

          {error ? <Text style={s.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={s.primaryBtn}
            onPress={handleContinue}
            activeOpacity={0.85}
          >
            <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
              <Text style={s.primaryBtnText}>Continue</Text>
              <Icon name="arrow-forward" size={18} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
      <Toast message={toast} visible={!!toast} onHide={() => setToast("")} />
      <QRScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={(address) => { setRecipient(address); setError(""); }}
      />
    </View>
  );
}
