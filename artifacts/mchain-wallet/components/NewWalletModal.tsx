import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useWallet } from "@/context/WalletContext";
import { generateKeyPair, type KeyPair } from "@/services/crypto";
import { useColors } from "@/hooks/useColors";

type Step = "warn" | "backup" | "confirm";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function NewWalletModal({ visible, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { completeOnboarding, moniker } = useWallet();

  const [step, setStep] = useState<Step>("warn");
  const [keyPair, setKeyPair] = useState<KeyPair | null>(null);
  const [generating, setGenerating] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [addrCopied, setAddrCopied] = useState(false);

  const slideAnim = useRef(new Animated.Value(400)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setStep("warn");
      setKeyPair(null);
      setKeyVisible(false);
      setKeyCopied(false);
      setAddrCopied(false);
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 320, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
        Animated.timing(overlayOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 400, duration: 260, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
        Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, slideAnim, overlayOpacity]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const kp = await generateKeyPair();
      setKeyPair(kp);
      setStep("backup");
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopyKey() {
    if (!keyPair) return;
    await Clipboard.setStringAsync(keyPair.privateKey);
    setKeyCopied(true);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setKeyCopied(false), 2500);
  }

  async function handleCopyAddress() {
    if (!keyPair) return;
    await Clipboard.setStringAsync(keyPair.mxcAddress);
    setAddrCopied(true);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setAddrCopied(false), 2500);
  }

  async function handleReplace() {
    if (!keyPair) return;
    setReplacing(true);
    try {
      await completeOnboarding(
        keyPair.mxcAddress,
        keyPair.ethAddress,
        keyPair.publicKey,
        keyPair.privateKey,
        moniker || "Validator"
      );
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } finally {
      setReplacing(false);
    }
  }

  const s = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.7)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1,
      borderColor: colors.border,
      paddingBottom: insets.bottom + 8,
      maxHeight: "90%",
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
    sheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sheetTitle: {
      fontSize: 17,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
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
    body: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 8,
    },
    warningBox: {
      backgroundColor: "#1A0A00",
      borderRadius: 14,
      borderWidth: 1,
      borderColor: "#EF444440",
      padding: 18,
      marginBottom: 20,
      flexDirection: "row",
      gap: 14,
      alignItems: "flex-start",
    },
    warningIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "#EF444415",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    warningTextWrap: { flex: 1 },
    warningTitle: {
      fontSize: 15,
      fontFamily: "Inter_700Bold",
      color: "#F87171",
      marginBottom: 6,
    },
    warningDesc: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 20,
    },
    primaryBtn: {
      borderRadius: 14,
      overflow: "hidden",
      marginBottom: 12,
    },
    primaryGrad: {
      paddingVertical: 15,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    primaryBtnText: {
      fontSize: 15,
      fontFamily: "Inter_700Bold",
      color: "#FFFFFF",
    },
    ghostBtn: {
      paddingVertical: 13,
      alignItems: "center",
      marginBottom: 4,
    },
    ghostBtnText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    sectionLabel: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      letterSpacing: 1.5,
      marginBottom: 8,
    },
    addressBox: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 4,
    },
    addressText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.primary,
      lineHeight: 20,
    },
    copyRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginBottom: 16,
    },
    copyChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    copyChipText: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    keyBox: {
      backgroundColor: "#080808",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "#EF444430",
      padding: 14,
      marginBottom: 4,
    },
    keyText: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 18,
      letterSpacing: 0.4,
    },
    revealRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
    revealBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    revealBtnText: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
    keyNotice: {
      backgroundColor: "#F59E0B10",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "#F59E0B30",
      padding: 12,
      flexDirection: "row",
      gap: 8,
      marginBottom: 20,
      alignItems: "flex-start",
    },
    keyNoticeText: {
      flex: 1,
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: "#D4A017",
      lineHeight: 18,
    },
    confirmCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 20,
      gap: 10,
    },
    confirmRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    confirmLabel: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    confirmValue: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      flex: 1,
      textAlign: "right",
      marginLeft: 16,
    },
    destructiveBtn: {
      borderRadius: 14,
      overflow: "hidden",
      marginBottom: 12,
    },
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View style={[s.overlay, { opacity: overlayOpacity }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={s.handle} />
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>
              {step === "warn" ? "Create New Wallet" : step === "backup" ? "Back Up New Keys" : "Confirm Replacement"}
            </Text>
            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
              <Icon name="close" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {step === "warn" && (
              <>
                <View style={s.warningBox}>
                  <View style={s.warningIconWrap}>
                    <Icon name="warning-outline" size={18} color="#F87171" />
                  </View>
                  <View style={s.warningTextWrap}>
                    <Text style={s.warningTitle}>Replace Existing Wallet</Text>
                    <Text style={s.warningDesc}>
                      This will permanently replace your current wallet and private key.
                      {"\n\n"}
                      Make sure you have backed up your existing private key before continuing — it cannot be recovered afterward.
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[s.primaryBtn, generating && { opacity: 0.7 }]}
                  onPress={handleGenerate}
                  disabled={generating}
                  activeOpacity={0.85}
                >
                  <LinearGradient colors={["#EF4444", "#B91C1C"]} style={s.primaryGrad}>
                    {generating ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Icon name="wallet" size={16} color="#FFFFFF" />
                        <Text style={s.primaryBtnText}>Generate New Wallet</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity style={s.ghostBtn} onPress={onClose}>
                  <Text style={s.ghostBtnText}>Cancel — keep current wallet</Text>
                </TouchableOpacity>
              </>
            )}

            {step === "backup" && keyPair && (
              <>
                <Text style={s.sectionLabel}>NEW ADDRESS</Text>
                <View style={s.addressBox}>
                  <Text style={s.addressText} selectable>{keyPair.mxcAddress}</Text>
                </View>
                <View style={s.copyRow}>
                  <TouchableOpacity style={s.copyChip} onPress={handleCopyAddress}>
                    <Icon name={addrCopied ? "checkmark" : "copy-outline"} size={11} color={addrCopied ? colors.success : colors.primary} />
                    <Text style={[s.copyChipText, addrCopied && { color: colors.success }]}>
                      {addrCopied ? "Copied!" : "Copy Address"}
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={s.sectionLabel}>PRIVATE KEY</Text>
                <View style={s.keyBox}>
                  <Text style={s.keyText} selectable>
                    {keyVisible ? keyPair.privateKey : "•".repeat(64)}
                  </Text>
                </View>
                <View style={s.revealRow}>
                  <TouchableOpacity style={s.revealBtn} onPress={() => setKeyVisible(v => !v)}>
                    <Icon name={keyVisible ? "eye-off-outline" : "eye-outline"} size={12} color={colors.mutedForeground} />
                    <Text style={s.revealBtnText}>{keyVisible ? "Hide" : "Reveal"}</Text>
                  </TouchableOpacity>
                  {keyVisible && (
                    <TouchableOpacity style={[s.copyChip, { borderColor: "#F59E0B50" }]} onPress={handleCopyKey}>
                      <Icon name={keyCopied ? "checkmark" : "copy-outline"} size={11} color={keyCopied ? colors.success : "#F59E0B"} />
                      <Text style={[s.copyChipText, { color: keyCopied ? colors.success : "#F59E0B" }]}>
                        {keyCopied ? "Copied!" : "Copy Key"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={s.keyNotice}>
                  <Icon name="warning-outline" size={13} color="#F59E0B" style={{ marginTop: 1 }} />
                  <Text style={s.keyNoticeText}>
                    Store your private key somewhere safe before continuing. This is the only time you can see it during setup.
                  </Text>
                </View>

                <TouchableOpacity style={s.primaryBtn} onPress={() => setStep("confirm")} activeOpacity={0.85}>
                  <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
                    <Text style={s.primaryBtnText}>I've Saved My Key →</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity style={s.ghostBtn} onPress={onClose}>
                  <Text style={s.ghostBtnText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}

            {step === "confirm" && keyPair && (
              <>
                <View style={s.confirmCard}>
                  <View style={s.confirmRow}>
                    <Text style={s.confirmLabel}>New Address</Text>
                    <Text style={s.confirmValue} numberOfLines={1}>
                      {keyPair.mxcAddress.slice(0, 16)}…{keyPair.mxcAddress.slice(-8)}
                    </Text>
                  </View>
                  <View style={[s.confirmRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }]}>
                    <Text style={s.confirmLabel}>Network</Text>
                    <Text style={s.confirmValue}>MChain · Chain 1888</Text>
                  </View>
                  <View style={[s.confirmRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }]}>
                    <Text style={s.confirmLabel}>Action</Text>
                    <Text style={[s.confirmValue, { color: "#F87171" }]}>Replace current wallet</Text>
                  </View>
                </View>

                <View style={[s.warningBox, { marginBottom: 20 }]}>
                  <View style={s.warningIconWrap}>
                    <Icon name="warning-outline" size={18} color="#F87171" />
                  </View>
                  <View style={s.warningTextWrap}>
                    <Text style={[s.warningDesc, { color: "#F87171", fontFamily: "Inter_600SemiBold", marginBottom: 4 }]}>
                      This cannot be undone
                    </Text>
                    <Text style={s.warningDesc}>
                      Your current wallet will be removed. Any funds in it will only be accessible if you have your old private key.
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[s.destructiveBtn, replacing && { opacity: 0.7 }]}
                  onPress={handleReplace}
                  disabled={replacing}
                  activeOpacity={0.85}
                >
                  <LinearGradient colors={["#EF4444", "#B91C1C"]} style={s.primaryGrad}>
                    {replacing ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={s.primaryBtnText}>Replace Wallet</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity style={s.ghostBtn} onPress={() => setStep("backup")}>
                  <Text style={s.ghostBtnText}>← Back</Text>
                </TouchableOpacity>
              </>
            )}

          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
