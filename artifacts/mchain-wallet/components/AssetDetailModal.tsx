import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { api, type Transaction } from "@/services/api";
import { shortenAddress, weiToMc } from "@/services/crypto";
import type { CustomToken } from "@/services/tokens";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
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

// ── Transaction detail sheet ──────────────────────────────────────────────────

function TxDetailSheet({
  tx,
  myEthAddress,
  onClose,
}: {
  tx: Transaction;
  myEthAddress: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState<string | null>(null);

  const isSend = tx.fromEth?.toLowerCase() === myEthAddress?.toLowerCase();
  const isReceive = tx.toEth?.toLowerCase() === myEthAddress?.toLowerCase();
  const isSelf = isSend && isReceive;
  const label = isSelf ? "Self Transfer" : isSend ? "Sent" : "Received";
  const color = isSelf ? colors.primary : isSend ? "#EF4444" : "#10B981";
  const amount = tx.amount ? weiToMc(tx.amount) : "—";
  const prefix = isSelf ? "" : isSend ? "- " : "+ ";

  const fromMxc = tx.fromMxc || tx.fromAddress || "";
  const destMxc = tx.toMxc || tx.toAddress || "";
  const fromEthAddr = tx.fromEth || "";
  const toEthAddr = tx.toEth || "";

  async function copy(text: string, key: string) {
    await Clipboard.setStringAsync(text);
    setCopied(key);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopied(null), 1500);
  }

  const date = tx.createdAt
    ? new Date(tx.createdAt).toLocaleString(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      })
    : "—";

  const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      borderTopWidth: 1, borderColor: colors.border,
      maxHeight: "92%", paddingBottom: insets.bottom + 8,
    },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginTop: 12, marginBottom: 4 },
    sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    sheetTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.foreground },
    closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },

    amountBlock: { alignItems: "center", paddingVertical: 24, borderBottomWidth: 1, borderBottomColor: colors.border },
    amountLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.5, marginBottom: 8 },
    amountValue: { fontSize: 34, fontFamily: "Inter_700Bold" },
    amountUnit: { fontSize: 18, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    badge: { marginTop: 8, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
    badgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

    section: { paddingHorizontal: 20, paddingVertical: 4 },
    sectionLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 1.5, marginTop: 16, marginBottom: 6 },
    card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    row: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    rowLast: { borderBottomWidth: 0 },
    rowLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, marginBottom: 3 },
    rowValue: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 18 },
    rowValueMono: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 16, marginTop: 2 },
    rowRight: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    copyBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.secondary },
    copyBtnText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    explorerBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: 20, marginTop: 16, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.primary + "15", borderWidth: 1, borderColor: colors.primary + "40", justifyContent: "center" },
    explorerBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primary },
  });

  const statusOk = tx.status === "confirmed";

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Transaction Details</Text>
            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
              <Icon name="close" size={13} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Amount block */}
            <View style={s.amountBlock}>
              <Text style={s.amountLabel}>{label.toUpperCase()}</Text>
              <Text style={[s.amountValue, { color }]}>
                {prefix}{amount} <Text style={s.amountUnit}>MC</Text>
              </Text>
              <View style={[s.badge, { backgroundColor: statusOk ? "#10B98118" : "#EF444418" }]}>
                <Text style={[s.badgeText, { color: statusOk ? "#10B981" : "#EF4444" }]}>
                  {tx.status?.toUpperCase() ?? "UNKNOWN"}
                </Text>
              </View>
            </View>

            <View style={s.section}>
              <Text style={s.sectionLabel}>ADDRESSES</Text>
              <View style={s.card}>
                {/* From */}
                <View style={s.row}>
                  <Text style={s.rowLabel}>From</Text>
                  <View style={s.rowRight}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowValue} numberOfLines={1}>{shortenAddress(fromMxc, 10)}</Text>
                      <Text style={s.rowValueMono} numberOfLines={1}>{shortenAddress(fromEthAddr, 10)}</Text>
                    </View>
                    <TouchableOpacity style={s.copyBtn} onPress={() => copy(fromMxc, "from")}>
                      <Icon name={copied === "from" ? "checkmark" : "copy-outline"} size={12} color={colors.mutedForeground} />
                      <Text style={s.copyBtnText}>{copied === "from" ? "Copied" : "Copy"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {/* To */}
                <View style={[s.row, s.rowLast]}>
                  <Text style={s.rowLabel}>To</Text>
                  <View style={s.rowRight}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowValue} numberOfLines={1}>{shortenAddress(destMxc, 10)}</Text>
                      <Text style={s.rowValueMono} numberOfLines={1}>{shortenAddress(toEthAddr, 10)}</Text>
                    </View>
                    <TouchableOpacity style={s.copyBtn} onPress={() => copy(destMxc, "to")}>
                      <Icon name={copied === "to" ? "checkmark" : "copy-outline"} size={12} color={colors.mutedForeground} />
                      <Text style={s.copyBtnText}>{copied === "to" ? "Copied" : "Copy"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <Text style={s.sectionLabel}>TRANSACTION</Text>
              <View style={s.card}>
                <View style={s.row}>
                  <Text style={s.rowLabel}>Hash</Text>
                  <View style={s.rowRight}>
                    <Text style={[s.rowValue, { flex: 1, color: colors.primary }]} numberOfLines={1}>
                      {shortenAddress(tx.hash || "", 10)}
                    </Text>
                    <TouchableOpacity style={s.copyBtn} onPress={() => copy(tx.hash || "", "hash")}>
                      <Icon name={copied === "hash" ? "checkmark" : "copy-outline"} size={12} color={colors.mutedForeground} />
                      <Text style={s.copyBtnText}>{copied === "hash" ? "Copied" : "Copy"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={s.row}>
                  <Text style={s.rowLabel}>Block</Text>
                  <Text style={s.rowValue}>#{tx.blockHeight?.toLocaleString() ?? "—"}</Text>
                </View>
                <View style={s.row}>
                  <Text style={s.rowLabel}>Nonce</Text>
                  <Text style={s.rowValue}>{tx.nonce ?? "—"}</Text>
                </View>
                <View style={[s.row, s.rowLast]}>
                  <Text style={s.rowLabel}>Date</Text>
                  <Text style={s.rowValue}>{date}</Text>
                </View>
              </View>
            </View>

            {/* Explorer link */}
            <TouchableOpacity
              style={s.explorerBtn}
              onPress={() => Linking.openURL(`https://explorer.mvault.pro/tx/${tx.hash}`).catch(() => null)}
              activeOpacity={0.8}
            >
              <Icon name="open-outline" size={15} color={colors.primary} />
              <Text style={s.explorerBtnText}>View on Explorer</Text>
            </TouchableOpacity>

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Transaction row ───────────────────────────────────────────────────────────

function TxRow({
  tx,
  myEthAddress,
  onPress,
}: {
  tx: Transaction;
  myEthAddress: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const isSend = tx.fromEth?.toLowerCase() === myEthAddress?.toLowerCase();
  const isReceive = tx.toEth?.toLowerCase() === myEthAddress?.toLowerCase();
  const isSelf = isSend && isReceive;
  const amount = tx.amount ? weiToMc(tx.amount) : "—";
  const date = tx.createdAt
    ? new Date(tx.createdAt).toLocaleDateString(undefined, {
        month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

  const label = isSelf ? "Self" : isSend ? "Sent" : "Received";
  const color = isSelf ? colors.primary : isSend ? "#EF4444" : "#10B981";
  const iconName = isSelf
    ? "swap-horizontal-outline"
    : isSend ? "arrow-up-circle-outline" : "arrow-down-circle-outline";

  // Counterparty address shown in mxc format
  const counterparty = isSend && !isSelf
    ? (tx.toMxc || tx.toAddress || "")
    : (tx.fromMxc || tx.fromAddress || "");
  const counterpartyLabel = isSend && !isSelf ? "To" : "From";

  const s = StyleSheet.create({
    row: {
      flexDirection: "row", alignItems: "center",
      paddingHorizontal: 20, paddingVertical: 14, gap: 12,
      borderBottomWidth: 1, borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    iconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
    info: { flex: 1, gap: 2 },
    label: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    addr: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    right: { alignItems: "flex-end", gap: 3 },
    amount: { fontSize: 14, fontFamily: "Inter_700Bold" },
    date: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    statusBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
    statusText: { fontSize: 9, fontFamily: "Inter_700Bold" },
    chevron: { opacity: 0.4 },
  });

  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.75}>
      <View style={[s.iconWrap, { backgroundColor: color + "18" }]}>
        <Icon name={iconName} size={20} color={color} />
      </View>
      <View style={s.info}>
        <Text style={s.label}>{label}</Text>
        <Text style={s.addr} numberOfLines={1}>
          {counterpartyLabel}: {shortenAddress(counterparty, 8)}
        </Text>
      </View>
      <View style={s.right}>
        <Text style={[s.amount, { color }]}>
          {isSelf ? "" : isSend ? "- " : "+ "}{amount} MC
        </Text>
        <Text style={s.date}>{date}</Text>
        <View style={[s.statusBadge, { backgroundColor: tx.status === "confirmed" ? "#10B98118" : "#EF444418" }]}>
          <Text style={[s.statusText, { color: tx.status === "confirmed" ? "#10B981" : "#EF4444" }]}>
            {tx.status?.toUpperCase() ?? "UNKNOWN"}
          </Text>
        </View>
      </View>
      <Icon name="chevron-forward" size={14} color={colors.border} style={s.chevron} />
    </TouchableOpacity>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

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
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const rawAddress = asset?.address ?? "";
  // For the API call we need mxc format; for comparisons we use fromEth/toEth from the response directly
  const mxcAddr = rawAddress.startsWith("mxc1") ? rawAddress : rawAddress;
  // ethAddr is only used for the token explorer link and passing to child components
  const ethAddr = rawAddress.startsWith("0x") || rawAddress.startsWith("0X")
    ? rawAddress.toLowerCase()
    : rawAddress;

  const { data, isLoading } = useQuery({
    queryKey: ["assetTxHistory", mxcAddr],
    queryFn: () => api.getTransactions(mxcAddr, 50),
    enabled: !!mxcAddr && visible && asset?.kind === "native",
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const txs = data?.transactions ?? [];

  // Use fromEth/toEth directly from the API response — no conversion needed
  const myEthFromTx = txs.find(tx => tx.fromEth || tx.toEth)
    ? txs.reduce((found, tx) => {
        if (found) return found;
        // The mxcAddr is our address; find our eth address from any matching tx
        if (tx.fromMxc === mxcAddr || tx.fromAddress === mxcAddr) return tx.fromEth;
        if (tx.toMxc === mxcAddr || tx.toAddress === mxcAddr) return tx.toEth;
        return found;
      }, "" as string)
    : "";

  const filtered = txs.filter((tx) => {
    const from = tx.fromMxc || tx.fromAddress || "";
    const to = tx.toMxc || tx.toAddress || "";
    if (filter === "send") return from === mxcAddr && to !== mxcAddr;
    if (filter === "receive") return to === mxcAddr && from !== mxcAddr;
    return true;
  });

  const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      borderTopWidth: 1, borderColor: colors.border,
      maxHeight: "92%", paddingBottom: insets.bottom,
    },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginTop: 12, marginBottom: 4 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary + "20", borderWidth: 1, borderColor: colors.primary + "40", alignItems: "center", justifyContent: "center" },
    iconText: { fontSize: 12, fontFamily: "Inter_700Bold", color: colors.primary },
    tokenImg: { width: 44, height: 44, borderRadius: 22 },
    name: { fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground },
    balance: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    tabs: { flexDirection: "row", paddingHorizontal: 20, paddingVertical: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    tabActive: { backgroundColor: colors.primary + "18", borderColor: colors.primary + "50" },
    tabText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    tabTextActive: { color: colors.primary },
    empty: { alignItems: "center", paddingVertical: 60, gap: 10 },
    emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    emptyDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", paddingHorizontal: 32 },
    tokenNotice: { margin: 20, padding: 16, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: 8 },
    tokenNoticeText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" },
  });

  if (!asset) return null;

  const displayName = asset.kind === "native" ? "MChain" : asset.token.symbol;
  const displayBalance = `${asset.balance} ${asset.kind === "native" ? "MC" : asset.token.symbol}`;
  const logoUrl = asset.kind === "token" ? asset.token.logoUrl : null;

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
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
                  onPress={() => Linking.openURL(`https://explorer.mvault.pro/address/${ethAddr}`).catch(() => null)}
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
                  <TxRow
                    key={tx.hash}
                    tx={tx}
                    myEthAddress={myEthFromTx}
                    onPress={() => setSelectedTx(tx)}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {selectedTx && (
        <TxDetailSheet
          tx={selectedTx}
          myEthAddress={myEthFromTx}
          onClose={() => setSelectedTx(null)}
        />
      )}
    </>
  );
}
