import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import {
  CardAccount,
  KripicardDetails,
  KripicardTransaction,
  freezeKripicardCard,
  fundKripicardCard,
  getKripicardDetails,
  getKripicardTransactions,
  issueKripicardCard,
} from "@/services/api";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ── BIN options ───────────────────────────────────────────────────────────────
const BINS = [
  { bin: "539502", label: "Global Standard", flag: "🌍", needsDob: false },
  { bin: "525847", label: "Global Premium", flag: "🌐", needsDob: false },
  { bin: "537872", label: "United States", flag: "🇺🇸", needsDob: true },
  { bin: "533171", label: "Singapore", flag: "🇸🇬", needsDob: true },
  { bin: "246001", label: "United Kingdom", flag: "🇬🇧", needsDob: true },
];

function binLabel(bin: string | null): string {
  return BINS.find((b) => b.bin === bin)?.label ?? bin ?? "";
}

// ── Masked card number display ────────────────────────────────────────────────
function formatCardNumber(num: string | null | undefined, last4: string | null): string {
  if (num && num.length >= 12) {
    return num.replace(/(\d{4})/g, "$1 ").trim();
  }
  if (last4) return `•••• •••• •••• ${last4}`;
  return "•••• •••• •••• ••••";
}

// ── Transaction row ───────────────────────────────────────────────────────────
function TxnRow({ txn, colors }: { txn: KripicardTransaction; colors: ReturnType<typeof useColors> }) {
  const date = new Date(txn.date);
  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12,
      paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View style={{ width: 38, height: 38, borderRadius: 19,
        backgroundColor: txn.success ? "#7C3AED18" : "#EF444418",
        alignItems: "center", justifyContent: "center" }}>
        <Icon name={txn.type === "purchase" ? "cart-outline" : "swap-horizontal-outline"}
          size={17} color={txn.success ? "#7C3AED" : "#EF4444"} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>
          {txn.merchant || txn.type}
        </Text>
        <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular",
          color: colors.mutedForeground, marginTop: 2 }}>
          {dateStr} · {timeStr}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold",
          color: txn.success ? "#EF4444" : colors.mutedForeground }}>
          -{txn.amount.toFixed(2)} USDT
        </Text>
        {!txn.success && (
          <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: "#EF4444", marginTop: 2 }}>
            FAILED
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  ethAddress: string;
  account: CardAccount;
  onAccountUpdated: () => void;
  showMsg: (type: "success" | "error" | "info", text: string) => void;
}

export default function KripicardModule({ ethAddress, account, onAccountUpdated, showMsg }: Props) {
  const colors = useColors();

  const hasCard = !!account.kripicard_card_id;
  const kcStatus = account.kripicard_status ?? "none";

  // ── Issue form state ───────────────────────────────────────────────────────
  const [issueAmt, setIssueAmt] = useState("20");
  const [issueName, setIssueName] = useState("");
  const [issueEmail, setIssueEmail] = useState("");
  const [issueBin, setIssueBin] = useState("539502");
  const [issueDob, setIssueDob] = useState("");
  const [issuing, setIssuing] = useState(false);

  const selectedBinObj = BINS.find((b) => b.bin === issueBin) ?? BINS[0]!;

  // ── Card management state ─────────────────────────────────────────────────
  const [details, setDetails] = useState<KripicardDetails | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [txns, setTxns] = useState<KripicardTransaction[]>([]);
  const [txnBalance, setTxnBalance] = useState<number | null>(null);
  const [showTxns, setShowTxns] = useState(false);
  const [loadingTxns, setLoadingTxns] = useState(false);

  const [freezing, setFreezing] = useState(false);

  const [showFund, setShowFund] = useState(false);
  const [fundAmt, setFundAmt] = useState("20");
  const [funding, setFunding] = useState(false);

  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyField = async (val: string, field: string) => {
    await Clipboard.setStringAsync(val);
    setCopiedField(field);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleIssue = async () => {
    const amt = parseFloat(issueAmt);
    if (!issueName.trim() || issueName.trim().length < 2) {
      showMsg("error", "Please enter your name on card (at least 2 characters).");
      return;
    }
    if (isNaN(amt) || amt < 10) {
      showMsg("error", "Minimum initial load is $10.");
      return;
    }
    if (selectedBinObj.needsDob && !issueDob.trim()) {
      showMsg("error", "Date of birth is required for this card type (YYYY-MM-DD).");
      return;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIssuing(true);
    try {
      const result = await issueKripicardCard(ethAddress, {
        amount: amt, bin: issueBin, nameOnCard: issueName.trim(),
        email: issueEmail.trim() || undefined,
        dateOfBirth: selectedBinObj.needsDob ? issueDob.trim() : undefined,
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showMsg("success", `Card issued! Last 4: ${result.last4}. Fee: $${result.fee.toFixed(2)}`);
      onAccountUpdated();
    } catch (err) {
      showMsg("error", err instanceof Error ? err.message : "Failed to issue card");
    } finally {
      setIssuing(false);
    }
  };

  const handleToggleDetails = async () => {
    if (showDetails) { setShowDetails(false); return; }
    if (details) { setShowDetails(true); return; }
    setLoadingDetails(true);
    try {
      const d = await getKripicardDetails(ethAddress);
      setDetails(d);
      setShowDetails(true);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      showMsg("error", err instanceof Error ? err.message : "Failed to load card details");
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleToggleTxns = async () => {
    if (showTxns) { setShowTxns(false); return; }
    setLoadingTxns(true);
    try {
      const data = await getKripicardTransactions(ethAddress);
      setTxns(data.transactions);
      setTxnBalance(data.balance);
      setShowTxns(true);
    } catch (err) {
      showMsg("error", err instanceof Error ? err.message : "Failed to load transactions");
    } finally {
      setLoadingTxns(false);
    }
  };

  const handleFreeze = async () => {
    if (freezing) return;
    const action = kcStatus === "frozen" ? "unfreeze" : "freeze";
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setFreezing(true);
    try {
      await freezeKripicardCard(ethAddress, action);
      showMsg("info", action === "freeze" ? "KripiCard frozen." : "KripiCard unfrozen.");
      onAccountUpdated();
    } catch (err) {
      showMsg("error", err instanceof Error ? err.message : "Failed to freeze/unfreeze");
    } finally {
      setFreezing(false);
    }
  };

  const handleFund = async () => {
    const amt = parseFloat(fundAmt);
    if (isNaN(amt) || amt < 10) {
      showMsg("error", "Minimum top-up is $10.");
      return;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFunding(true);
    try {
      const result = await fundKripicardCard(ethAddress, amt);
      setShowFund(false);
      showMsg("success", `+$${result.amount.toFixed(2)} added. Fee: $${result.fee.toFixed(2)}`);
      setDetails(null);
    } catch (err) {
      showMsg("error", err instanceof Error ? err.message : "Failed to fund card");
    } finally {
      setFunding(false);
    }
  };

  const s = StyleSheet.create({
    sectionLabel: {
      fontSize: 11, fontFamily: "Inter_700Bold",
      color: colors.mutedForeground, letterSpacing: 1.5, marginBottom: 16,
    },
    card: {
      borderRadius: 18, overflow: "hidden",
      aspectRatio: 1.586,
      shadowColor: "#7C3AED", shadowOpacity: 0.25,
      shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
      elevation: 12, marginBottom: 16,
    },
    cardGrad: { flex: 1, padding: 22 },
    row: { flexDirection: "row", gap: 10, marginBottom: 16 },
    btn: {
      flex: 1, borderRadius: 14, borderWidth: 1,
      borderColor: colors.border, backgroundColor: colors.card,
      paddingVertical: 14, alignItems: "center", gap: 5,
    },
    btnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    panel: {
      backgroundColor: colors.card, borderRadius: 18,
      borderWidth: 1, borderColor: colors.border, padding: 20,
    },
    label: {
      fontSize: 11, fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground, letterSpacing: 1, marginBottom: 8,
    },
    input: {
      backgroundColor: colors.background, borderRadius: 12,
      borderWidth: 1, borderColor: colors.border,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 15, fontFamily: "Inter_400Regular",
      color: colors.foreground, marginBottom: 14,
    },
    detailRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border + "60",
    },
    detailLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 0.8 },
    detailVal: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: 1.5 },
  });

  const isFrozen = kcStatus === "frozen";

  // ── No card issued — show issue form ──────────────────────────────────────
  if (!hasCard) {
    return (
      <View style={{ marginTop: 28 }}>
        <Text style={s.sectionLabel}>USDT SPENDING CARD</Text>

        {/* Preview card */}
        <View style={[s.card, { opacity: 0.7 }]}>
          <LinearGradient
            colors={["#1e0b3a", "#4C1D95", "#7C3AED"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.cardGrad}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View>
                <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#FFF", letterSpacing: 1.5 }}>MChain</Text>
                <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", letterSpacing: 2, marginTop: 2 }}>DIRECT USDT CARD</Text>
              </View>
              <View style={{ backgroundColor: "#ffffff18", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.7)", letterSpacing: 1 }}>KRIPICARD</Text>
              </View>
            </View>
            <View style={{ flex: 1, justifyContent: "center" }}>
              <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: "#FFF", letterSpacing: 3 }}>•••• •••• •••• ••••</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
              <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.45)", letterSpacing: 1 }}>DIRECT SPENDING · USDT</Text>
              <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.45)", letterSpacing: 1 }}>MASTERCARD</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Issue form */}
        <View style={s.panel}>
          <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 4 }}>
            Issue Your USDT Card
          </Text>
          <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 20, marginBottom: 20 }}>
            Spend USDT directly at any Mastercard merchant — no fiat conversion.
          </Text>

          <Text style={s.label}>CARD TYPE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {BINS.map((b) => (
                <TouchableOpacity
                  key={b.bin}
                  onPress={() => setIssueBin(b.bin)}
                  activeOpacity={0.75}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 10,
                    borderRadius: 12, borderWidth: 1.5,
                    borderColor: issueBin === b.bin ? "#7C3AED" : colors.border,
                    backgroundColor: issueBin === b.bin ? "#7C3AED18" : colors.background,
                    alignItems: "center", gap: 4, minWidth: 90,
                  }}
                >
                  <Text style={{ fontSize: 18 }}>{b.flag}</Text>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold",
                    color: issueBin === b.bin ? "#7C3AED" : colors.mutedForeground,
                    textAlign: "center" }}>
                    {b.label}
                  </Text>
                  {b.needsDob && (
                    <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular", color: "#F59E0B" }}>+DOB req.</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={s.label}>NAME ON CARD</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. John Smith"
            placeholderTextColor={colors.mutedForeground}
            value={issueName}
            onChangeText={setIssueName}
            autoCapitalize="words"
          />

          <Text style={s.label}>INITIAL LOAD (USD, min $10)</Text>
          <TextInput
            style={s.input}
            placeholder="20"
            placeholderTextColor={colors.mutedForeground}
            value={issueAmt}
            onChangeText={setIssueAmt}
            keyboardType="decimal-pad"
          />

          <Text style={s.label}>EMAIL (optional)</Text>
          <TextInput
            style={s.input}
            placeholder="your@email.com"
            placeholderTextColor={colors.mutedForeground}
            value={issueEmail}
            onChangeText={setIssueEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          {selectedBinObj.needsDob && (
            <>
              <Text style={s.label}>DATE OF BIRTH (YYYY-MM-DD)</Text>
              <TextInput
                style={s.input}
                placeholder="1990-01-15"
                placeholderTextColor={colors.mutedForeground}
                value={issueDob}
                onChangeText={setIssueDob}
              />
            </>
          )}

          <TouchableOpacity
            style={{ borderRadius: 14, overflow: "hidden", opacity: issuing ? 0.7 : 1 }}
            activeOpacity={0.85}
            onPress={handleIssue}
            disabled={issuing}
          >
            <LinearGradient
              colors={["#7C3AED", "#6D28D9"]}
              style={{ paddingVertical: 16, alignItems: "center",
                flexDirection: "row", justifyContent: "center", gap: 8 }}
            >
              {issuing
                ? <ActivityIndicator color="#FFF" size="small" />
                : <Icon name="card-outline" size={20} color="#FFF" />
              }
              <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFF" }}>
                {issuing ? "Issuing Card…" : "Issue Card"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular",
            color: colors.mutedForeground, textAlign: "center", marginTop: 12, lineHeight: 17 }}>
            A service fee is charged by KripiCard. Funds are loaded instantly.
          </Text>
        </View>
      </View>
    );
  }

  // ── Card issued — management UI ───────────────────────────────────────────
  const displayNum = showDetails ? details?.cardNumber : null;
  const displayLast4 = account.kripicard_last4;

  return (
    <View style={{ marginTop: 28 }}>
      <Text style={s.sectionLabel}>USDT SPENDING CARD</Text>

      {/* Card visual */}
      <View style={[s.card, isFrozen && { opacity: 0.65 }]}>
        <LinearGradient
          colors={isFrozen ? ["#1a1a2e", "#16213e", "#0f3460"] : ["#1e0b3a", "#4C1D95", "#7C3AED"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.cardGrad}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View>
              <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#FFF", letterSpacing: 1.5 }}>MChain</Text>
              <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", letterSpacing: 2, marginTop: 2 }}>DIRECT USDT CARD</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              {isFrozen && (
                <View style={{ backgroundColor: "#EF444430", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "#EF444450" }}>
                  <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#EF4444", letterSpacing: 1 }}>FROZEN</Text>
                </View>
              )}
              <View style={{ backgroundColor: "#ffffff18", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.7)", letterSpacing: 1 }}>KRIPICARD</Text>
              </View>
            </View>
          </View>

          <View style={{ flex: 1, justifyContent: "center", gap: 4 }}>
            {showDetails && details && (
              <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.4)", letterSpacing: 1 }}>
                Balance: ${details.balance.toFixed(2)} USDT
              </Text>
            )}
            <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: "#FFF", letterSpacing: 3 }}>
              {formatCardNumber(displayNum, displayLast4)}
            </Text>
            {showDetails && details && (
              <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.6)", letterSpacing: 1 }}>
                VALID THRU {details.expiry}  CVV {details.cvv}
              </Text>
            )}
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.45)", letterSpacing: 1 }}>
              {binLabel(account.kripicard_bin)} · USDT
            </Text>
            <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.45)", letterSpacing: 1 }}>MASTERCARD</Text>
          </View>
        </LinearGradient>
      </View>

      {/* Action buttons */}
      <View style={s.row}>
        <TouchableOpacity
          style={[s.btn, showDetails && { borderColor: "#7C3AED60", backgroundColor: "#7C3AED10" }]}
          activeOpacity={0.7}
          onPress={handleToggleDetails}
          disabled={loadingDetails}
        >
          {loadingDetails
            ? <ActivityIndicator size="small" color="#7C3AED" />
            : <Icon name={showDetails ? "eye-off-outline" : "eye-outline"} size={20}
                color={showDetails ? "#7C3AED" : colors.foreground} />
          }
          <Text style={[s.btnText, showDetails && { color: "#7C3AED" }]}>
            {showDetails ? "Hide" : "Details"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.btn, showFund && { borderColor: "#22C55E60", backgroundColor: "#22C55E10" }]}
          activeOpacity={0.7}
          onPress={() => setShowFund((v) => !v)}
        >
          <Icon name="add-circle-outline" size={20}
            color={showFund ? "#22C55E" : colors.foreground} />
          <Text style={[s.btnText, showFund && { color: "#22C55E" }]}>Top Up</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.btn, isFrozen && { borderColor: "#EF444440", backgroundColor: "#EF444408" }]}
          activeOpacity={0.7}
          onPress={handleFreeze}
          disabled={freezing}
        >
          {freezing
            ? <ActivityIndicator size="small" color={isFrozen ? "#EF4444" : colors.foreground} />
            : <Icon name={isFrozen ? "lock-open-outline" : "lock-closed-outline"} size={20}
                color={isFrozen ? "#EF4444" : colors.foreground} />
          }
          <Text style={[s.btnText, isFrozen && { color: "#EF4444" }]}>
            {isFrozen ? "Unfreeze" : "Freeze"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.btn, showTxns && { borderColor: "#F59E0B60", backgroundColor: "#F59E0B10" }]}
          activeOpacity={0.7}
          onPress={handleToggleTxns}
          disabled={loadingTxns}
        >
          {loadingTxns
            ? <ActivityIndicator size="small" color="#F59E0B" />
            : <Icon name="receipt-outline" size={20}
                color={showTxns ? "#F59E0B" : colors.foreground} />
          }
          <Text style={[s.btnText, showTxns && { color: "#F59E0B" }]}>History</Text>
        </TouchableOpacity>
      </View>

      {/* Live card details panel */}
      {showDetails && details && (
        <View style={[s.panel, { marginBottom: 16 }]}>
          <Text style={[s.sectionLabel, { marginBottom: 10 }]}>LIVE CARD DETAILS</Text>
          {[
            { label: "CARD NUMBER", val: details.cardNumber, field: "number" },
            { label: "EXPIRY", val: details.expiry, field: "expiry" },
            { label: "CVV", val: details.cvv, field: "cvv" },
            { label: "BALANCE", val: `$${details.balance.toFixed(2)} USDT`, field: "balance" },
            { label: "STATUS", val: details.status.toUpperCase(), field: "status" },
          ].map((item) => (
            <TouchableOpacity key={item.field} style={s.detailRow} activeOpacity={0.7}
              onPress={() => copyField(item.val, item.field)}>
              <Text style={s.detailLabel}>{item.label}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={s.detailVal}>{item.val}</Text>
                <Icon
                  name={copiedField === item.field ? "checkmark-circle-outline" : "copy-outline"}
                  size={14} color={copiedField === item.field ? "#22C55E" : colors.mutedForeground}
                />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Top-up panel */}
      {showFund && (
        <View style={[s.panel, { marginBottom: 16 }]}>
          <Text style={[s.sectionLabel, { marginBottom: 10 }]}>TOP UP CARD</Text>
          <Text style={s.label}>AMOUNT (USD, min $10)</Text>
          <TextInput
            style={s.input}
            placeholder="20"
            placeholderTextColor={colors.mutedForeground}
            value={fundAmt}
            onChangeText={setFundAmt}
            keyboardType="decimal-pad"
          />
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular",
            color: colors.mutedForeground, marginBottom: 14, lineHeight: 18 }}>
            Fee: $1.00 + 4% of amount. Funds appear within minutes.
          </Text>
          <TouchableOpacity
            style={{ borderRadius: 13, overflow: "hidden", opacity: funding ? 0.7 : 1 }}
            activeOpacity={0.85}
            onPress={handleFund}
            disabled={funding}
          >
            <LinearGradient
              colors={["#22C55E", "#16A34A"]}
              style={{ paddingVertical: 14, flexDirection: "row",
                alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              {funding
                ? <ActivityIndicator color="#FFF" size="small" />
                : <Icon name="add-circle-outline" size={18} color="#FFF" />
              }
              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#FFF" }}>
                {funding ? "Processing…" : "Confirm Top Up"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {/* Transactions panel */}
      {showTxns && (
        <View style={s.panel}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={s.sectionLabel}>SPENDING HISTORY</Text>
            {txnBalance !== null && (
              <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#7C3AED" }}>
                ${txnBalance.toFixed(2)} left
              </Text>
            )}
          </View>
          {txns.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 32, gap: 10 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26,
                backgroundColor: colors.border, alignItems: "center", justifyContent: "center" }}>
                <Icon name="receipt-outline" size={22} color={colors.mutedForeground} />
              </View>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular",
                color: colors.mutedForeground, textAlign: "center" }}>
                No transactions yet.
              </Text>
            </View>
          ) : (
            txns.map((t, i) => <TxnRow key={i} txn={t} colors={colors} />)
          )}
        </View>
      )}
    </View>
  );
}
