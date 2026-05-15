import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWallet } from "@/context/WalletContext";
import { api } from "@/services/api";
import type { KeyPair } from "@/services/crypto";
import { useColors } from "@/hooks/useColors";

type Step = "generate" | "backup" | "moniker" | "register" | "done";

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { generateAndStoreKeyPair, completeOnboarding, deviceId } = useWallet();

  const [step, setStep] = useState<Step>("generate");
  const [keyPair, setKeyPair] = useState<KeyPair | null>(null);
  const [moniker, setMoniker] = useState("");
  const [loading, setLoading] = useState(false);
  const [registrationDone, setRegistrationDone] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);
  const generatedRef = useRef(false);

  useEffect(() => {
    if (generatedRef.current) return;
    generatedRef.current = true;
    generateAndStoreKeyPair().then(setKeyPair);
  }, [generateAndStoreKeyPair]);

  async function handleCopyAddress() {
    if (!keyPair) return;
    await Clipboard.setStringAsync(keyPair.mxcAddress);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function handleCopyKey() {
    if (!keyPair) return;
    await Clipboard.setStringAsync(keyPair.privateKey);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Copied", "Private key copied to clipboard. Store it safely!");
  }

  async function handleRegister() {
    if (!keyPair || !moniker.trim()) return;
    setLoading(true);
    try {
      await api.registerValidator({
        address: keyPair.mxcAddress,
        ethAddress: keyPair.ethAddress,
        publicKey: keyPair.publicKey,
        deviceId,
        moniker: moniker.trim(),
        commissionRate: "10",
      });
      setRegistrationDone(true);
      setStep("done");
    } catch {
      Alert.alert(
        "Registration Failed",
        "Could not connect to the chain. You can retry or continue — registration can be retried from Settings."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleFinish() {
    if (!keyPair) return;
    await completeOnboarding(
      keyPair.mxcAddress,
      keyPair.ethAddress,
      keyPair.publicKey,
      keyPair.privateKey,
      moniker.trim() || "Validator"
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/(tabs)");
  }

  const s = StyleSheet.create({
    outer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20),
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 24),
    },
    logo: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
      letterSpacing: 3,
      marginBottom: 8,
    },
    title: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 32,
      lineHeight: 22,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      marginBottom: 20,
    },
    cardTitle: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      letterSpacing: 1.5,
      marginBottom: 12,
    },
    address: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
      marginBottom: 12,
    },
    qrContainer: {
      alignItems: "center",
      paddingVertical: 16,
      backgroundColor: "#FFFFFF",
      borderRadius: colors.radius - 4,
      marginBottom: 12,
    },
    copyBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 10,
      borderRadius: colors.radius - 4,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    copyBtnText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    warningCard: {
      backgroundColor: "#1A1000",
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: "#F59E0B40",
      padding: 16,
      marginBottom: 20,
    },
    warningTitle: {
      fontSize: 13,
      fontFamily: "Inter_700Bold",
      color: colors.warning,
      marginBottom: 8,
    },
    warningText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: "#D4A017",
      lineHeight: 20,
    },
    keyBox: {
      backgroundColor: colors.secondary,
      borderRadius: colors.radius - 4,
      padding: 12,
      marginBottom: 12,
    },
    keyText: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 18,
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: colors.input,
      borderRadius: colors.radius - 4,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      marginBottom: 20,
    },
    primaryBtn: {
      borderRadius: colors.radius,
      overflow: "hidden",
      marginBottom: 16,
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
    secondaryBtn: {
      paddingVertical: 14,
      alignItems: "center",
    },
    secondaryBtnText: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    stepIndicator: {
      flexDirection: "row",
      gap: 6,
      marginBottom: 24,
    },
    stepDot: {
      height: 3,
      borderRadius: 2,
      flex: 1,
    },
    successIcon: {
      alignItems: "center",
      marginBottom: 24,
      marginTop: 8,
    },
    successCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      borderWidth: 2,
      borderColor: colors.success,
      alignItems: "center",
      justifyContent: "center",
    },
    successCheck: {
      fontSize: 36,
    },
    successTitle: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      textAlign: "center",
      marginBottom: 12,
    },
    successText: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 22,
      marginBottom: 8,
    },
    pendingBadge: {
      alignSelf: "center",
      backgroundColor: "#F59E0B20",
      borderRadius: 20,
      borderWidth: 1,
      borderColor: "#F59E0B60",
      paddingHorizontal: 16,
      paddingVertical: 6,
      marginBottom: 24,
    },
    pendingBadgeText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.warning,
    },
  });

  const steps: Step[] = ["generate", "backup", "moniker", "register", "done"];
  const stepIndex = steps.indexOf(step);

  if (!keyPair) {
    return (
      <View style={[s.outer, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={{ color: colors.mutedForeground, marginTop: 16, fontFamily: "Inter_400Regular" }}>
          Generating secure keypair...
        </Text>
      </View>
    );
  }

  return (
    <View style={s.outer}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.logo}>MCHAIN</Text>

          <View style={s.stepIndicator}>
            {steps.slice(0, -1).map((_, i) => (
              <View
                key={i}
                style={[
                  s.stepDot,
                  { backgroundColor: i <= stepIndex ? colors.primary : colors.border },
                ]}
              />
            ))}
          </View>

          {step === "generate" && (
            <>
              <Text style={s.title}>Your Validator Address</Text>
              <Text style={s.subtitle}>
                A secp256k1 keypair has been generated securely on your device.
              </Text>
              <View style={s.card}>
                <Text style={s.cardTitle}>MXC ADDRESS</Text>
                <Text style={s.address}>{keyPair.mxcAddress}</Text>
                <View style={s.qrContainer}>
                  <QRCode value={keyPair.mxcAddress} size={180} color="#000000" backgroundColor="#FFFFFF" />
                </View>
                <TouchableOpacity style={s.copyBtn} onPress={handleCopyAddress}>
                  <Text style={s.copyBtnText}>Copy Address</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={s.primaryBtn} onPress={() => setStep("backup")}>
                <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
                  <Text style={s.primaryBtnText}>Continue</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}

          {step === "backup" && (
            <>
              <Text style={s.title}>Back Up Your Key</Text>
              <Text style={s.subtitle}>
                Your private key is stored only on this device. If you lose it, there is no recovery.
              </Text>
              <View style={s.warningCard}>
                <Text style={s.warningTitle}>IMPORTANT WARNING</Text>
                <Text style={s.warningText}>
                  Never share your private key with anyone. Anyone with this key has full control of your wallet.
                  Write it down and store it somewhere safe.
                </Text>
              </View>
              <View style={s.card}>
                <Text style={s.cardTitle}>PRIVATE KEY</Text>
                <View style={s.keyBox}>
                  <Text style={s.keyText}>
                    {keyVisible ? keyPair.privateKey : "•".repeat(64)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={s.copyBtn}
                  onPress={() => setKeyVisible((v) => !v)}
                >
                  <Text style={s.copyBtnText}>{keyVisible ? "Hide" : "Reveal"} Key</Text>
                </TouchableOpacity>
              </View>
              {keyVisible && (
                <TouchableOpacity style={s.primaryBtn} onPress={handleCopyKey}>
                  <LinearGradient colors={["#F59E0B", "#D97706"]} style={s.primaryGrad}>
                    <Text style={s.primaryBtnText}>Copy Key to Clipboard</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.primaryBtn} onPress={() => setStep("moniker")}>
                <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
                  <Text style={s.primaryBtnText}>I've Saved My Key</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondaryBtn} onPress={() => setStep("moniker")}>
                <Text style={s.secondaryBtnText}>Skip for now</Text>
              </TouchableOpacity>
            </>
          )}

          {step === "moniker" && (
            <>
              <Text style={s.title}>Name Your Validator</Text>
              <Text style={s.subtitle}>
                Choose a name for your validator node (max 32 characters). This is visible on the network.
              </Text>
              <TextInput
                style={s.input}
                placeholder="e.g. MyNode-001"
                placeholderTextColor={colors.mutedForeground}
                value={moniker}
                onChangeText={(t) => setMoniker(t.slice(0, 32))}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={32}
              />
              <TouchableOpacity
                style={[s.primaryBtn, !moniker.trim() && { opacity: 0.4 }]}
                onPress={() => moniker.trim() && setStep("register")}
                disabled={!moniker.trim()}
              >
                <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
                  <Text style={s.primaryBtnText}>Continue</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}

          {step === "register" && (
            <>
              <Text style={s.title}>Register Validator</Text>
              <Text style={s.subtitle}>
                Submit your node registration to the MChain network. An admin will review and activate it.
              </Text>
              <View style={s.card}>
                <Text style={s.cardTitle}>REGISTRATION DETAILS</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 4 }}>Moniker</Text>
                <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 12 }}>{moniker}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 4 }}>Address</Text>
                <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 12 }}>{keyPair.mxcAddress}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 4 }}>Commission Rate</Text>
                <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_600SemiBold" }}>10%</Text>
              </View>
              <TouchableOpacity
                style={[s.primaryBtn, loading && { opacity: 0.7 }]}
                onPress={handleRegister}
                disabled={loading}
              >
                <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={s.primaryBtnText}>Register as Validator</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondaryBtn} onPress={handleFinish}>
                <Text style={s.secondaryBtnText}>Skip registration</Text>
              </TouchableOpacity>
            </>
          )}

          {step === "done" && (
            <>
              <View style={s.successIcon}>
                <View style={s.successCircle}>
                  <Text style={s.successCheck}>✓</Text>
                </View>
              </View>
              <Text style={s.successTitle}>Application Submitted</Text>
              <View style={s.pendingBadge}>
                <Text style={s.pendingBadgeText}>Waiting for Admin Approval</Text>
              </View>
              <Text style={s.successText}>
                Your validator node registration has been submitted to the MChain network.
                {"\n\n"}
                Heartbeats will begin automatically once an admin activates your node. You can track status on the Validator tab.
              </Text>
              <TouchableOpacity style={s.primaryBtn} onPress={handleFinish}>
                <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
                  <Text style={s.primaryBtnText}>Enter Wallet</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
