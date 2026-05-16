import { Icon } from "@/components/Icon";
import { useWallet } from "@/context/WalletContext";
import { useColors } from "@/hooks/useColors";
import { p2pApi, type P2pOrder } from "@/services/p2pApi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  ActivityIndicator, Modal, Pressable, ScrollView,
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

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["p2p_my_orders", mxcAddress],
    queryFn: () => p2pApi.getMyOrders(mxcAddress!),
    enabled: !!mxcAddress && visible,
    refetchInterval: 10_000,
  });

  const active = orders.filter(o => !["released", "cancelled", "resolved"].includes(o.status));
  const history = orders.filter(o => ["released", "cancelled", "resolved"].includes(o.status));

  const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
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
  });

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
        <Pressable style={s.overlay} onPress={onClose}>
          <Pressable onPress={() => {}}>
            <View style={s.sheet}>
              <View style={s.handle} />
              <View style={s.header}>
                <Text style={s.title}>My Orders</Text>
                <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                  <Icon name="close" size={16} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={s.scroll}>
                {isLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
                ) : orders.length === 0 ? (
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
                        <Text style={s.sectionLabel}>HISTORY</Text>
                        {history.map(o => (
                          <OrderCard key={o.id} order={o} myAddress={mxcAddress ?? ""} onOpen={() => setOpenOrder(o)} />
                        ))}
                      </>
                    )}
                  </>
                )}
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
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
