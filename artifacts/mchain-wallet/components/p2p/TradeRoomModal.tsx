import { Icon } from "@/components/Icon";
import { Toast } from "@/components/Toast";
import { useWallet } from "@/context/WalletContext";
import { useColors } from "@/hooks/useColors";
import { p2pApi, type P2pDispute, type P2pMessage, type P2pOrder } from "@/services/p2pApi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B", paid: "#0EA5E9", released: "#10B981",
  cancelled: "#6B7280", disputed: "#EF4444", resolved: "#8B5CF6",
};

const DISPUTE_REASONS = [
  { id: "payment_not_received", label: "Payment not received" },
  { id: "payment_received_but_not_released", label: "Paid but crypto not released" },
  { id: "wrong_amount", label: "Wrong amount received" },
  { id: "other", label: "Other" },
];

function Countdown({ deadline }: { deadline: string }) {
  const colors = useColors();
  const [secs, setSecs] = useState(() => Math.max(0, Math.floor((new Date(deadline).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    const id = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const mins = Math.floor(secs / 60);
  const s2 = secs % 60;
  const isUrgent = secs < 120;
  return (
    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: isUrgent ? "#EF4444" : colors.mutedForeground }}>
      {secs === 0 ? "Expired" : `${mins}:${s2.toString().padStart(2, "0")} remaining`}
    </Text>
  );
}

interface Props {
  visible: boolean;
  orderId: string;
  onClose: () => void;
}

export function TradeRoomModal({ visible, orderId, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mxcAddress } = useWallet();
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);

  const [msgText, setMsgText] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState("payment_not_received");
  const [disputeDesc, setDisputeDesc] = useState("");
  const [toast, setToast] = useState("");

  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ["p2p_order", orderId],
    queryFn: () => p2pApi.getOrder(orderId),
    enabled: visible,
    refetchInterval: 5_000,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["p2p_messages", orderId],
    queryFn: () => p2pApi.getMessages(orderId),
    enabled: visible,
    refetchInterval: 4_000,
  });

  const { data: dispute } = useQuery({
    queryKey: ["p2p_dispute", orderId],
    queryFn: () => p2pApi.getDispute(orderId),
    enabled: visible && order?.status === "disputed",
    retry: false,
  });

  useEffect(() => {
    if (messages.length > 0) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  const isBuyer = order?.buyerAddress === mxcAddress;
  const isSeller = order?.sellerAddress === mxcAddress;

  const sendMsg = useMutation({
    mutationFn: () => p2pApi.sendMessage(orderId, { senderAddress: mxcAddress!, content: msgText.trim() }),
    onSuccess: () => { setMsgText(""); queryClient.invalidateQueries({ queryKey: ["p2p_messages", orderId] }); },
    onError: (e) => setToast(e instanceof Error ? e.message : "Failed to send"),
  });

  const markPaid = useMutation({
    mutationFn: () => p2pApi.markPaid(orderId, mxcAddress!),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["p2p_order", orderId] }); if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
    onError: (e) => setToast(e instanceof Error ? e.message : "Failed"),
  });

  const release = useMutation({
    mutationFn: () => p2pApi.confirmRelease(orderId, mxcAddress!),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["p2p_order", orderId] }); queryClient.invalidateQueries({ queryKey: ["p2p_my_orders"] }); if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
    onError: (e) => setToast(e instanceof Error ? e.message : "Failed"),
  });

  const cancelOrder = useMutation({
    mutationFn: () => p2pApi.cancelOrder(orderId, mxcAddress!, "Cancelled by user"),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["p2p_order", orderId] }); queryClient.invalidateQueries({ queryKey: ["p2p_my_orders"] }); },
    onError: (e) => setToast(e instanceof Error ? e.message : "Failed"),
  });

  const openDispute = useMutation({
    mutationFn: () => p2pApi.openDispute(orderId, { openedBy: mxcAddress!, reason: disputeReason, description: disputeDesc }),
    onSuccess: () => { setShowDispute(false); queryClient.invalidateQueries({ queryKey: ["p2p_order", orderId] }); if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); },
    onError: (e) => setToast(e instanceof Error ? e.message : "Failed to open dispute"),
  });

  function handleRelease() {
    Alert.alert(
      "Release Crypto",
      `Confirm you have received the payment and want to release ${order?.cryptoAmount} ${order?.token} to the buyer.`,
      [{ text: "Cancel", style: "cancel" }, { text: "Release", style: "destructive", onPress: () => release.mutate() }]
    );
  }

  function handleCancel() {
    Alert.alert("Cancel Order", "Are you sure you want to cancel this order?",
      [{ text: "No" }, { text: "Cancel Order", style: "destructive", onPress: () => cancelOrder.mutate() }]
    );
  }

  const isTerminal = ["released", "cancelled", "resolved"].includes(order?.status ?? "");

  const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, height: "96%" },
    handle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerLeft: { flex: 1 },
    title: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground },
    subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, marginRight: 10 },
    statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
    orderCard: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, margin: 14, padding: 12 },
    orderRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
    orderLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    orderVal: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    orderAmount: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.primary, marginBottom: 4 },
    chat: { flex: 1, paddingHorizontal: 14 },
    msgWrap: { marginBottom: 8, maxWidth: "80%" },
    msgBubble: { borderRadius: 14, padding: 10 },
    myBubble: { backgroundColor: colors.primary + "20", borderBottomRightRadius: 4 },
    theirBubble: { backgroundColor: colors.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
    systemBubble: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, alignSelf: "center", paddingHorizontal: 12, paddingVertical: 6, marginVertical: 6 },
    msgText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 18 },
    systemText: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" },
    msgTime: { fontSize: 9, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 3 },
    inputRow: { flexDirection: "row", alignItems: "center", padding: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 8, paddingBottom: insets.bottom + 10 },
    msgInput: { flex: 1, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground, maxHeight: 100 },
    sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    actionBar: { paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 },
    actionRow: { flexDirection: "row", gap: 8 },
    actionBtn: { flex: 1, borderRadius: 12, overflow: "hidden" },
    actionGrad: { paddingVertical: 13, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 },
    actionText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#FFF" },
    ghostBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
    ghostText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    disputeSheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: insets.bottom + 16 },
    disputeTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#EF4444", marginBottom: 14 },
    disputeLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.2, marginBottom: 8 },
    reasonChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, marginBottom: 8 },
    reasonChipActive: { borderColor: "#EF4444", backgroundColor: "#EF444415" },
    reasonText: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    reasonTextActive: { color: "#EF4444", fontFamily: "Inter_600SemiBold" },
    disputeInput: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, minHeight: 80, textAlignVertical: "top", marginBottom: 14 },
    disputeBtn: { borderRadius: 12, overflow: "hidden" },
    disputeGrad: { paddingVertical: 14, alignItems: "center" },
    disputeBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#FFF" },
  });

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.handle} />

            {/* Header */}
            <View style={s.header}>
              <View style={s.headerLeft}>
                {order ? (
                  <>
                    <Text style={s.title}>{isBuyer ? "Buying" : "Selling"} {order.cryptoAmount} {order.token}</Text>
                    <Text style={s.subtitle}>≈ {parseFloat(order.fiatAmount).toFixed(2)} USDT via {order.paymentMethod.replace(/_/g, " ")}</Text>
                  </>
                ) : <Text style={s.title}>Loading…</Text>}
              </View>
              {order && (
                <View style={[s.statusBadge, { backgroundColor: (STATUS_COLORS[order.status] ?? "#888") + "15", borderColor: (STATUS_COLORS[order.status] ?? "#888") + "40" }]}>
                  <Text style={[s.statusText, { color: STATUS_COLORS[order.status] ?? "#888" }]}>{order.status.toUpperCase()}</Text>
                </View>
              )}
              <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                <Icon name="close" size={16} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {/* Order info strip */}
            {order && (
              <View style={s.orderCard}>
                <Text style={s.orderAmount}>{parseFloat(order.cryptoAmount).toFixed(4)} {order.token}</Text>
                <View style={s.orderRow}>
                  <Text style={s.orderLabel}>Price</Text>
                  <Text style={s.orderVal}>{parseFloat(order.price).toFixed(4)} USDT</Text>
                </View>
                <View style={s.orderRow}>
                  <Text style={s.orderLabel}>Counterparty</Text>
                  <Text style={s.orderVal}>{(isBuyer ? order.sellerAddress : order.buyerAddress).slice(0, 10)}…</Text>
                </View>
                {order.status === "pending" && isBuyer && (
                  <View style={s.orderRow}>
                    <Text style={s.orderLabel}>Time remaining</Text>
                    <Countdown deadline={order.paymentDeadline} />
                  </View>
                )}
              </View>
            )}

            {/* Chat */}
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={100}>
              <ScrollView ref={scrollRef} style={s.chat} contentContainerStyle={{ paddingTop: 10, paddingBottom: 10 }}>
                {messages.map((msg) => {
                  const isMe = msg.senderAddress === mxcAddress;
                  if (msg.isSystem) return (
                    <View key={msg.id} style={s.systemBubble}>
                      <Text style={s.systemText}>{msg.content}</Text>
                    </View>
                  );
                  return (
                    <View key={msg.id} style={[s.msgWrap, { alignSelf: isMe ? "flex-end" : "flex-start" }]}>
                      <View style={[s.msgBubble, isMe ? s.myBubble : s.theirBubble]}>
                        <Text style={s.msgText}>{msg.content}</Text>
                      </View>
                      <Text style={[s.msgTime, { textAlign: isMe ? "right" : "left" }]}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>

              {/* Action bar */}
              {!isTerminal && order && (
                <View style={s.actionBar}>
                  {/* Buyer actions */}
                  {isBuyer && order.status === "pending" && (
                    <View style={s.actionRow}>
                      <TouchableOpacity style={s.actionBtn} onPress={() => markPaid.mutate()} activeOpacity={0.85} disabled={markPaid.isPending}>
                        <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.actionGrad}>
                          {markPaid.isPending ? <ActivityIndicator color="#FFF" size="small" /> : <><Icon name="checkmark-circle-outline" size={15} color="#FFF" /><Text style={s.actionText}>I've Paid</Text></>}
                        </LinearGradient>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.ghostBtn} onPress={handleCancel}>
                        <Text style={s.ghostText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {isBuyer && order.status === "paid" && (
                    <TouchableOpacity style={s.ghostBtn} onPress={() => setShowDispute(true)}>
                      <Text style={[s.ghostText, { color: "#EF4444" }]}>Open Dispute</Text>
                    </TouchableOpacity>
                  )}

                  {/* Seller actions */}
                  {isSeller && order.status === "paid" && (
                    <View style={s.actionRow}>
                      <TouchableOpacity style={s.actionBtn} onPress={handleRelease} activeOpacity={0.85} disabled={release.isPending}>
                        <LinearGradient colors={["#10B981", "#059669"]} style={s.actionGrad}>
                          {release.isPending ? <ActivityIndicator color="#FFF" size="small" /> : <><Icon name="lock-open-outline" size={15} color="#FFF" /><Text style={s.actionText}>Release Crypto</Text></>}
                        </LinearGradient>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.ghostBtn} onPress={() => setShowDispute(true)}>
                        <Text style={[s.ghostText, { color: "#EF4444" }]}>Dispute</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {isSeller && order.status === "pending" && (
                    <TouchableOpacity style={s.ghostBtn} onPress={handleCancel}>
                      <Text style={s.ghostText}>Cancel Order</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Message input */}
              {!isTerminal && (
                <View style={s.inputRow}>
                  <TextInput
                    style={s.msgInput}
                    value={msgText}
                    onChangeText={setMsgText}
                    placeholder="Message…"
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                  />
                  <TouchableOpacity
                    style={[s.sendBtn, (!msgText.trim() || sendMsg.isPending) && { opacity: 0.5 }]}
                    onPress={() => msgText.trim() && sendMsg.mutate()}
                    disabled={!msgText.trim() || sendMsg.isPending}
                  >
                    <Icon name="send" size={16} color="#FFF" />
                  </TouchableOpacity>
                </View>
              )}
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>

      {/* Dispute sheet */}
      <Modal visible={showDispute} animationType="slide" transparent statusBarTranslucent>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} onPress={() => setShowDispute(false)}>
          <Pressable onPress={() => {}}>
            <View style={s.disputeSheet}>
              <Text style={s.disputeTitle}>Open Dispute</Text>
              <Text style={s.disputeLabel}>REASON</Text>
              {DISPUTE_REASONS.map(r => (
                <TouchableOpacity key={r.id} style={[s.reasonChip, disputeReason === r.id && s.reasonChipActive]} onPress={() => setDisputeReason(r.id)}>
                  <Text style={[s.reasonText, disputeReason === r.id && s.reasonTextActive]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
              <Text style={[s.disputeLabel, { marginTop: 12 }]}>DESCRIPTION</Text>
              <TextInput style={s.disputeInput} value={disputeDesc} onChangeText={setDisputeDesc} placeholder="Describe the issue in detail…" placeholderTextColor={colors.mutedForeground} multiline />
              <TouchableOpacity style={[s.disputeBtn, openDispute.isPending && { opacity: 0.6 }]} onPress={() => { if (disputeDesc.length < 10) { setToast("Describe the issue (min 10 chars)"); return; } openDispute.mutate(); }} disabled={openDispute.isPending}>
                <LinearGradient colors={["#EF4444", "#DC2626"]} style={s.disputeGrad}>
                  {openDispute.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={s.disputeBtnText}>Submit Dispute</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Toast message={toast} visible={!!toast} onHide={() => setToast("")} />
    </>
  );
}
