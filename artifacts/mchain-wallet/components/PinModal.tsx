import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { verifyPin } from "@/services/pin";

const PIN_LENGTH = 6;

interface Props {
  visible: boolean;
  title: string;
  subtitle?: string;
  onSuccess: () => void;
  onCancel?: () => void;
  animationType?: "none" | "slide" | "fade";
}

export function PinModal({ visible, title, subtitle, onSuccess, onCancel, animationType = "fade" }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [digits, setDigits] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Reset state each time the modal opens
  useEffect(() => {
    if (visible) {
      setDigits("");
      setError("");
      setChecking(false);
    }
  }, [visible]);

  // Auto-submit when all digits are entered
  useEffect(() => {
    if (digits.length === PIN_LENGTH && !checking) {
      void submit(digits);
    }
  }, [digits]); // eslint-disable-line react-hooks/exhaustive-deps

  function shake() {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }

  async function submit(pin: string) {
    setChecking(true);
    const ok = await verifyPin(pin);
    if (ok) {
      setDigits("");
      setError("");
      setChecking(false);
      onSuccess();
    } else {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      shake();
      setError("Incorrect PIN. Try again.");
      setDigits("");
      setChecking(false);
    }
  }

  function pressKey(key: string) {
    if (checking) return;
    setError("");
    if (digits.length < PIN_LENGTH) {
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setDigits((d) => d + key);
    }
  }

  function pressDelete() {
    if (checking) return;
    setError("");
    setDigits((d) => d.slice(0, -1));
  }

  const s = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.background,
    },
    inner: {
      flex: 1,
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: insets.top + 24,
      paddingBottom: insets.bottom + 16,
      paddingHorizontal: 32,
    },
    topSection: { alignItems: "center", width: "100%", gap: 8 },
    lockIcon: {
      width: 64, height: 64, borderRadius: 32,
      backgroundColor: colors.primary + "18",
      alignItems: "center", justifyContent: "center",
      marginBottom: 16,
    },
    title: {
      fontSize: 22, fontFamily: "Inter_700Bold",
      color: colors.foreground, textAlign: "center",
    },
    subtitle: {
      fontSize: 14, fontFamily: "Inter_400Regular",
      color: colors.mutedForeground, textAlign: "center",
      marginTop: 4,
    },
    dotsRow: {
      flexDirection: "row", gap: 14, marginTop: 36,
    },
    dot: {
      width: 14, height: 14, borderRadius: 7,
      borderWidth: 1.5,
    },
    dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
    dotEmpty: { backgroundColor: "transparent", borderColor: colors.border },
    dotError: { borderColor: "#EF4444" },
    error: {
      fontSize: 13, fontFamily: "Inter_500Medium",
      color: "#EF4444", textAlign: "center", marginTop: 16,
      minHeight: 18,
    },
    keypad: { width: "100%", gap: 12 },
    keyRow: { flexDirection: "row", justifyContent: "center", gap: 20 },
    key: {
      width: 76, height: 76, borderRadius: 38,
      alignItems: "center", justifyContent: "center",
      backgroundColor: colors.card,
      borderWidth: 1, borderColor: colors.border,
    },
    keyText: {
      fontSize: 24, fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    keyEmpty: { backgroundColor: "transparent", borderColor: "transparent" },
    cancelBtn: {
      marginTop: 8, paddingVertical: 10, alignSelf: "center",
    },
    cancelText: {
      fontSize: 15, fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
  });

  const hasError = !!error;

  return (
    <Modal visible={visible} animationType={animationType} statusBarTranslucent>
      <View style={s.overlay}>
        <View style={s.inner}>
          {/* Top */}
          <View style={s.topSection}>
            <View style={s.lockIcon}>
              <Icon name="lock-closed" size={28} color={colors.primary} />
            </View>
            <Text style={s.title}>{title}</Text>
            {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
            <Animated.View style={[s.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    s.dot,
                    i < digits.length ? s.dotFilled : s.dotEmpty,
                    hasError && i < PIN_LENGTH ? s.dotError : undefined,
                  ]}
                />
              ))}
            </Animated.View>
            <Text style={s.error}>{error}</Text>
          </View>

          {/* Keypad */}
          <View style={s.keypad}>
            {([
              ["1", "2", "3"],
              ["4", "5", "6"],
              ["7", "8", "9"],
            ] as string[][]).map((row, ri) => (
              <View key={ri} style={s.keyRow}>
                {row.map((k) => (
                  <TouchableOpacity key={k} style={s.key} onPress={() => pressKey(k)} activeOpacity={0.65}>
                    <Text style={s.keyText}>{k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
            <View style={s.keyRow}>
              <View style={[s.key, s.keyEmpty]} />
              <TouchableOpacity style={s.key} onPress={() => pressKey("0")} activeOpacity={0.65}>
                <Text style={s.keyText}>0</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.key} onPress={pressDelete} activeOpacity={0.65}>
                <Icon name="backspace-outline" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            {onCancel && (
              <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
