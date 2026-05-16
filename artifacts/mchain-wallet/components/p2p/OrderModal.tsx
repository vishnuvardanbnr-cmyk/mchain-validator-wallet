import { Icon } from "@/components/Icon";
import { Toast } from "@/components/Toast";
import { useWallet } from "@/context/WalletContext";
import { useColors } from "@/hooks/useColors";
import { p2pApi, type P2pAd } from "@/services/p2pApi";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  visible: boolean;
  ad: P2pAd;
  onClose: () => void;
  onOrderPlaced: () => void;
}

export function OrderModal({ visible, ad, onClose, onOrderPlaced }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mxcAddress } = useWallet();

  const [amount, setAmount] = useState("");
  const [selectedPm, setSelectedPm] = useState(ad.paymentMethods[0] ?? "");
  const [paymentDetails, setPaymentDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  const price = parseFloat(ad.price);
  const cryptoAmt = parseFloat(amount) || 0;
  const fiatAmt = (cryptoAmt * price).toFixed(2);
  const min = parseFloat(ad.minAmount);
  const max = parseFloat(ad.maxAmount);
  const available = parseFloat(ad.availableAmount);

  const isBuyOrder = ad.side === "sell"; // ad is sell → I'm buying

  async function handlePlace() {
    if (!mxcAddress) return;
    if (!amount || cryptoAmt <= 0) { setToast("Enter an amount"); return; }
    if (cryptoAmt < min) { setToast(`Minimum is ${min} ${ad.token}`); return; }
    if (cryptoAmt > max) { setToast(`Maximum is ${max} ${ad.token}`); return; }
    if (cryptoAmt > available) { setToast(`Only ${available} ${ad.token} available`); return; }
    if (!selectedPm) { setToast("Select a payment method"); return; }

    setLoading(true);
    try {
      await p2pApi.createOrder({
        adId: ad.id,
        buyerAddress: mxcAddress,
        cryptoAmount: amount,
        paymentMethod: selectedPm,
        paymentDetails: paymentDetails || undefined,
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onOrderPlaced();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to place order");
    } finally {
      setLoading(false);
    }
  }

  const s = StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.72)" },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 16, maxHeight: "90%" },
    handle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    scroll: { paddingHorizontal: 20, paddingTop: 16 },
    infoCard: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 18 },
    infoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
    infoLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    infoVal: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    priceVal: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.primary },
    label: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.2, marginBottom: 8 },
    inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, paddingHorizontal: 14, marginBottom: 14 },
    input: { flex: 1, paddingVertical: 13, fontSize: 18, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    unit: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    fiatRow: { backgroundColor: colors.primary + "10", borderRadius: 10, padding: 12, marginBottom: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    fiatLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    fiatVal: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.primary },
    pmGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 },
    pmChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
    pmChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + "15" },
    pmText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    pmTextActive: { color: colors.primary, fontFamily: "Inter_600SemiBold" },
    detailInput: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, marginBottom: 18 },
    termsBox: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 20 },
    termsText: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 18 },
    btn: { borderRadius: 14, overflow: "hidden", marginHorizontal: 20, marginTop: 4 },
    btnGrad: { paddingVertical: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
    btnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFF" },
    limitHint: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 14, marginTop: -8 },
  });

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={s.overlay} onPress={onClose} />
        <View style={s.sheet}>
              <View style={s.handle} />
              <View style={s.header}>
                <Text style={s.title}>{isBuyOrder ? "Buy" : "Sell"} {ad.token}</Text>
                <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                  <Icon name="close" size={16} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
                {/* Ad summary */}
                <View style={s.infoCard}>
                  <Text style={s.priceVal}>{parseFloat(ad.price).toLocaleString("en-US", { maximumFractionDigits: 4 })} USDT</Text>
                  <Text style={[s.infoLabel, { marginBottom: 10 }]}>per {ad.token}</Text>
                  <View style={s.infoRow}>
                    <Text style={s.infoLabel}>Available</Text>
                    <Text style={s.infoVal}>{parseFloat(ad.availableAmount).toFixed(2)} {ad.token}</Text>
                  </View>
                  <View style={s.infoRow}>
                    <Text style={s.infoLabel}>Limit</Text>
                    <Text style={s.infoVal}>{min} – {max} {ad.token}</Text>
                  </View>
                  <View style={[s.infoRow, { marginBottom: 0 }]}>
                    <Text style={s.infoLabel}>Payment window</Text>
                    <Text style={s.infoVal}>{ad.paymentWindow} min</Text>
                  </View>
                </View>

                {/* Amount */}
                <Text style={s.label}>AMOUNT ({ad.token})</Text>
                <View style={s.inputRow}>
                  <TextInput style={s.input} value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
                  <Text style={s.unit}>{ad.token}</Text>
                </View>
                <Text style={s.limitHint}>Min {min} · Max {max} {ad.token}</Text>

                {/* Fiat equivalent */}
                <View style={s.fiatRow}>
                  <Text style={s.fiatLabel}>You {isBuyOrder ? "pay" : "receive"}</Text>
                  <Text style={s.fiatVal}>{fiatAmt} USDT</Text>
                </View>

                {/* Payment method */}
                <Text style={s.label}>PAYMENT METHOD</Text>
                <View style={s.pmGrid}>
                  {ad.paymentMethods.map(pm => (
                    <TouchableOpacity key={pm} style={[s.pmChip, selectedPm === pm && s.pmChipActive]} onPress={() => setSelectedPm(pm)}>
                      <Text style={[s.pmText, selectedPm === pm && s.pmTextActive]}>
                        {pm.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Payment details */}
                <Text style={s.label}>YOUR PAYMENT DETAILS (OPTIONAL)</Text>
                <TextInput style={s.detailInput} value={paymentDetails} onChangeText={setPaymentDetails} placeholder="Account number, PayPal email, etc." placeholderTextColor={colors.mutedForeground} />

                {/* Terms */}
                {ad.terms && (
                  <>
                    <Text style={s.label}>SELLER'S TERMS</Text>
                    <View style={s.termsBox}>
                      <Text style={s.termsText}>{ad.terms}</Text>
                    </View>
                  </>
                )}
              </ScrollView>

              <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={handlePlace} disabled={loading} activeOpacity={0.85}>
                <LinearGradient colors={isBuyOrder ? ["#0EA5E9", "#0284C7"] : ["#10B981", "#059669"]} style={s.btnGrad}>
                  {loading ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnText}>{isBuyOrder ? `Buy ${ad.token}` : `Sell ${ad.token}`}</Text>}
                </LinearGradient>
              </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      <Toast message={toast} visible={!!toast} onHide={() => setToast("")} />
    </Modal>
  );
}
