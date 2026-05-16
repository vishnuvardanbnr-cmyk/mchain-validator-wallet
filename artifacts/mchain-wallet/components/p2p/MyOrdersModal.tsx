import { Icon } from "@/components/Icon";
import { useWallet } from "@/context/WalletContext";
import { useColors } from "@/hooks/useColors";
import { p2pApi, type P2pOrder } from "@/services/p2pApi";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TradeRoomModal } from "./TradeRoomModal";

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  paid: "#0EA5E9",
  released: "#10B981",
  cancelled: "#6B7280",
  disputed: "#EF4444",
  resolved: "#8B5CF6",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Payment",
  paid: "Payment Sent",
  released: "Completed",
  cancelled: "Cancelled",
  disputed: "In Dispute",
  resolved: "Resolved",
};

function OrderCard({ order, myAddress, onOpen }: { order: P2pOrder; myAddress: string; onOpen: () => void }) {
  const colors = useColors();
  const isBuyer = order.buyerAddress === myAddress;
  const color = STATUS_COLORS[order.status] ?? colors.mutedForeground;

  const s = StyleSheet.create({
    card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 },
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
    badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
    roleText: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    amountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    amount: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground },
    fiat: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    openBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.primary + "15", borderWidth: 1, borderColor: colors.primary + "35" },
    openText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primary },
    dateText: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 6 },
  });

  return (
    <View style={s.card}>
      <View style={s.topRow}>
        <View style={[s.badge, { backgroundColor: color + "15", borderColor: color + "40" }]}>
          <Text style={[s.badgeText, { color }]}>{STATUS_LABELS[order.status] ?? order.status}</Text>
        </View>
        <Text style={s.roleText}>{isBuyer ? "Buying" : "Selling"} · {order.token}</Text>
      </View>
      <View style={s.amountRow}>
        <View>
          <Text style={s.amount}>{parseFloat(order.cryptoAmount).toFixed(4)} {order.token}</Text>
          <Text style={s.fiat}>≈ {parseFloat(order.fiatAmount).toFixed(2)} USDT @ {parseFloat(order.price).toFixed(4)}</Text>
        </View>
        {!["released", "cancelled", "resolved"].includes(order.status) && (
          <TouchableOpacity style={s.openBtn} onPress={onOpen}>
            <Text style={s.openText}>Open →</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={s.dateText}>{new Date(order.createdAt).toLocaleString()}</Text>
    </View>
  );
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function MyOrdersModal({ visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mxcAddress } = useWallet();
  const [openOrder, setOpenOrder] = useState<P2pOrder | null>(null);

  // ── Paginated orders state ──────────────────────────────────────────────
  const [orderItems, setOrderItems] = useState<P2pOrder[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderOffset, setOrderOffset] = useState(0);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderLoadingMore, setOrderLoadingMore] = useState(false);

  const loadOrders = useCallback(async (offset: number, append: boolean) => {
    if (!mxcAddress) return;
    if (offset === 0) setOrderLoading(true); else setOrderLoadingMore(true);
    try {
      const res = await p2pApi.getMyOrders(mxcAddress, offset);
      setOrderItems(prev => append ? [...prev, ...res.orders] : res.orders);
      setOrderTotal(res.total);
      setOrderOffset(offset + res.orders.length);
    } catch {
      // silently ignore
    } finally {
      setOrderLoading(false);
      setOrderLoadingMore(false);
    }
  }, [mxcAddress]);

  // Load when modal opens; reset on close
  useEffect(() => {
    if (visible && mxcAddress) {
      setOrderItems([]);
      setOrderTotal(0);
      setOrderOffset(0);
      void loadOrders(0, false);
    }
  }, [visible, mxcAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh active orders every 10 s (first page only)
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => { void loadOrders(0, false); }, 10_000);
    return () => clearInterval(id);
  }, [visible, loadOrders]);

  const active = orderItems.filter(o => !["released", "cancelled", "resolved"].includes(o.status));
  const history = orderItems.filter(o => ["released", "cancelled", "resolved"].includes(o.status));

  const hasMore = orderItems.length < orderTotal;

  const s = StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.72)" },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 16, maxHeight: "92%" },
    handle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
    sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.2, marginBottom: 10 },
    empty: { alignItems: "center", paddingVertical: 48, gap: 10 },
    emptyText: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 18 },
    loadMoreBtn: {
      marginVertical: 12,
      paddingVertical: 12, borderRadius: 12,
      borderWidth: 1, borderColor: colors.border,
      alignItems: "center",
    },
    loadMoreText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primary },
    totalText: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", marginBottom: 8 },
  });

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable style={s.overlay} onPress={onClose} />
          <View style={s.sheet}>
            <View style={s.handle} />
            <View style={s.header}>
              <Text style={s.title}>My Orders</Text>
              <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                <Icon name="close" size={16} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={s.scroll}>
              {orderLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
              ) : orderItems.length === 0 ? (
                <View style={s.empty}>
                  <Icon name="receipt-outline" size={40} color={colors.border} />
                  <Text style={s.emptyText}>No orders yet</Text>
                </View>
              ) : (
                <>
                  {active.length > 0 && (
                    <>
                      <Text style={s.sectionLabel}>ACTIVE ({active.length})</Text>
                      {active.map(o => (
                        <OrderCard key={o.id} order={o} myAddress={mxcAddress ?? ""} onOpen={() => setOpenOrder(o)} />
                      ))}
                    </>
                  )}

                  {history.length > 0 && (
                    <>
                      {active.length > 0 && <View style={s.divider} />}
                      <Text style={s.sectionLabel}>
                        HISTORY{orderTotal > orderItems.length ? ` (${orderItems.length} of ${orderTotal})` : ` (${history.length})`}
                      </Text>
                      {history.map(o => (
                        <OrderCard key={o.id} order={o} myAddress={mxcAddress ?? ""} onOpen={() => setOpenOrder(o)} />
                      ))}
                    </>
                  )}

                  {hasMore && (
                    orderLoadingMore ? (
                      <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
                    ) : (
                      <TouchableOpacity
                        style={s.loadMoreBtn}
                        onPress={() => { void loadOrders(orderOffset, true); }}
                        activeOpacity={0.75}
                      >
                        <Text style={s.loadMoreText}>Load More ({orderTotal - orderItems.length} remaining)</Text>
                      </TouchableOpacity>
                    )
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {openOrder && (
        <TradeRoomModal
          visible={!!openOrder}
          orderId={openOrder.id}
          onClose={() => setOpenOrder(null)}
        />
      )}
    </>
  );
}
