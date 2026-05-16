import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWallet } from "@/context/WalletContext";
import { api } from "@/services/api";
import { generateMnemonic, mnemonicToKeyPair } from "@/services/crypto";
import { useColors } from "@/hooks/useColors";
import type { KeyPair } from "@/services/crypto";
import type { ValidatorInfo } from "@/services/api";

type Mode = "create" | "import";
type Step =
  | "welcome"
  | "backup"
  | "moniker"
  | "register"
  | "done"
  | "import_enter"
  | "done_restored";

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { completeOnboarding, resolveImportMnemonic, deviceId } = useWallet();

  const [step, setStep] = useState<Step>("welcome");
  const [mode, setMode] = useState<Mode>("create");
  const [creating, setCreating] = useState(false);

  // Create flow state
  const [mnemonic, setMnemonic] = useState("");
  const [keyPair, setKeyPair] = useState<KeyPair | null>(null);
  const [backedUp, setBackedUp] = useState(false);

  // Import flow state
  const [importInput, setImportInput] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [restoredValidator, setRestoredValidator] = useState<ValidatorInfo | null>(null);

  // Shared state
  const [moniker, setMoniker] = useState("");
  const [loading, setLoading] = useState(false);
  const [registrationDone, setRegistrationDone] = useState(false);

  function handleCreateWallet() {
    setCreating(true);
    // Defer heavy BIP32 derivation to next tick so the loading UI renders first
    setTimeout(() => {
      try {
        const words = generateMnemonic();
        const kp = mnemonicToKeyPair(words);
        setMnemonic(words);
        setKeyPair(kp);
        setMode("create");
        setBackedUp(false);
        setStep("backup");
      } finally {
        setCreating(false);
      }
    }, 50);
  }

  function handleImportWallet() {
    setMode("import");
    setImportInput("");
    setStep("import_enter");
  }

  async function handleImportSubmit() {
    const trimmed = importInput.trim().toLowerCase().replace(/\s+/g, " ");
    const wordCount = trimmed.split(" ").filter(Boolean).length;
    if (wordCount !== 12) {
      Alert.alert("Invalid Phrase", "Please enter exactly 12 words.");
      return;
    }

    setImportLoading(true);
    try {
      const result = await resolveImportMnemonic(trimmed);
      setKeyPair(result.keypair);
      setMnemonic(trimmed);

      if (result.isExistingValidator && result.validatorInfo) {
        // Restore directly — no re-registration needed
        setRestoredValidator(result.validatorInfo);
        const info = result.validatorInfo;
        await completeOnboarding(
          result.keypair.mxcAddress,
          result.keypair.ethAddress,
          result.keypair.publicKey,
          result.keypair.privateKey,
          info.moniker,
          info.status
        );
        setMoniker(info.moniker);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setStep("done_restored");
      } else {
        // Not a validator yet — let them register
        setStep("moniker");
      }
    } catch (err: unknown) {
      Alert.alert(
        "Invalid Seed Phrase",
        err instanceof Error ? err.message : "Please check your 12 words and try again."
      );
    } finally {
      setImportLoading(false);
    }
  }

  async function handleCopyMnemonic() {
    if (!mnemonic) return;
    await Clipboard.setStringAsync(mnemonic);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Copied", "Seed phrase copied. Store it somewhere safe and never share it.");
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
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Could not connect to the chain.";
      Alert.alert(
        "Registration Failed",
        `${msg}\n\nYou can retry or continue — registration can be retried from Settings.`
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

  async function handleRestoredEnter() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace("/(tabs)");
  }

  const mnemonicWords = mnemonic ? mnemonic.split(" ") : [];

  // Step indicator config per mode
  const createSteps: Step[] = ["backup", "moniker", "register", "done"];
  const importSteps: Step[] = ["import_enter", "moniker", "register", "done"];

  function renderStepIndicator() {
    if (step === "welcome" || step === "done_restored") return null;
    const steps = mode === "create" ? createSteps : importSteps;
    const idx = steps.indexOf(step);
    return (
      <View style={s.stepIndicator}>
        {steps.map((_, i) => (
          <View
            key={i}
            style={[s.stepDot, { backgroundColor: i <= idx ? colors.primary : colors.border }]}
          />
        ))}
      </View>
    );
  }

  const s = StyleSheet.create({
    outer: { flex: 1, backgroundColor: colors.background },
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
    stepIndicator: { flexDirection: "row", gap: 6, marginBottom: 24 },
    stepDot: { height: 3, borderRadius: 2, flex: 1 },
    primaryBtn: { borderRadius: colors.radius, overflow: "hidden", marginBottom: 16 },
    primaryGrad: { paddingVertical: 16, alignItems: "center" },
    primaryBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
    secondaryBtn: { paddingVertical: 14, alignItems: "center" },
    secondaryBtnText: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
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
    successIcon: { alignItems: "center", marginBottom: 24, marginTop: 8 },
    successCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      borderWidth: 2,
      borderColor: colors.success,
      alignItems: "center",
      justifyContent: "center",
    },
    successCheck: { fontSize: 36 },
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
    // Welcome screen
    welcomeHero: { alignItems: "center", paddingVertical: 32, marginBottom: 16 },
    welcomeCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: colors.primary + "20",
      borderWidth: 2,
      borderColor: colors.primary + "60",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 24,
    },
    welcomeEmoji: { fontSize: 40 },
    welcomeTitle: {
      fontSize: 30,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      textAlign: "center",
      marginBottom: 12,
    },
    welcomeSubtitle: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 22,
      paddingHorizontal: 8,
    },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 16,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    // Seed phrase grid
    mnemonicGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 16,
    },
    wordChip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.secondary,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
      minWidth: "30%",
      flex: 1,
      gap: 6,
    },
    wordIndex: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      minWidth: 16,
    },
    wordText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    checkRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 24,
      padding: 16,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxChecked: {
      backgroundColor: colors.primary,
    },
    checkboxLabel: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      lineHeight: 20,
    },
    // Import text area
    importTextArea: {
      backgroundColor: colors.input,
      borderRadius: colors.radius - 4,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      marginBottom: 12,
      minHeight: 120,
      textAlignVertical: "top",
    },
    wordCountBadge: {
      alignSelf: "flex-end",
      marginBottom: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    wordCountText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
    },
    restoredBadge: {
      alignSelf: "center",
      backgroundColor: "#16a34a20",
      borderRadius: 20,
      borderWidth: 1,
      borderColor: "#16a34a60",
      paddingHorizontal: 16,
      paddingVertical: 6,
      marginBottom: 24,
    },
    restoredBadgeText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.success,
    },
    infoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    infoLabel: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    infoValue: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
  });

  const wordCount = importInput.trim()
    ? importInput.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const wordCountColor =
    wordCount === 12 ? colors.success : wordCount > 12 ? "#ef4444" : colors.mutedForeground;

  return (
    <View style={s.outer}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.logo}>MCHAIN</Text>
          {renderStepIndicator()}

          {/* ── WELCOME ──────────────────────────────────────────────── */}
          {step === "welcome" && (
            <>
              <View style={s.welcomeHero}>
                <View style={s.welcomeCircle}>
                  <Text style={s.welcomeEmoji}>🔐</Text>
                </View>
                <Text style={s.welcomeTitle}>MChain Validator Wallet</Text>
                <Text style={s.welcomeSubtitle}>
                  Secure your validator identity with a 12-word seed phrase. You're always in control.
                </Text>
              </View>

              <TouchableOpacity
                style={[s.primaryBtn, creating && { opacity: 0.85 }]}
                onPress={handleCreateWallet}
                disabled={creating}
              >
                <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
                  {creating ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <ActivityIndicator color="#FFFFFF" size="small" />
                      <Text style={s.primaryBtnText}>Generating Wallet…</Text>
                    </View>
                  ) : (
                    <Text style={s.primaryBtnText}>Create New Wallet</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <View style={s.divider}>
                <View style={s.dividerLine} />
                <Text style={s.dividerText}>or</Text>
                <View style={s.dividerLine} />
              </View>

              <TouchableOpacity
                style={[
                  s.primaryBtn,
                  {
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: colors.radius,
                    overflow: "hidden",
                    marginBottom: 16,
                  },
                ]}
                onPress={handleImportWallet}
              >
                <View style={{ paddingVertical: 16, alignItems: "center", backgroundColor: colors.card }}>
                  <Text style={[s.primaryBtnText, { color: colors.foreground }]}>
                    Import Existing Wallet
                  </Text>
                </View>
              </TouchableOpacity>

              <Text
                style={{
                  fontSize: 12,
                  fontFamily: "Inter_400Regular",
                  color: colors.mutedForeground,
                  textAlign: "center",
                  lineHeight: 18,
                  marginTop: 8,
                }}
              >
                Already a validator? Import your wallet and your validator status will be restored automatically.
              </Text>
            </>
          )}

          {/* ── BACKUP SEED PHRASE (Create) ───────────────────────────── */}
          {step === "backup" && (
            <>
              <Text style={s.title}>Save Your Seed Phrase</Text>
              <Text style={s.subtitle}>
                These 12 words are the only way to recover your wallet. Write them down in order and keep them somewhere safe.
              </Text>

              <View style={s.warningCard}>
                <Text style={s.warningTitle}>NEVER SHARE THESE WORDS</Text>
                <Text style={s.warningText}>
                  Anyone with your seed phrase has full access to your wallet. MChain support will never ask for them.
                </Text>
              </View>

              <View style={s.card}>
                <Text style={s.cardTitle}>YOUR SEED PHRASE</Text>
                <View style={s.mnemonicGrid}>
                  {mnemonicWords.map((word, i) => (
                    <View key={i} style={s.wordChip}>
                      <Text style={s.wordIndex}>{i + 1}.</Text>
                      <Text style={s.wordText}>{word}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 10,
                  borderRadius: colors.radius - 4,
                  borderWidth: 1,
                  borderColor: colors.border,
                  gap: 6,
                }} onPress={handleCopyMnemonic}>
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primary }}>
                    Copy to Clipboard
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={s.checkRow}
                onPress={() => setBackedUp((v) => !v)}
                activeOpacity={0.7}
              >
                <View style={[s.checkbox, backedUp && s.checkboxChecked]}>
                  {backedUp && <Text style={{ color: "#fff", fontSize: 14 }}>✓</Text>}
                </View>
                <Text style={s.checkboxLabel}>
                  I have written down my seed phrase and stored it safely
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.primaryBtn, !backedUp && { opacity: 0.4 }]}
                onPress={() => backedUp && setStep("moniker")}
                disabled={!backedUp}
              >
                <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
                  <Text style={s.primaryBtnText}>I've Saved My Phrase</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}

          {/* ── IMPORT: ENTER SEED PHRASE ────────────────────────────── */}
          {step === "import_enter" && (
            <>
              <Text style={s.title}>Import Your Wallet</Text>
              <Text style={s.subtitle}>
                Enter your 12-word seed phrase, separated by spaces. Your keys never leave this device.
              </Text>

              <TextInput
                style={s.importTextArea}
                placeholder="word1 word2 word3 ..."
                placeholderTextColor={colors.mutedForeground}
                value={importInput}
                onChangeText={setImportInput}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                numberOfLines={4}
              />

              <View style={[s.wordCountBadge, { backgroundColor: wordCountColor + "20" }]}>
                <Text style={[s.wordCountText, { color: wordCountColor }]}>
                  {wordCount} / 12 words
                </Text>
              </View>

              <TouchableOpacity
                style={[s.primaryBtn, (wordCount !== 12 || importLoading) && { opacity: 0.4 }]}
                onPress={handleImportSubmit}
                disabled={wordCount !== 12 || importLoading}
              >
                <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
                  {importLoading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={s.primaryBtnText}>Import Wallet</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity style={s.secondaryBtn} onPress={() => setStep("welcome")}>
                <Text style={s.secondaryBtnText}>Back</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── MONIKER ──────────────────────────────────────────────── */}
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

          {/* ── REGISTER ─────────────────────────────────────────────── */}
          {step === "register" && keyPair && (
            <>
              <Text style={s.title}>Register Validator</Text>
              <Text style={s.subtitle}>
                Submit your node registration to the MChain network. An admin will review and activate it.
              </Text>
              <View style={s.card}>
                <Text style={s.cardTitle}>REGISTRATION DETAILS</Text>
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Moniker</Text>
                  <Text style={s.infoValue}>{moniker}</Text>
                </View>
                <View style={[s.infoRow, { borderBottomWidth: 0 }]}>
                  <Text style={s.infoLabel}>Commission Rate</Text>
                  <Text style={s.infoValue}>10%</Text>
                </View>
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: "Inter_400Regular",
                    color: colors.mutedForeground,
                    marginTop: 12,
                  }}
                  numberOfLines={2}
                >
                  {keyPair.mxcAddress}
                </Text>
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

          {/* ── DONE (new registration) ───────────────────────────────── */}
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

          {/* ── DONE RESTORED (existing validator re-imported) ─────────── */}
          {step === "done_restored" && restoredValidator && (
            <>
              <View style={s.successIcon}>
                <View style={[s.successCircle, { borderColor: colors.success }]}>
                  <Text style={s.successCheck}>✓</Text>
                </View>
              </View>
              <Text style={s.successTitle}>Validator Restored</Text>
              <View style={s.restoredBadge}>
                <Text style={s.restoredBadgeText}>
                  {restoredValidator.status.toUpperCase()}
                </Text>
              </View>
              <Text style={s.successText}>
                Your validator wallet has been recovered. All your validator history, earnings, and status are intact.
              </Text>

              <View style={[s.card, { marginTop: 8 }]}>
                <Text style={s.cardTitle}>RESTORED VALIDATOR</Text>
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Moniker</Text>
                  <Text style={s.infoValue}>{restoredValidator.moniker}</Text>
                </View>
                <View style={s.infoRow}>
                  <Text style={s.infoLabel}>Commission</Text>
                  <Text style={s.infoValue}>{restoredValidator.commissionRate}%</Text>
                </View>
                <View style={[s.infoRow, { borderBottomWidth: 0 }]}>
                  <Text style={s.infoLabel}>Active Minutes</Text>
                  <Text style={s.infoValue}>{restoredValidator.totalActiveMinutes.toLocaleString()}</Text>
                </View>
              </View>

              <TouchableOpacity style={s.primaryBtn} onPress={handleRestoredEnter}>
                <LinearGradient colors={["#16a34a", "#15803d"]} style={s.primaryGrad}>
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
