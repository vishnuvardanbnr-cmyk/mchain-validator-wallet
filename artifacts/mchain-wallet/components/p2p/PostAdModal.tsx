import { Icon } from "@/components/Icon";
import { Toast } from "@/components/Toast";
import { useWallet } from "@/context/WalletContext";
import { useColors } from "@/hooks/useColors";
import { p2pApi, type PaymentDetail } from "@/services/p2pApi";
import { PAYMENT_METHODS } from "@/services/paymentMethods";
import { PaymentDetailSheet } from "@/components/p2p/PaymentDetailSheet";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState, useCallback } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  visible: boolean;
  onClose: () => void;
  onPosted: () => void;
}

export function PostAdModal({ visible, onClose, onPosted }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mxcAddress, ethAddress } = useWallet();
  const qc = useQueryClient();

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

  // Inline PaymentDetailSheet state
  const [addPaymentMethod, setAddPaymentMethod] = useState<string | null>(null);

  // ── Saved payment details ─────────────────────────────────────────────────
  const { data: savedPaymentDetails = [] } = useQuery({
    queryKey: ["payment-details", mxcAddress],
    queryFn: () => p2pApi.getPaymentDetails(mxcAddress!),
    enabled: !!mxcAddress,
    staleTime: 30000,
  });
  const savedMethodIds = new Set(savedPaymentDetails.map((d: PaymentDetail) => d.paymentMethod));

  // ── Wallet balance ────────────────────────────────────────────────────────
  const { data: walletBalance } = useQuery({
    queryKey: ["wallet-balance", ethAddress],
    queryFn: () => p2pApi.getWalletBalance(ethAddress!),
    enabled: !!ethAddress && visible,
    staleTime: 15000,
  });

  const availableBalance = token === "USDT"
    ? parseFloat(walletBalance?.usdt ?? "0")
    : parseFloat(walletBalance?.mc ?? "0");

  // ── Market price ──────────────────────────────────────────────────────────
  const { data: marketPrice } = useQuery({
    queryKey: ["market-price", token, side],
    queryFn: () => p2pApi.getMarketPrice(token, side),
    enabled: visible,
    staleTime: 20000,
  });

  // Hint: for sell → show lowest competitor price; for buy → show highest
  const marketHint = (() => {
    if (!marketPrice || marketPrice.count === 0) return null;
    if (side === "sell" && marketPrice.lowestPrice != null)
      return { label: "Lowest sell", value: marketPrice.lowestPrice };
    if (side === "buy" && marketPrice.highestPrice != null)
      return { label: "Highest buy", value: marketPrice.highestPrice };
    return null;
  })();

  // ── Helpers ───────────────────────────────────────────────────────────────
  function togglePm(id: string) {
    setPaymentMethods(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  }

  const handleSetMax = () => {
    if (availableBalance > 0) {
      setAvailableAmount(availableBalance.toFixed(6).replace(/\.?0+$/, ""));
    }
  };

  const handlePaymentMethodSaved = useCallback((detail: PaymentDetail) => {
    qc.invalidateQueries({ queryKey: ["payment-details", mxcAddress] });
    // Auto-select the method that was just added
    setPaymentMethods(prev =>
      prev.includes(detail.paymentMethod) ? prev : [...prev, detail.paymentMethod]
    );
    setAddPaymentMethod(null);
  }, [mxcAddress, qc]);

  // ── Post ad ───────────────────────────────────────────────────────────────
  async function handlePost() {
    if (!mxcAddress) return;

    if (!price || !minAmount || !maxAmount || !availableAmount) {
      setToast("Fill in all required fields"); return;
    }
    if (isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      setToast("Enter a valid price"); return;
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
    // For sell ads: ensure user has sufficient balance
    if (side === "sell" && walletBalance) {
      const amt = parseFloat(availableAmount);
      if (amt > availableBalance) {
        setToast(`Insufficient balance. You have ${availableBalance.toFixed(4)} ${token}`);
        return;
      }
    }
    // Require payment details configured for at least one selected method
    const hasAnyDetail = paymentMethods.some(m => savedMethodIds.has(m));
    if (!hasAnyDetail) {
      setToast("Add payment details for at least one selected method"); return;
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

  // ── Styles ────────────────────────────────────────────────────────────────
  const s = StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.72)" },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 16, maxHeight: "94%" },
    handle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
    label: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.2, marginBottom: 8 },
    labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    labelBalance: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    labelBalanceVal: { fontFamily: "Inter_700Bold", color: colors.primary },
    segRow: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 3, marginBottom: 18 },
    segBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center" },
    segBtnActive: { backgroundColor: colors.primary + "25", borderWidth: 1, borderColor: colors.primary + "50" },
    segText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    segTextActive: { color: colors.primary },
    inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 6 },
    input: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground },
    inputPlain: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground, marginBottom: 14 },
    maxBtn: { paddingHorizontal: 10, paddingVertical: 6, marginRight: 8, backgroundColor: colors.primary + "18", borderRadius: 8, borderWidth: 1, borderColor: colors.primary + "40" },
    maxBtnText: { fontSize: 11, fontFamily: "Inter_700Bold", color: colors.primary },
    hintBox: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
    hintChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: "#0EA5E910", borderWidth: 1, borderColor: "#0EA5E930" },
    hintChipText: { fontSize: 11, fontFamily: "Inter_500Medium", color: "#0EA5E9" },
    hintChipVal: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#0EA5E9" },
    row2: { flexDirection: "row", gap: 10, marginBottom: 0 },
    half: { flex: 1 },
    pmGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
    pmChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
    pmChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + "15" },
    pmText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    pmTextActive: { color: colors.primary, fontFamily: "Inter_600SemiBold" },
    pmAddBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: "#F59E0B40", backgroundColor: "#F59E0B0C" },
    pmAddBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#F59E0B" },
    warningBox: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: "#F59E0B10", borderRadius: 10, borderWidth: 1, borderColor: "#F59E0B30", padding: 12, marginBottom: 14 },
    warningText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: "#F59E0B", lineHeight: 18 },
    insufficientBox: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: "#EF444410", borderRadius: 10, borderWidth: 1, borderColor: "#EF444430", padding: 10, marginBottom: 10 },
    insufficientText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", color: "#EF4444" },
    textarea: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, minHeight: 80, textAlignVertical: "top", marginBottom: 18 },
    saveBtn: { borderRadius: 14, overflow: "hidden", marginHorizontal: 20, marginTop: 8 },
    saveGrad: { paddingVertical: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
    saveBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFF" },
    sideSell: { borderColor: "#0EA5E9", backgroundColor: "#0EA5E915" },
    sideSellText: { color: "#0EA5E9" },
    sideBuy: { borderColor: "#10B981", backgroundColor: "#10B98115" },
    sideBuyText: { color: "#10B981" },
  });

  const isSell = side === "sell";
  const enteredAmount = parseFloat(availableAmount || "0");
  const insufficientBalance = isSell && !!walletBalance && enteredAmount > 0 && enteredAmount > availableBalance;

  // Methods that are selected but have no saved details
  const unsavedSelected = paymentMethods.filter(m => !savedMethodIds.has(m));
  const noPaymentDetails = savedMethodIds.size === 0;

  return (
    <>
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
              <View style={[s.inputWrap, { marginBottom: marketHint ? 8 : 14 }]}>
                <TextInput
                  style={s.input}
                  value={price}
                  onChangeText={setPrice}
                  placeholder="0.00"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                />
              </View>
              {/* Market price hints */}
              {marketHint && (
                <View style={s.hintBox}>
                  <View style={s.hintChip}>
                    <Icon name="trending-up-outline" size={11} color="#0EA5E9" />
                    <Text style={s.hintChipText}>{marketHint.label}: </Text>
                    <Text style={s.hintChipVal}>{marketHint.value.toFixed(4)} USDT</Text>
                  </View>
                  {marketPrice && marketPrice.count > 0 && (
                    <View style={s.hintChip}>
                      <Icon name="bar-chart-outline" size={11} color="#0EA5E9" />
                      <Text style={s.hintChipText}>Range: </Text>
                      <Text style={s.hintChipVal}>
                        {marketPrice.lowestPrice?.toFixed(2)} – {marketPrice.highestPrice?.toFixed(2)}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Available amount with balance */}
              <View style={s.labelRow}>
                <Text style={[s.label, { marginBottom: 0 }]}>AVAILABLE AMOUNT ({token})</Text>
                {walletBalance && (
                  <Text style={s.labelBalance}>
                    Balance: <Text style={s.labelBalanceVal}>
                      {token === "USDT"
                        ? parseFloat(walletBalance.usdt).toFixed(2)
                        : parseFloat(walletBalance.mc).toFixed(2)
                      } {token}
                    </Text>
                  </Text>
                )}
              </View>
              <View style={[s.inputWrap, insufficientBalance && { borderColor: "#EF4444" }]}>
                <TextInput
                  style={s.input}
                  value={availableAmount}
                  onChangeText={setAvailableAmount}
                  placeholder="Total amount to offer"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                />
                {isSell && availableBalance > 0 && (
                  <TouchableOpacity style={s.maxBtn} onPress={handleSetMax} activeOpacity={0.7}>
                    <Text style={s.maxBtnText}>MAX</Text>
                  </TouchableOpacity>
                )}
              </View>
              {insufficientBalance && (
                <View style={s.insufficientBox}>
                  <Icon name="alert-circle-outline" size={14} color="#EF4444" />
                  <Text style={s.insufficientText}>
                    Insufficient balance. Available: {availableBalance.toFixed(4)} {token}
                  </Text>
                </View>
              )}
              <View style={{ height: 8 }} />

              {/* Min / Max */}
              <Text style={s.label}>ORDER LIMITS ({token})</Text>
              <View style={s.row2}>
                <View style={s.half}>
                  <TextInput style={[s.inputPlain]} value={minAmount} onChangeText={setMinAmount} placeholder="Min" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
                </View>
                <View style={s.half}>
                  <TextInput style={[s.inputPlain]} value={maxAmount} onChangeText={setMaxAmount} placeholder="Max" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
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

              {/* Gate: no payment details at all */}
              {noPaymentDetails ? (
                <View style={s.warningBox}>
                  <Icon name="alert-circle-outline" size={16} color="#F59E0B" />
                  <View style={{ flex: 1, gap: 8 }}>
                    <Text style={s.warningText}>
                      You need to add payment details before posting. Buyers need to know how to pay you.
                    </Text>
                    {PAYMENT_METHODS.map(pm => (
                      <TouchableOpacity
                        key={pm.id}
                        style={s.pmAddBtn}
                        onPress={() => setAddPaymentMethod(pm.id)}
                        activeOpacity={0.8}
                      >
                        <Icon name="add-circle-outline" size={14} color="#F59E0B" />
                        <Text style={s.pmAddBtnText}>Add {pm.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : (
                <>
                  <View style={s.pmGrid}>
                    {PAYMENT_METHODS.map(pm => {
                      const isActive = paymentMethods.includes(pm.id);
                      const hasSaved = savedMethodIds.has(pm.id);
                      return (
                        <TouchableOpacity
                          key={pm.id}
                          style={[s.pmChip, isActive && s.pmChipActive]}
                          onPress={() => togglePm(pm.id)}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Text style={[s.pmText, isActive && s.pmTextActive]}>{pm.label}</Text>
                            {isActive && (hasSaved
                              ? <Icon name="checkmark-circle" size={11} color={colors.primary} />
                              : <Icon name="alert-circle-outline" size={11} color="#F59E0B" />)}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Warn about selected methods that have no saved details */}
                  {unsavedSelected.length > 0 && (
                    <View style={[s.warningBox, { marginBottom: 10 }]}>
                      <Icon name="alert-circle-outline" size={14} color="#F59E0B" />
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={s.warningText}>
                          Add payment details for: {unsavedSelected.map(m =>
                            PAYMENT_METHODS.find(p => p.id === m)?.label ?? m
                          ).join(", ")}
                        </Text>
                        {unsavedSelected.map(methodId => (
                          <TouchableOpacity
                            key={methodId}
                            style={s.pmAddBtn}
                            onPress={() => setAddPaymentMethod(methodId)}
                            activeOpacity={0.8}
                          >
                            <Icon name="add-circle-outline" size={13} color="#F59E0B" />
                            <Text style={s.pmAddBtnText}>
                              Add {PAYMENT_METHODS.find(p => p.id === methodId)?.label ?? methodId}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </>
              )}

              {/* Terms */}
              <Text style={[s.label, { marginTop: 4 }]}>TERMS (OPTIONAL)</Text>
              <TextInput
                style={s.textarea}
                value={terms}
                onChangeText={setTerms}
                placeholder="Any conditions or notes for traders…"
                placeholderTextColor={colors.mutedForeground}
                multiline
                maxLength={500}
              />

            </ScrollView>

            <TouchableOpacity
              style={[s.saveBtn, (loading || insufficientBalance) && { opacity: 0.6 }]}
              onPress={handlePost}
              disabled={loading || insufficientBalance}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={isSell ? ["#0EA5E9", "#0284C7"] : ["#10B981", "#059669"]}
                style={s.saveGrad}
              >
                {loading
                  ? <ActivityIndicator color="#FFF" />
                  : <>
                      <Icon name="add-circle-outline" size={16} color="#FFF" />
                      <Text style={s.saveBtnText}>
                        Post {isSell ? "Sell" : "Buy"} Ad
                      </Text>
                    </>
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
        <Toast message={toast} visible={!!toast} onHide={() => setToast("")} />
      </Modal>

      {/* Inline PaymentDetailSheet — opens on top of PostAdModal */}
      {addPaymentMethod && (
        <PaymentDetailSheet
          visible={!!addPaymentMethod}
          onClose={() => setAddPaymentMethod(null)}
          onSaved={handlePaymentMethodSaved}
          ownerAddress={mxcAddress!}
          paymentMethod={addPaymentMethod}
          existing={null}
        />
      )}
    </>
  );
}
