import { Icon } from "@/components/Icon";
import { Toast } from "@/components/Toast";
import { useWallet } from "@/context/WalletContext";
import { useColors } from "@/hooks/useColors";
import { p2pApi } from "@/services/p2pApi";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PAYMENT_METHODS = [
  { id: "bank_transfer", label: "Bank Transfer" },
  { id: "paypal", label: "PayPal" },
  { id: "revolut", label: "Revolut" },
  { id: "wise", label: "Wise" },
  { id: "cash", label: "Cash" },
  { id: "crypto_transfer", label: "Crypto Transfer" },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onPosted: () => void;
}

export function PostAdModal({ visible, onClose, onPosted }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mxcAddress } = useWallet();

  const [token, setToken] = useState<"MC" | "USDT">("MC");
  const [side, setSide] = useState<"buy" | "sell">("sell");
  const [price, setPrice] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [availableAmount, setAvailableAmount] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<string[]>(["bank_transfer"]);
  const [paymentWindow, setPaymentWindow] = useState("15");
  const [terms, setTerms] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  function togglePm(id: string) {
    setPaymentMethods(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  }

  async function handlePost() {
    if (!mxcAddress) return;
    if (!price || !minAmount || !maxAmount || !availableAmount) {
      setToast("Fill in all required fields"); return;
    }
    if (parseFloat(minAmount) > parseFloat(maxAmount)) {
      setToast("Min must be ≤ Max"); return;
    }
    if (parseFloat(maxAmount) > parseFloat(availableAmount)) {
      setToast("Max cannot exceed available amount"); return;
    }
    if (paymentMethods.length === 0) {
      setToast("Select at least one payment method"); return;
    }
    setLoading(true);
    try {
      await p2pApi.postAd({
        ownerAddress: mxcAddress,
        token, side, price, minAmount, maxAmount, availableAmount,
        paymentMethods,
        paymentWindow: parseInt(paymentWindow) || 15,
        terms: terms || undefined,
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onPosted();
      onClose();
      resetForm();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to post ad");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setPrice(""); setMinAmount(""); setMaxAmount(""); setAvailableAmount("");
    setPaymentMethods(["bank_transfer"]); setPaymentWindow("15"); setTerms("");
  }

  const s = StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.72)" },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 16, maxHeight: "94%" },
    handle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
    label: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.2, marginBottom: 8 },
    segRow: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 3, marginBottom: 18 },
    segBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center" },
    segBtnActive: { backgroundColor: colors.primary + "25", borderWidth: 1, borderColor: colors.primary + "50" },
    segText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    segTextActive: { color: colors.primary },
    input: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground, marginBottom: 14 },
    row2: { flexDirection: "row", gap: 10, marginBottom: 0 },
    half: { flex: 1 },
    pmGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 },
    pmChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
    pmChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + "15" },
    pmText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    pmTextActive: { color: colors.primary, fontFamily: "Inter_600SemiBold" },
    textarea: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, minHeight: 80, textAlignVertical: "top", marginBottom: 18 },
    saveBtn: { borderRadius: 14, overflow: "hidden", marginHorizontal: 20, marginTop: 8 },
    saveGrad: { paddingVertical: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
    saveBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFF" },
    sideSell: { borderColor: "#0EA5E9", backgroundColor: "#0EA5E915" },
    sideSellText: { color: "#0EA5E9" },
    sideBuy: { borderColor: "#10B981", backgroundColor: "#10B98115" },
    sideBuyText: { color: "#10B981" },
  });

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={s.overlay} onPress={onClose} />
        <View style={s.sheet}>
              <View style={s.handle} />
              <View style={s.header}>
                <Text style={s.title}>Post Ad</Text>
                <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                  <Icon name="close" size={16} color={colors.foreground} />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

                {/* Token */}
                <Text style={s.label}>TOKEN</Text>
                <View style={s.segRow}>
                  {(["MC", "USDT"] as const).map(t => (
                    <TouchableOpacity key={t} style={[s.segBtn, token === t && s.segBtnActive]} onPress={() => setToken(t)}>
                      <Text style={[s.segText, token === t && s.segTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Side */}
                <Text style={s.label}>I WANT TO</Text>
                <View style={s.segRow}>
                  <TouchableOpacity style={[s.segBtn, side === "sell" && s.sideSell]} onPress={() => setSide("sell")}>
                    <Text style={[s.segText, side === "sell" && s.sideSellText]}>Sell {token}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.segBtn, side === "buy" && s.sideBuy]} onPress={() => setSide("buy")}>
                    <Text style={[s.segText, side === "buy" && s.sideBuyText]}>Buy {token}</Text>
                  </TouchableOpacity>
                </View>

                {/* Price */}
                <Text style={s.label}>PRICE (USDT per {token})</Text>
                <TextInput style={s.input} value={price} onChangeText={setPrice} placeholder="0.00" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />

                {/* Available */}
                <Text style={s.label}>AVAILABLE AMOUNT ({token})</Text>
                <TextInput style={s.input} value={availableAmount} onChangeText={setAvailableAmount} placeholder="Total amount to offer" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />

                {/* Min / Max */}
                <Text style={s.label}>ORDER LIMITS ({token})</Text>
                <View style={s.row2}>
                  <View style={s.half}>
                    <TextInput style={[s.input, { marginBottom: 14 }]} value={minAmount} onChangeText={setMinAmount} placeholder="Min" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
                  </View>
                  <View style={s.half}>
                    <TextInput style={[s.input, { marginBottom: 14 }]} value={maxAmount} onChangeText={setMaxAmount} placeholder="Max" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
                  </View>
                </View>

                {/* Payment window */}
                <Text style={s.label}>PAYMENT WINDOW (MINUTES)</Text>
                <View style={s.segRow}>
                  {["15", "30", "60"].map(w => (
                    <TouchableOpacity key={w} style={[s.segBtn, paymentWindow === w && s.segBtnActive]} onPress={() => setPaymentWindow(w)}>
                      <Text style={[s.segText, paymentWindow === w && s.segTextActive]}>{w} min</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Payment methods */}
                <Text style={[s.label, { marginTop: 4 }]}>PAYMENT METHODS</Text>
                <View style={s.pmGrid}>
                  {PAYMENT_METHODS.map(pm => (
                    <TouchableOpacity key={pm.id} style={[s.pmChip, paymentMethods.includes(pm.id) && s.pmChipActive]} onPress={() => togglePm(pm.id)}>
                      <Text style={[s.pmText, paymentMethods.includes(pm.id) && s.pmTextActive]}>{pm.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Terms */}
                <Text style={s.label}>TERMS (OPTIONAL)</Text>
                <TextInput style={s.textarea} value={terms} onChangeText={setTerms} placeholder="Any conditions or notes for traders…" placeholderTextColor={colors.mutedForeground} multiline maxLength={500} />

              </ScrollView>

              <TouchableOpacity style={[s.saveBtn, loading && { opacity: 0.6 }]} onPress={handlePost} disabled={loading} activeOpacity={0.85}>
                <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.saveGrad}>
                  {loading ? <ActivityIndicator color="#FFF" /> : <><Icon name="add-circle-outline" size={16} color="#FFF" /><Text style={s.saveBtnText}>Post Ad</Text></>}
                </LinearGradient>
              </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      <Toast message={toast} visible={!!toast} onHide={() => setToast("")} />
    </Modal>
  );
}
