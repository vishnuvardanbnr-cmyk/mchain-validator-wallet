import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWallet } from "@/context/WalletContext";
import { Toast } from "@/components/Toast";
import { useColors } from "@/hooks/useColors";

export default function ReceiveScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mxcAddress } = useWallet();

  const [requestAmount, setRequestAmount] = useState("");
  const [showAmountInput, setShowAmountInput] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState("");
  const [amountFocused, setAmountFocused] = useState(false);

  // Glow pulse animation
  const glowAnim = useRef(new Animated.Value(0)).current;
  const glowAnim2 = useRef(new Animated.Value(0)).current;
  const copyScale = useRef(new Animated.Value(1)).current;
  const qrScale = useRef(new Animated.Value(0.92)).current;
  const amountHeight = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Main glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 2200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(glowAnim, { toValue: 0, duration: 2200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
    // Offset second glow
    setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim2, { toValue: 1, duration: 2200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(glowAnim2, { toValue: 0, duration: 2200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      ).start();
    }, 1100);

    // QR entrance
    Animated.spring(qrScale, { toValue: 1, useNativeDriver: true, bounciness: 6, speed: 6 }).start();
  }, [glowAnim, glowAnim2, qrScale]);

  useEffect(() => {
    Animated.timing(amountHeight, {
      toValue: showAmountInput ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
      easing: Easing.inOut(Easing.ease),
    }).start();
  }, [showAmountInput, amountHeight]);

  // Build QR value: address + optional amount request
  const qrValue = requestAmount && parseFloat(requestAmount) > 0
    ? `${mxcAddress ?? ""}?amount=${requestAmount}`
    : (mxcAddress ?? "");

  async function handleCopy() {
    if (!mxcAddress) return;
    await Clipboard.setStringAsync(mxcAddress);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    Animated.sequence([
      Animated.timing(copyScale, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.timing(copyScale, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    if (!mxcAddress) return;
    const msg = requestAmount && parseFloat(requestAmount) > 0
      ? `Send ${requestAmount} MC to my MChain address:\n${mxcAddress}`
      : `My MChain address:\n${mxcAddress}`;
    try {
      await Share.share({ message: msg });
    } catch {
      // User cancelled
    }
  }

  const glowOpacity1 = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.45] });
  const glowScale1 = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] });
  const glowOpacity2 = glowAnim2.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.25] });
  const glowScale2 = glowAnim2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.28] });

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20,
      paddingBottom: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
    qrSection: { alignItems: "center", paddingHorizontal: 24, paddingTop: 8 },
    qrOuter: { alignItems: "center", justifyContent: "center", marginBottom: 24 },
    glowRing: {
      position: "absolute",
      width: 290,
      height: 290,
      borderRadius: 145,
      backgroundColor: colors.primary,
    },
    glowRing2: {
      position: "absolute",
      width: 290,
      height: 290,
      borderRadius: 145,
      backgroundColor: colors.primary,
    },
    qrCard: {
      backgroundColor: "#FFFFFF",
      borderRadius: 20,
      padding: 20,
      shadowColor: colors.primary,
      shadowOpacity: 0.2,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    networkBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.primary + "15",
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.primary + "25",
      marginBottom: 20,
    },
    networkBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primary },
    addressCard: {
      width: "100%",
      backgroundColor: colors.card,
      borderRadius: colors.radius + 2,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 12,
    },
    addressLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.5, marginBottom: 8 },
    addressText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.primary, lineHeight: 21 },
    amountRequestRow: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    amountRequestLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    amountToggle: {
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
    amountToggleText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primary },
    amountInputWrap: {
      width: "100%",
      overflow: "hidden",
      marginBottom: 12,
    },
    amountInputRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
    },
    amountInputRowFocused: { borderColor: colors.primary },
    amountInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    amountSuffix: { paddingRight: 14, fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    amountHint: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4 },
    actionRow: { width: "100%", flexDirection: "row", gap: 10, paddingHorizontal: 0 },
    copyBtn: { flex: 1, borderRadius: colors.radius, overflow: "hidden" },
    shareBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
    },
    shareBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
  });

  return (
    <View style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Feather name="x" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Receive MC</Text>
        </View>

        <View style={s.qrSection}>
          {/* Network badge */}
          <View style={s.networkBadge}>
            <Feather name="zap" size={12} color={colors.primary} />
            <Text style={s.networkBadgeText}>MChain Network · Chain 1888</Text>
          </View>

          {/* QR with animated glow */}
          <View style={s.qrOuter}>
            <Animated.View
              style={[s.glowRing2, { opacity: glowOpacity2, transform: [{ scale: glowScale2 }] }]}
            />
            <Animated.View
              style={[s.glowRing, { opacity: glowOpacity1, transform: [{ scale: glowScale1 }] }]}
            />
            <Animated.View style={[s.qrCard, { transform: [{ scale: qrScale }] }]}>
              {mxcAddress ? (
                <QRCode
                  value={qrValue}
                  size={200}
                  color="#000000"
                  backgroundColor="#FFFFFF"
                />
              ) : (
                <View style={{ width: 200, height: 200, backgroundColor: "#F0F0F0", borderRadius: 8 }} />
              )}
            </Animated.View>
          </View>

          {/* Amount request toggle */}
          <View style={s.amountRequestRow}>
            <Text style={s.amountRequestLabel}>
              {requestAmount && parseFloat(requestAmount) > 0
                ? `Requesting ${requestAmount} MC`
                : "Request specific amount"}
            </Text>
            <TouchableOpacity
              style={s.amountToggle}
              onPress={() => setShowAmountInput((v) => !v)}
            >
              <Feather name={showAmountInput ? "chevron-up" : "edit-2"} size={12} color={colors.primary} />
              <Text style={s.amountToggleText}>{showAmountInput ? "Hide" : "Set Amount"}</Text>
            </TouchableOpacity>
          </View>

          {/* Animated amount input */}
          <Animated.View
            style={[
              s.amountInputWrap,
              {
                maxHeight: amountHeight.interpolate({ inputRange: [0, 1], outputRange: [0, 80] }),
                opacity: amountHeight,
              },
            ]}
          >
            <View style={[s.amountInputRow, amountFocused && s.amountInputRowFocused]}>
              <TextInput
                style={s.amountInput}
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                value={requestAmount}
                onChangeText={setRequestAmount}
                onFocus={() => setAmountFocused(true)}
                onBlur={() => setAmountFocused(false)}
                keyboardType="decimal-pad"
              />
              <Text style={s.amountSuffix}>MC</Text>
            </View>
            <Text style={s.amountHint}>Encodes amount into the QR code</Text>
          </Animated.View>

          {/* Address display */}
          <View style={s.addressCard}>
            <Text style={s.addressLabel}>YOUR MXC ADDRESS</Text>
            <Text style={s.addressText} selectable>
              {mxcAddress ?? "Loading..."}
            </Text>
          </View>

          {/* Action buttons */}
          <View style={s.actionRow}>
            <Animated.View style={[s.copyBtn, { transform: [{ scale: copyScale }] }]}>
              <TouchableOpacity onPress={handleCopy} activeOpacity={0.85}>
                <LinearGradient
                  colors={copied ? ["#10B981", "#059669"] : ["#0EA5E9", "#0284C7"]}
                  style={{ paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: colors.radius }}
                >
                  <Feather name={copied ? "check" : "copy"} size={16} color="#FFFFFF" />
                  <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" }}>
                    {copied ? "Copied!" : "Copy Address"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            <TouchableOpacity style={s.shareBtn} onPress={handleShare} activeOpacity={0.85}>
              <Feather name="share-2" size={16} color={colors.foreground} />
              <Text style={s.shareBtnText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      <Toast message={toast} visible={!!toast} onHide={() => setToast("")} />
    </View>
  );
}
