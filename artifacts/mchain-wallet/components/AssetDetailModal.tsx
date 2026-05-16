import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { api, type TokenTransfer, type Transaction } from "@/services/api";
import { ethAddressToMxc, shortenAddress } from "@/services/crypto";
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

// ── Normalized entry (shared between native and token transfers) ──────────────

interface NormalizedTx {
  hash: string;
  fromEth: string;
  toEth: string;
  fromMxc: string;
  toMxc: string;
  amountRaw: string;
  symbol: string;
  decimals: number;
  dateStr: string;
  blockHeight: number;
  nonce?: number;
  status: string;
}

function ethToMxcSafe(addr: string): string {
  if (!addr || addr === "0x") return "";
  try { return ethAddressToMxc(addr); } catch { return addr; }
}

function formatAmount(raw: string, decimals: number): string {
  try {
    const bn = BigInt(raw);
    if (bn === 0n) return "0";
    const divisor = BigInt(10 ** decimals);
    const whole = bn / divisor;
    const remainder = bn % divisor;
    const remStr = remainder.toString().padStart(decimals, "0").replace(/0+$/, "").slice(0, 6);
    return remStr ? `${whole}.${remStr}` : whole.toString();
  } catch {
    return "—";
  }
}

function normalizeNative(tx: Transaction): NormalizedTx {
  return {
    hash: tx.hash,
    fromEth: tx.fromEth || "",
    toEth: tx.toEth || "",
    fromMxc: tx.fromMxc || tx.fromAddress || "",
    toMxc: tx.toMxc || tx.toAddress || "",
    amountRaw: tx.amount || "0",
    symbol: "MC",
    decimals: 18,
    dateStr: tx.createdAt
      ? new Date(tx.createdAt).toLocaleDateString(undefined, {
          month: "short", day: "numeric",
          hour: "2-digit", minute: "2-digit",
        })
      : "—",
    blockHeight: tx.blockHeight,
    nonce: tx.nonce,
    status: tx.status,
  };
}

function normalizeToken(t: TokenTransfer, symbol: string, decimals: number): NormalizedTx {
  return {
    hash: t.hash,
    fromEth: t.fromEth,
    toEth: t.toEth,
    fromMxc: ethToMxcSafe(t.fromEth),
    toMxc: ethToMxcSafe(t.toEth),
    amountRaw: t.value || "0",
    symbol,
    decimals,
    dateStr: `Block #${t.blockNumber.toLocaleString()}`,
    blockHeight: t.blockNumber,
    nonce: undefined,
    status: "confirmed",
  };
}

// ── Transaction detail sheet ──────────────────────────────────────────────────

function TxDetailSheet({
  entry,
  myEthAddress,
  onClose,
}: {
  entry: NormalizedTx;
  myEthAddress: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState<string | null>(null);

  const isSend = entry.fromEth?.toLowerCase() === myEthAddress?.toLowerCase();
  const isReceive = entry.toEth?.toLowerCase() === myEthAddress?.toLowerCase();
  const isSelf = isSend && isReceive;
  const label = isSelf ? "Self Transfer" : isSend ? "Sent" : "Received";
  const color = isSelf ? colors.primary : isSend ? "#EF4444" : "#10B981";
  const amount = formatAmount(entry.amountRaw, entry.decimals);
  const prefix = isSelf ? "" : isSend ? "- " : "+ ";

  async function copy(text: string, key: string) {
    await Clipboard.setStringAsync(text);
    setCopied(key);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopied(null), 1500);
  }

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

  const statusOk = entry.status === "confirmed";

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
            <View style={s.amountBlock}>
              <Text style={s.amountLabel}>{label.toUpperCase()}</Text>
              <Text style={[s.amountValue, { color }]}>
                {prefix}{amount} <Text style={s.amountUnit}>{entry.symbol}</Text>
              </Text>
              <View style={[s.badge, { backgroundColor: statusOk ? "#10B98118" : "#EF444418" }]}>
                <Text style={[s.badgeText, { color: statusOk ? "#10B981" : "#EF4444" }]}>
                  {entry.status?.toUpperCase() ?? "UNKNOWN"}
                </Text>
              </View>
            </View>

            <View style={s.section}>
              <Text style={s.sectionLabel}>ADDRESSES</Text>
              <View style={s.card}>
                <View style={s.row}>
                  <Text style={s.rowLabel}>From</Text>
                  <View style={s.rowRight}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowValue} numberOfLines={1}>{shortenAddress(entry.fromMxc, 10)}</Text>
                      <Text style={s.rowValueMono} numberOfLines={1}>{shortenAddress(entry.fromEth, 10)}</Text>
                    </View>
                    <TouchableOpacity style={s.copyBtn} onPress={() => copy(entry.fromMxc || entry.fromEth, "from")}>
                      <Icon name={copied === "from" ? "checkmark" : "copy-outline"} size={12} color={colors.mutedForeground} />
                      <Text style={s.copyBtnText}>{copied === "from" ? "Copied" : "Copy"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={[s.row, s.rowLast]}>
                  <Text style={s.rowLabel}>To</Text>
                  <View style={s.rowRight}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowValue} numberOfLines={1}>{shortenAddress(entry.toMxc, 10)}</Text>
                      <Text style={s.rowValueMono} numberOfLines={1}>{shortenAddress(entry.toEth, 10)}</Text>
                    </View>
                    <TouchableOpacity style={s.copyBtn} onPress={() => copy(entry.toMxc || entry.toEth, "to")}>
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
                      {shortenAddress(entry.hash || "", 10)}
                    </Text>
                    <TouchableOpacity style={s.copyBtn} onPress={() => copy(entry.hash || "", "hash")}>
                      <Icon name={copied === "hash" ? "checkmark" : "copy-outline"} size={12} color={colors.mutedForeground} />
                      <Text style={s.copyBtnText}>{copied === "hash" ? "Copied" : "Copy"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={s.row}>
                  <Text style={s.rowLabel}>Block</Text>
                  <Text style={s.rowValue}>#{entry.blockHeight?.toLocaleString() ?? "—"}</Text>
                </View>
                {entry.nonce !== undefined && (
                  <View style={s.row}>
                    <Text style={s.rowLabel}>Nonce</Text>
                    <Text style={s.rowValue}>{entry.nonce}</Text>
                  </View>
                )}
                <View style={[s.row, s.rowLast]}>
                  <Text style={s.rowLabel}>Date</Text>
                  <Text style={s.rowValue}>{entry.dateStr}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={s.explorerBtn}
              onPress={() => Linking.openURL(`https://explorer.mvault.pro/tx/${entry.hash}`).catch(() => null)}
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
  entry,
  myEthAddress,
  onPress,
}: {
  entry: NormalizedTx;
  myEthAddress: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const isSend = entry.fromEth?.toLowerCase() === myEthAddress?.toLowerCase();
  const isReceive = entry.toEth?.toLowerCase() === myEthAddress?.toLowerCase();
  const isSelf = isSend && isReceive;

  const label = isSelf ? "Self" : isSend ? "Sent" : "Received";
  const color = isSelf ? colors.primary : isSend ? "#EF4444" : "#10B981";
  const iconName = isSelf
    ? "swap-horizontal-outline"
    : isSend ? "arrow-up-circle-outline" : "arrow-down-circle-outline";

  const counterparty = isSend && !isSelf
    ? (entry.toMxc || entry.toEth)
    : (entry.fromMxc || entry.fromEth);
  const counterpartyLabel = isSend && !isSelf ? "To" : "From";
  const amount = formatAmount(entry.amountRaw, entry.decimals);

  const ROW_HEIGHT = 72;
  const s = StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      height: ROW_HEIGHT,
      paddingHorizontal: 20,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
      overflow: "hidden",
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    info: { flex: 1, justifyContent: "center", gap: 2 },
    label: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground, lineHeight: 18 },
    addr: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 15 },
    right: { alignItems: "flex-end", justifyContent: "center", gap: 2, flexShrink: 0 },
    amount: { fontSize: 13, fontFamily: "Inter_700Bold", lineHeight: 17 },
    date: { fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 13 },
    statusBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
    statusText: { fontSize: 9, fontFamily: "Inter_700Bold", lineHeight: 11 },
    chevron: { opacity: 0.35, flexShrink: 0 },
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
        <Text style={[s.amount, { color }]} numberOfLines={1}>
          {isSelf ? "" : isSend ? "- " : "+ "}{amount} {entry.symbol}
        </Text>
        <Text style={s.date} numberOfLines={1}>{entry.dateStr}</Text>
        <View style={[s.statusBadge, { backgroundColor: entry.status === "confirmed" ? "#10B98118" : "#EF444418" }]}>
          <Text style={[s.statusText, { color: entry.status === "confirmed" ? "#10B981" : "#EF4444" }]}>
            {entry.status?.toUpperCase() ?? "UNKNOWN"}
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
  const [selectedEntry, setSelectedEntry] = useState<NormalizedTx | null>(null);

  const isToken = asset?.kind === "token";
  const mxcAddr = asset?.address ?? "";           // native: mxc address; token: user's eth address
  const ethAddr = asset?.address ?? "";            // token: already eth address
  const contractAddr = isToken ? (asset as Extract<AssetItem, { kind: "token" }>).token.contractAddress : "";
  const tokenSymbol = isToken ? (asset as Extract<AssetItem, { kind: "token" }>).token.symbol : "MC";
  const tokenDecimals = isToken ? (asset as Extract<AssetItem, { kind: "token" }>).token.decimals : 18;

  // Native MC transaction history
  const { data: nativeData, isLoading: nativeLoading } = useQuery({
    queryKey: ["assetTxHistory", mxcAddr],
    queryFn: () => api.getTransactions(mxcAddr, 50),
    enabled: !!mxcAddr && visible && !isToken,
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  // Token transfer history via eth_getLogs
  const { data: tokenData, isLoading: tokenLoading } = useQuery({
    queryKey: ["tokenTxHistory", contractAddr, ethAddr],
    queryFn: () => api.getTokenTransfers(contractAddr, ethAddr),
    enabled: !!contractAddr && !!ethAddr && visible && isToken,
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const isLoading = isToken ? tokenLoading : nativeLoading;

  // Normalize all entries to the same display format
  const allEntries: NormalizedTx[] = isToken
    ? (tokenData ?? []).map((t) => normalizeToken(t, tokenSymbol, tokenDecimals))
    : (nativeData?.transactions ?? []).map(normalizeNative);

  // Derive the user's ETH address used for send/receive detection
  // For native: find it from the first tx that matches our mxc address
  // For token: it's directly asset.address
  const myEthAddress = isToken
    ? ethAddr.toLowerCase()
    : allEntries.find(e => e.fromMxc === mxcAddr || e.toMxc === mxcAddr)
        ? allEntries.reduce((found, e) => {
            if (found) return found;
            if (e.fromMxc === mxcAddr) return e.fromEth.toLowerCase();
            if (e.toMxc === mxcAddr) return e.toEth.toLowerCase();
            return found;
          }, "")
        : "";

  const filtered = allEntries.filter((e) => {
    if (filter === "send") return e.fromEth.toLowerCase() === myEthAddress && e.toEth.toLowerCase() !== myEthAddress;
    if (filter === "receive") return e.toEth.toLowerCase() === myEthAddress && e.fromEth.toLowerCase() !== myEthAddress;
    return true;
  });

  const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      borderTopWidth: 1, borderColor: colors.border,
      height: "80%",
      paddingBottom: insets.bottom,
      flexDirection: "column",
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
  });

  if (!asset) return null;

  const displayName = isToken ? tokenSymbol : "MChain";
  const displayBalance = `${asset.balance} ${isToken ? tokenSymbol : "MC"}`;
  const logoUrl = isToken ? (asset as Extract<AssetItem, { kind: "token" }>).token.logoUrl : null;

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

            <View style={{ flex: 1 }}>
              {isLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
              ) : filtered.length === 0 ? (
                <View style={s.empty}>
                  <Icon name="swap-horizontal-outline" size={40} color={colors.border} />
                  <Text style={s.emptyText}>No transactions</Text>
                  <Text style={s.emptyDesc}>
                    {filter === "all"
                      ? `No ${isToken ? tokenSymbol + " transfer" : ""} history found for this wallet.`
                      : `No ${filter === "send" ? "sent" : "received"} transactions found.`}
                  </Text>
                </View>
              ) : (
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                  {filtered.map((entry, i) => (
                    <TxRow
                      key={`${entry.hash}-${i}`}
                      entry={entry}
                      myEthAddress={myEthAddress}
                      onPress={() => setSelectedEntry(entry)}
                    />
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {selectedEntry && (
        <TxDetailSheet
          entry={selectedEntry}
          myEthAddress={myEthAddress}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </>
  );
}
