import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { generateMnemonic, mnemonicToKeyPair } from "@/services/crypto";
import { useColors } from "@/hooks/useColors";
import type { KeyPair } from "@/services/crypto";
import type { ValidatorInfo } from "@/services/api";

type Mode = "create" | "import";
type Step =
  | "welcome"
  | "backup"
  | "verify"
  | "moniker"
  | "import_enter"
  | "done_restored";

// Pick n unique random indices from 0..max-1
function pickRandomIndices(max: number, n: number): number[] {
  const pool = Array.from({ length: max }, (_, i) => i);
  const result: number[] = [];
  while (result.length < n) {
    const i = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(i, 1)[0]);
  }
  return result.sort((a, b) => a - b);
}

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { completeOnboarding, resolveImportMnemonic } = useWallet();

  const [step, setStep] = useState<Step>("welcome");
  const [mode, setMode] = useState<Mode>("create");
  const [creating, setCreating] = useState(false);

  // Wallet state
  const [mnemonic, setMnemonic] = useState("");
  const [keyPair, setKeyPair] = useState<KeyPair | null>(null);
  const [backedUp, setBackedUp] = useState(false);

  // Verify step — 3 random word positions to confirm
  const [verifyIndices, setVerifyIndices] = useState<number[]>([]);
  const [verifyInputs, setVerifyInputs] = useState<string[]>(["", "", ""]);
  const [verifyError, setVerifyError] = useState("");
  const verifyRefs = [useRef<TextInput>(null), useRef<TextInput>(null), useRef<TextInput>(null)];

  // Import state
  const [importInput, setImportInput] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [restoredValidator, setRestoredValidator] = useState<ValidatorInfo | null>(null);

  // Shared
  const [moniker, setMoniker] = useState("");
  const [finishing, setFinishing] = useState(false);

  // Pulsing glow animation for the welcome logo
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 2200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 2200, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  function handleCreateWallet() {
    setCreating(true);
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
        const info = result.validatorInfo;
        await completeOnboarding(
          result.keypair.mxcAddress,
          result.keypair.ethAddress,
          result.keypair.publicKey,
          result.keypair.privateKey,
          info.moniker,
          info.status
        );
        setRestoredValidator(info);
        setMoniker(info.moniker);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setStep("done_restored");
      } else {
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

  function handleProceedToVerify() {
    const indices = pickRandomIndices(12, 3);
    setVerifyIndices(indices);
    setVerifyInputs(["", "", ""]);
    setVerifyError("");
    setStep("verify");
  }

  function handleVerify() {
    const words = mnemonic.split(" ");
    const allCorrect = verifyIndices.every(
      (idx, i) => verifyInputs[i].trim().toLowerCase() === words[idx].toLowerCase()
    );
    if (!allCorrect) {
      setVerifyError("One or more words are incorrect. Check your written copy and try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setVerifyError("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setStep("moniker");
  }

  async function handleFinish() {
    if (!keyPair || !moniker.trim()) return;
    setFinishing(true);
    try {
      await completeOnboarding(
        keyPair.mxcAddress,
        keyPair.ethAddress,
        keyPair.publicKey,
        keyPair.privateKey,
        moniker.trim()
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } finally {
      setFinishing(false);
    }
  }

  const mnemonicWords = mnemonic ? mnemonic.split(" ") : [];

  const createSteps: Step[] = ["backup", "verify", "moniker"];
  const importSteps: Step[] = ["import_enter", "moniker"];

  function renderStepIndicator() {
    if (step === "welcome" || step === "done_restored") return null;
    const steps = mode === "create" ? createSteps : importSteps;
    const idx = steps.indexOf(step);
    if (idx < 0) return null;
    return (
      <View style={s.stepIndicator}>
        {steps.map((_, i) => (
          <View key={i} style={[s.stepDot, { backgroundColor: i <= idx ? colors.primary : colors.border }]} />
        ))}
      </View>
    );
  }

  const wordCount = importInput.trim() ? importInput.trim().split(/\s+/).filter(Boolean).length : 0;
  const wordCountColor = wordCount === 12 ? colors.success : wordCount > 12 ? "#ef4444" : colors.mutedForeground;

  const s = StyleSheet.create({
    outer: { flex: 1, backgroundColor: colors.background },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20),
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 24),
    },
    logo: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primary, letterSpacing: 3, marginBottom: 8 },
    title: { fontSize: 28, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 8 },
    subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 32, lineHeight: 22 },
    card: { backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border, padding: 20, marginBottom: 20 },
    cardTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.5, marginBottom: 12 },
    stepIndicator: { flexDirection: "row", gap: 6, marginBottom: 24 },
    stepDot: { height: 3, borderRadius: 2, flex: 1 },
    primaryBtn: { borderRadius: colors.radius, overflow: "hidden", marginBottom: 16 },
    primaryGrad: { paddingVertical: 16, alignItems: "center" },
    primaryBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
    secondaryBtn: { paddingVertical: 14, alignItems: "center" },
    secondaryBtnText: { fontSize: 15, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    input: {
      backgroundColor: colors.input, borderRadius: colors.radius - 4, borderWidth: 1,
      borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14,
      fontSize: 16, fontFamily: "Inter_400Regular", color: colors.foreground, marginBottom: 20,
    },
    warningCard: { backgroundColor: "#1A1000", borderRadius: colors.radius, borderWidth: 1, borderColor: "#F59E0B40", padding: 16, marginBottom: 20 },
    warningTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: colors.warning, marginBottom: 8 },
    warningText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#D4A017", lineHeight: 20 },
    successIcon: { alignItems: "center", marginBottom: 24, marginTop: 8 },
    successCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: colors.success, alignItems: "center", justifyContent: "center" },
    successCheck: { fontSize: 36 },
    successTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center", marginBottom: 12 },
    successText: { fontSize: 15, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", lineHeight: 22, marginBottom: 8 },
    welcomeHero: { alignItems: "center", paddingTop: 16, paddingBottom: 36 },
    welcomeRingOuter: {
      width: 160, height: 160, borderRadius: 80,
      borderWidth: 1, borderColor: "#0EA5E918",
      alignItems: "center", justifyContent: "center", marginBottom: 32,
    },
    welcomeRingMid: {
      width: 128, height: 128, borderRadius: 64,
      borderWidth: 1, borderColor: "#0EA5E930",
      alignItems: "center", justifyContent: "center",
    },
    welcomeRingInner: {
      width: 100, height: 100, borderRadius: 50,
      borderWidth: 1.5, borderColor: "#0EA5E950",
      backgroundColor: "#0EA5E910",
      alignItems: "center", justifyContent: "center",
    },
    welcomeIconGrad: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
    welcomeEmoji: { fontSize: 32 },
    welcomeBrand: { alignItems: "center", marginBottom: 14 },
    welcomeChain: {
      fontSize: 11, fontFamily: "Inter_700Bold",
      color: colors.primary, letterSpacing: 5, marginBottom: 10,
    },
    welcomeTitle: {
      fontSize: 28, fontFamily: "Inter_700Bold",
      color: colors.foreground, textAlign: "center",
      lineHeight: 34, marginBottom: 12,
    },
    welcomeSubtitle: {
      fontSize: 14, fontFamily: "Inter_400Regular",
      color: colors.mutedForeground, textAlign: "center",
      lineHeight: 22, paddingHorizontal: 4,
    },
    trustRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 24 },
    trustChip: {
      flexDirection: "row", alignItems: "center", gap: 5,
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
      backgroundColor: "#0EA5E90C", borderWidth: 1, borderColor: "#0EA5E922",
    },
    trustText: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    divider: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    mnemonicGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
    wordChip: { flexDirection: "row", alignItems: "center", backgroundColor: colors.secondary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, minWidth: "30%", flex: 1, gap: 6 },
    wordIndex: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground, minWidth: 16 },
    wordText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    checkRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24, padding: 16, backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.primary, alignItems: "center", justifyContent: "center" },
    checkboxChecked: { backgroundColor: colors.primary },
    checkboxLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 20 },
    importTextArea: { backgroundColor: colors.input, borderRadius: colors.radius - 4, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, fontFamily: "Inter_400Regular", color: colors.foreground, marginBottom: 12, minHeight: 120, textAlignVertical: "top" },
    wordCountBadge: { alignSelf: "flex-end", marginBottom: 20, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    wordCountText: { fontSize: 12, fontFamily: "Inter_500Medium" },
    restoredBadge: { alignSelf: "center", backgroundColor: "#16a34a20", borderRadius: 20, borderWidth: 1, borderColor: "#16a34a60", paddingHorizontal: 16, paddingVertical: 6, marginBottom: 24 },
    restoredBadgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.success },
    infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    infoLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    infoValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    // Verify step
    verifyRow: { marginBottom: 18 },
    verifyLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginBottom: 8, letterSpacing: 0.5 },
    verifyInput: {
      backgroundColor: colors.input, borderRadius: colors.radius - 4, borderWidth: 1.5,
      borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 13,
      fontSize: 16, fontFamily: "Inter_500Medium", color: colors.foreground,
    },
    verifyInputError: { borderColor: "#EF4444" },
    verifyErrorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#EF444410", borderRadius: 10, borderWidth: 1, borderColor: "#EF444430", padding: 12, marginBottom: 18 },
    verifyErrorText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#EF4444", lineHeight: 18 },
  });

  return (
    <View style={s.outer}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {step !== "welcome" && <Text style={s.logo}>MCHAIN</Text>}
          {renderStepIndicator()}

          {/* ── WELCOME ──────────────────────────────────────────────── */}
          {step === "welcome" && (
            <>
              {/* Hero — concentric glow rings + icon */}
              <View style={s.welcomeHero}>
                <Animated.View style={[s.welcomeRingOuter, { transform: [{ scale: pulseAnim }] }]}>
                  <View style={s.welcomeRingMid}>
                    <View style={s.welcomeRingInner}>
                      <LinearGradient
                        colors={["#0EA5E9", "#0369A1"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={s.welcomeIconGrad}
                      >
                        <Text style={s.welcomeEmoji}>⛓</Text>
                      </LinearGradient>
                    </View>
                  </View>
                </Animated.View>

                {/* Brand text */}
                <View style={s.welcomeBrand}>
                  <Text style={s.welcomeChain}>MCHAIN</Text>
                  <Text style={s.welcomeTitle}>Validator Wallet</Text>
                  <Text style={s.welcomeSubtitle}>
                    Secure your validator identity with a{"\n"}12-word seed phrase. You're always in control.
                  </Text>
                </View>

                {/* Trust pills */}
                <View style={s.trustRow}>
                  {[
                    { icon: "🔒", label: "Non-custodial" },
                    { icon: "🛡", label: "256-bit" },
                    { icon: "⚡", label: "On-chain" },
                  ].map(({ icon, label }) => (
                    <View key={label} style={s.trustChip}>
                      <Text style={{ fontSize: 10 }}>{icon}</Text>
                      <Text style={s.trustText}>{label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Primary CTA */}
              <TouchableOpacity
                style={[s.primaryBtn, creating && { opacity: 0.85 }]}
                onPress={handleCreateWallet}
                disabled={creating}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={["#0EA5E9", "#0284C7"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[s.primaryGrad, {
                    shadowColor: "#0EA5E9",
                    shadowOpacity: 0.45,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 6 },
                  }]}
                >
                  {creating ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <ActivityIndicator color="#FFFFFF" size="small" />
                      <Text style={s.primaryBtnText}>Generating…</Text>
                    </View>
                  ) : (
                    <Text style={s.primaryBtnText}>Create New Wallet</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Divider */}
              <View style={s.divider}>
                <View style={s.dividerLine} />
                <Text style={s.dividerText}>or</Text>
                <View style={s.dividerLine} />
              </View>

              {/* Secondary CTA */}
              <TouchableOpacity
                style={[
                  s.primaryBtn,
                  { borderWidth: 1.5, borderColor: colors.border, borderRadius: colors.radius, overflow: "hidden" },
                ]}
                onPress={handleImportWallet}
                activeOpacity={0.88}
              >
                <View style={{ paddingVertical: 16, alignItems: "center", backgroundColor: colors.card }}>
                  <Text style={[s.primaryBtnText, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
                    Import Existing Wallet
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Footer note */}
              <Text style={{
                fontSize: 12, fontFamily: "Inter_400Regular",
                color: colors.mutedForeground, textAlign: "center",
                lineHeight: 18, marginTop: 16, paddingHorizontal: 16,
              }}>
                Already a validator? Import your wallet and your status{"\n"}will be restored automatically.
              </Text>
            </>
          )}

          {/* ── BACKUP SEED PHRASE ────────────────────────────────────── */}
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
                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 10, borderRadius: colors.radius - 4, borderWidth: 1, borderColor: colors.border, gap: 6 }}
                  onPress={handleCopyMnemonic}
                >
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primary }}>Copy to Clipboard</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={s.checkRow} onPress={() => setBackedUp(v => !v)} activeOpacity={0.7}>
                <View style={[s.checkbox, backedUp && s.checkboxChecked]}>
                  {backedUp && <Text style={{ color: "#fff", fontSize: 14 }}>✓</Text>}
                </View>
                <Text style={s.checkboxLabel}>I have written down my seed phrase and stored it safely</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[s.primaryBtn, !backedUp && { opacity: 0.4 }]} onPress={() => backedUp && handleProceedToVerify()} disabled={!backedUp}>
                <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
                  <Text style={s.primaryBtnText}>I've Saved My Phrase</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}

          {/* ── VERIFY SEED PHRASE ────────────────────────────────────── */}
          {step === "verify" && (
            <>
              <Text style={s.title}>Confirm Your Backup</Text>
              <Text style={s.subtitle}>
                Enter the words at the positions below to confirm you've saved your seed phrase correctly.
              </Text>

              {verifyIndices.map((wordIdx, i) => (
                <View key={i} style={s.verifyRow}>
                  <Text style={s.verifyLabel}>WORD #{wordIdx + 1}</Text>
                  <TextInput
                    ref={verifyRefs[i]}
                    style={[s.verifyInput, verifyError ? s.verifyInputError : null]}
                    value={verifyInputs[i]}
                    onChangeText={text => {
                      const updated = [...verifyInputs];
                      updated[i] = text;
                      setVerifyInputs(updated);
                      setVerifyError("");
                    }}
                    placeholder={`Enter word #${wordIdx + 1}`}
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType={i < 2 ? "next" : "done"}
                    onSubmitEditing={() => {
                      if (i < 2) verifyRefs[i + 1].current?.focus();
                      else handleVerify();
                    }}
                  />
                </View>
              ))}

              {!!verifyError && (
                <View style={s.verifyErrorBox}>
                  <Text style={{ fontSize: 16 }}>⚠️</Text>
                  <Text style={s.verifyErrorText}>{verifyError}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[s.primaryBtn, verifyInputs.some(v => !v.trim()) && { opacity: 0.4 }]}
                onPress={handleVerify}
                disabled={verifyInputs.some(v => !v.trim())}
              >
                <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
                  <Text style={s.primaryBtnText}>Verify & Continue</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity style={s.secondaryBtn} onPress={() => setStep("backup")}>
                <Text style={s.secondaryBtnText}>Back to Seed Phrase</Text>
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
                <Text style={[s.wordCountText, { color: wordCountColor }]}>{wordCount} / 12 words</Text>
              </View>

              <TouchableOpacity
                style={[s.primaryBtn, (wordCount !== 12 || importLoading) && { opacity: 0.4 }]}
                onPress={handleImportSubmit}
                disabled={wordCount !== 12 || importLoading}
              >
                <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
                  {importLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryBtnText}>Import Wallet</Text>}
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
              <Text style={s.title}>Name Your Wallet</Text>
              <Text style={s.subtitle}>
                Choose a display name for your wallet (max 32 characters). You can register as a validator anytime from the Validator tab.
              </Text>

              <TextInput
                style={s.input}
                placeholder="e.g. MyNode-001"
                placeholderTextColor={colors.mutedForeground}
                value={moniker}
                onChangeText={t => setMoniker(t.slice(0, 32))}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={32}
                returnKeyType="done"
                onSubmitEditing={() => moniker.trim() && handleFinish()}
              />

              <TouchableOpacity
                style={[s.primaryBtn, (!moniker.trim() || finishing) && { opacity: 0.4 }]}
                onPress={handleFinish}
                disabled={!moniker.trim() || finishing}
              >
                <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
                  {finishing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryBtnText}>Enter Wallet</Text>}
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
                <Text style={s.restoredBadgeText}>{restoredValidator.status.toUpperCase()}</Text>
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

              <TouchableOpacity style={s.primaryBtn} onPress={() => router.replace("/(tabs)")}>
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
