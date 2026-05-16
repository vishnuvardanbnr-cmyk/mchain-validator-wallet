import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { api, type Transaction } from "@/services/api";
import { shortenAddress, weiToMc } from "@/services/crypto";
import type { CustomToken } from "@/services/tokens";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type AssetItem =
  | { kind: "native"; balance: string; address: string }
  | { kind: "token"; token: CustomToken; balance: string; address: string };

type TxFilter = "all" | "send" | "receive";

function TxRow({
  tx,
  myAddress,
}: {
  tx: Transaction;
  myAddress: string;
}) {
  const colors = useColors();
  const isSend = tx.from?.toLowerCase() === myAddress?.toLowerCase();
  const isReceive = tx.to?.toLowerCase() === myAddress?.toLowerCase();
  const amount = tx.amount ? weiToMc(tx.amount) : "—";
  const date = tx.timestamp
    ? new Date(tx.timestamp).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const label = isSend && isReceive ? "Self" : isSend ? "Sent" : "Received";
  const color =
    isSend && !isReceive ? "#EF4444" : isReceive && !isSend ? "#10B981" : colors.primary;
  const iconName = isSend && !isReceive ? "arrow-up-circle-outline" : isReceive && !isSend ? "arrow-down-circle-outline" : "swap-horizontal-outline";

  const s = StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 14,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    iconWrap: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
    },
    info: { flex: 1, gap: 2 },
    label: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    addr: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    right: { alignItems: "flex-end", gap: 3 },
    amount: { fontSize: 14, fontFamily: "Inter_700Bold" },
    date: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    hashBtn: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 1 },
    hashText: { fontSize: 10, fontFamily: "Inter_400Regular", color: colors.primary },
  });

  return (
    <View style={s.row}>
      <View style={[s.iconWrap, { backgroundColor: color + "18" }]}>
        <Icon name={iconName} size={20} color={color} />
      </View>
      <View style={s.info}>
        <Text style={s.label}>{label}</Text>
        <Text style={s.addr} numberOfLines={1}>
          {isSend && !isReceive
            ? `To: ${shortenAddress(tx.to || "", 6)}`
            : `From: ${shortenAddress(tx.from || "", 6)}`}
        </Text>
        <TouchableOpacity
          style={s.hashBtn}
          onPress={() => {
            if (tx.hash) Linking.openURL(`https://explorer.mvault.pro/tx/${tx.hash}`).catch(() => null);
          }}
        >
          <Icon name="open-outline" size={10} color={colors.primary} />
          <Text style={s.hashText}>{shortenAddress(tx.hash || "", 6)}</Text>
        </TouchableOpacity>
      </View>
      <View style={s.right}>
        <Text style={[s.amount, { color }]}>
          {isSend && !isReceive ? "-" : "+"}{amount} MC
        </Text>
        <Text style={s.date}>{date}</Text>
        <View style={{
          backgroundColor: tx.status === "success" ? "#10B98118" : "#EF444418",
          borderRadius: 4,
          paddingHorizontal: 5,
          paddingVertical: 1,
        }}>
          <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: tx.status === "success" ? "#10B981" : "#EF4444" }}>
            {tx.status?.toUpperCase() ?? "UNKNOWN"}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function AssetDetailModal({
  asset,
  visible,
  onClose,
}: {
  asset: AssetItem | null;
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<TxFilter>("all");

  const address = asset?.address ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["assetTxHistory", address],
    queryFn: () => api.getTransactions(address!, 50),
    enabled: !!address && visible && asset?.kind === "native",
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const txs = data?.transactions ?? [];

  const filtered = txs.filter((tx) => {
    if (filter === "send") return tx.from?.toLowerCase() === address?.toLowerCase() && tx.to?.toLowerCase() !== address?.toLowerCase();
    if (filter === "receive") return tx.to?.toLowerCase() === address?.toLowerCase() && tx.from?.toLowerCase() !== address?.toLowerCase();
    return true;
  });

  const s = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1,
      borderColor: colors.border,
      maxHeight: "92%",
      paddingBottom: insets.bottom,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginTop: 12,
      marginBottom: 4,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary + "20",
      borderWidth: 1,
      borderColor: colors.primary + "40",
      alignItems: "center",
      justifyContent: "center",
    },
    iconText: { fontSize: 12, fontFamily: "Inter_700Bold", color: colors.primary },
    tokenImg: { width: 44, height: 44, borderRadius: 22 },
    name: { fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground },
    balance: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    tabs: {
      flexDirection: "row",
      paddingHorizontal: 20,
      paddingVertical: 12,
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: "center",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabActive: {
      backgroundColor: colors.primary + "18",
      borderColor: colors.primary + "50",
    },
    tabText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    tabTextActive: { color: colors.primary },
    empty: { alignItems: "center", paddingVertical: 60, gap: 10 },
    emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    emptyDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", paddingHorizontal: 32 },
    tokenNotice: {
      margin: 20,
      padding: 16,
      borderRadius: 12,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      gap: 8,
    },
    tokenNoticeText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" },
  });

  if (!asset) return null;

  const displayName = asset.kind === "native" ? "MChain" : asset.token.symbol;
  const displayBalance = `${asset.balance} ${asset.kind === "native" ? "MC" : asset.token.symbol}`;
  const logoUrl = asset.kind === "token" ? asset.token.logoUrl : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={s.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.header}>
            <View style={s.headerLeft}>
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={s.tokenImg} />
              ) : (
                <View style={s.iconWrap}>
                  <Text style={s.iconText}>{displayName.slice(0, 2).toUpperCase()}</Text>
                </View>
              )}
              <View>
                <Text style={s.name}>{displayName}</Text>
                <Text style={s.balance}>{displayBalance}</Text>
              </View>
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
              <Icon name="close" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Filter tabs */}
          <View style={s.tabs}>
            {(["all", "send", "receive"] as TxFilter[]).map((f) => (
              <TouchableOpacity
                key={f}
                style={[s.tab, filter === f && s.tabActive]}
                onPress={() => setFilter(f)}
                activeOpacity={0.75}
              >
                <Text style={[s.tabText, filter === f && s.tabTextActive]}>
                  {f === "all" ? "All" : f === "send" ? "Sent" : "Received"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {asset.kind === "token" ? (
            <View style={s.tokenNotice}>
              <Icon name="information-circle-outline" size={28} color={colors.mutedForeground} />
              <Text style={s.tokenNoticeText}>
                On-chain ERC-20 transfer history is not yet indexed.{"\n"}
                Use a block explorer to view token transfer history.
              </Text>
              <TouchableOpacity
                onPress={() => Linking.openURL(`https://explorer.mvault.pro/address/${address}`).catch(() => null)}
                style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 }}
              >
                <Icon name="open-outline" size={13} color={colors.primary} />
                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primary }}>
                  View on Explorer
                </Text>
              </TouchableOpacity>
            </View>
          ) : isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : filtered.length === 0 ? (
            <View style={s.empty}>
              <Icon name="swap-horizontal-outline" size={40} color={colors.border} />
              <Text style={s.emptyText}>No transactions</Text>
              <Text style={s.emptyDesc}>
                {filter === "all"
                  ? "This wallet has no recorded transactions yet."
                  : `No ${filter} transactions found.`}
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {filtered.map((tx) => (
                <TxRow key={tx.hash} tx={tx} myAddress={address ?? ""} />
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
