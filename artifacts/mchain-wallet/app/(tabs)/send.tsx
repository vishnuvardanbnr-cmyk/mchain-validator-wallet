import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { api } from "@/services/api";
import { mcToWei, shortenAddress, signTransaction, weiToMc } from "@/services/crypto";
import { useColors } from "@/hooks/useColors";

type SendStep = "input" | "confirm" | "success";

export default function SendScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mxcAddress, getPrivateKey } = useWallet();

  const [step, setStep] = useState<SendStep>("input");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { data: account } = useQuery({
    queryKey: ["account", mxcAddress],
    queryFn: () => api.getAccount(mxcAddress!),
    enabled: !!mxcAddress,
    refetchInterval: 15_000,
  });

  function validateInput(): string | null {
    if (!recipient.trim()) return "Enter a recipient address";
    if (!recipient.startsWith("mxc1")) return "Address must start with mxc1";
    if (recipient.length < 20) return "Invalid address length";
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return "Enter a valid amount";
    const balance = parseFloat(weiToMc(account?.balance ?? "0").replace(/,/g, ""));
    if (amt > balance) return "Insufficient balance";
    return null;
  }

  function handleContinue() {
    const err = validateInput();
    if (err) {
      setError(err);
      return;
    }
    setError("");
    setStep("confirm");
  }

  async function handleSend() {
    if (!mxcAddress) return;
    setLoading(true);
    try {
      const privateKey = await getPrivateKey();
      if (!privateKey) throw new Error("Private key not found");

      const nonce = account?.nonce ?? 0;
      const weiAmount = mcToWei(amount);
      const signature = signTransaction(mxcAddress, recipient, weiAmount, nonce, privateKey);

      const result = await api.sendTransaction({
        from: mxcAddress,
        to: recipient,
        amount: weiAmount,
        nonce,
        signature,
      });

      setTxHash(result.txHash);
      setStep("success");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      const e = err as Error;
      Alert.alert("Transaction Failed", e.message || "Could not broadcast transaction");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep("input");
    setRecipient("");
    setAmount("");
    setTxHash("");
    setError("");
  }

  const balance = weiToMc(account?.balance ?? "0");

  const s = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      paddingHorizontal: 20,
      paddingBottom: 100,
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
    },
    title: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 28,
    },
    label: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      letterSpacing: 1.2,
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.input,
      borderRadius: colors.radius - 4,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      marginBottom: 20,
    },
    amountRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.input,
      borderRadius: colors.radius - 4,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
    },
    amountInput: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 18,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    amountSuffix: {
      paddingRight: 16,
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    balanceHint: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 24,
    },
    maxBtn: {
      color: colors.primary,
      fontFamily: "Inter_600SemiBold",
    },
    error: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.destructive,
      marginTop: -14,
      marginBottom: 16,
    },
    primaryBtn: {
      borderRadius: colors.radius,
      overflow: "hidden",
      marginTop: 8,
    },
    primaryGrad: {
      paddingVertical: 16,
      alignItems: "center",
    },
    primaryBtnText: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: "#FFFFFF",
    },
    confirmCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      marginBottom: 20,
    },
    confirmRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    confirmLabel: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    confirmValue: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      flex: 1,
      textAlign: "right",
      marginLeft: 16,
    },
    confirmAmountValue: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
    },
    backBtn: {
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 8,
    },
    backBtnText: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    successContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
    },
    successCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      borderWidth: 2,
      borderColor: colors.success,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
    },
    successTitle: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 8,
      textAlign: "center",
    },
    txHashLabel: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      marginBottom: 6,
    },
    txHash: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.primary,
      textAlign: "center",
    },
  });

  if (step === "success") {
    return (
      <View style={[s.container, s.successContainer]}>
        <View style={s.successCircle}>
          <Feather name="check" size={36} color={colors.success} />
        </View>
        <Text style={s.successTitle}>Transaction Sent</Text>
        <Text style={s.txHashLabel}>TX HASH</Text>
        <Text style={s.txHash} numberOfLines={3}>{txHash}</Text>
        <TouchableOpacity style={[s.primaryBtn, { marginTop: 32, width: "100%" }]} onPress={reset}>
          <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
            <Text style={s.primaryBtnText}>Send Another</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === "confirm") {
    return (
      <View style={s.container}>
        <KeyboardAwareScrollViewCompat contentContainerStyle={s.scroll}>
          <Text style={s.title}>Confirm</Text>
          <Text style={s.subtitle}>Review your transaction before signing</Text>

          <View style={s.confirmCard}>
            <View style={s.confirmRow}>
              <Text style={s.confirmLabel}>To</Text>
              <Text style={s.confirmValue} numberOfLines={2}>{shortenAddress(recipient, 10)}</Text>
            </View>
            <View style={s.confirmRow}>
              <Text style={s.confirmLabel}>Amount</Text>
              <Text style={s.confirmAmountValue}>{amount} MC</Text>
            </View>
            <View style={[s.confirmRow, { borderBottomWidth: 0 }]}>
              <Text style={s.confirmLabel}>Network</Text>
              <Text style={s.confirmValue}>MChain (1888)</Text>
            </View>
          </View>

          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 20, lineHeight: 18 }}>
            Transaction will be signed locally with your private key and broadcast to the MChain network.
          </Text>

          <TouchableOpacity
            style={[s.primaryBtn, loading && { opacity: 0.7 }]}
            onPress={handleSend}
            disabled={loading}
          >
            <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryBtnText}>Sign & Send</Text>}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={s.backBtn} onPress={() => setStep("input")}>
            <Text style={s.backBtnText}>Back</Text>
          </TouchableOpacity>
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <KeyboardAwareScrollViewCompat contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Send MC</Text>
        <Text style={s.subtitle}>Transfer MC tokens to any mxc1 address</Text>

        <Text style={s.label}>RECIPIENT ADDRESS</Text>
        <TextInput
          style={s.input}
          placeholder="mxc1..."
          placeholderTextColor={colors.mutedForeground}
          value={recipient}
          onChangeText={setRecipient}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={s.label}>AMOUNT</Text>
        <View style={s.amountRow}>
          <TextInput
            style={s.amountInput}
            placeholder="0.00"
            placeholderTextColor={colors.mutedForeground}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          <Text style={s.amountSuffix}>MC</Text>
        </View>
        <Text style={s.balanceHint}>
          Balance: {balance} MC{" "}
          <Text style={s.maxBtn} onPress={() => setAmount(balance.replace(/,/g, ""))}>
            Max
          </Text>
        </Text>

        {!!error && <Text style={s.error}>{error}</Text>}

        <TouchableOpacity style={s.primaryBtn} onPress={handleContinue}>
          <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
            <Text style={s.primaryBtnText}>Continue</Text>
          </LinearGradient>
        </TouchableOpacity>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}
