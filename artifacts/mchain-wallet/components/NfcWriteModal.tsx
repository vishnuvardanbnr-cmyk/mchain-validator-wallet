import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  encryptPrivateKey,
  writeWalletToNfc,
  isNfcSupported,
  isNfcEnabled,
  cancelNfc,
  type NfcWalletPayload,
} from "@/services/nfc";

type Status = "pin" | "waiting" | "writing" | "success" | "error" | "unsupported";

interface Props {
  visible: boolean;
  privateKey: string;
  mxcAddress: string;
  publicKey: string;
  label: string;
  onClose: () => void;
  onSuccess: () => void;
}

const PIN_LENGTH = 6;

export function NfcWriteModal({ visible, privateKey, mxcAddress, publicKey, label, onClose, onSuccess }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [status, setStatus] = useState<Status>("pin");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinStep, setPinStep] = useState<"enter" | "confirm">("enter");
  const [errorMsg, setErrorMsg] = useState("");

  const slideAnim = useRef(new Animated.Value(500)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      setStatus("pin");
      setPin("");
      setConfirmPin("");
      setPinStep("enter");
      setErrorMsg("");
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 320, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
        Animated.timing(overlayOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
      checkNfcSupport();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 500, duration: 260, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
        Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status === "waiting") {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function checkNfcSupport() {
    const supported = await isNfcSupported();
    if (!supported) { setStatus("unsupported"); return; }
    const enabled = await isNfcEnabled();
    if (!enabled) { setStatus("unsupported"); setErrorMsg("NFC is disabled. Enable it in your phone settings."); }
  }

  function handleKeyPress(key: string) {
    if (pinStep === "enter") {
      if (key === "DEL") { setPin(p => p.slice(0, -1)); return; }
      if (pin.length >= PIN_LENGTH) return;
      const next = pin + key;
      setPin(next);
      if (next.length === PIN_LENGTH) {
        setTimeout(() => setPinStep("confirm"), 150);
      }
    } else {
      if (key === "DEL") { setConfirmPin(p => p.slice(0, -1)); return; }
      if (confirmPin.length >= PIN_LENGTH) return;
      const next = confirmPin + key;
      setConfirmPin(next);
      if (next.length === PIN_LENGTH) {
        setTimeout(() => handlePinConfirmed(pin, next), 150);
      }
    }
  }

  async function handlePinConfirmed(enteredPin: string, confirmed: string) {
    if (enteredPin !== confirmed) {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMsg("PINs don't match. Try again.");
      setPin("");
      setConfirmPin("");
      setPinStep("enter");
      return;
    }
    setErrorMsg("");
    setStatus("waiting");
    try {
      const { enc, iv } = await encryptPrivateKey(privateKey, enteredPin);
      const payload: NfcWalletPayload = { v: 1, enc, iv, addr: mxcAddress, pub: publicKey, label };
      setStatus("writing");
      await writeWalletToNfc(payload);
      setStatus("success");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Write failed. Try again.");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  function handleClose() {
    cancelNfc().catch(() => {});
    onClose();
  }

  const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28,
      borderTopWidth: 1, borderColor: colors.border, paddingBottom: insets.bottom + 8, maxHeight: "90%",
    },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginTop: 12, marginBottom: 4 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    body: { padding: 24, alignItems: "center" },
    pinLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginBottom: 6, textAlign: "center" },
    pinTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 20, textAlign: "center" },
    dots: { flexDirection: "row", gap: 14, marginBottom: 28 },
    dot: { width: 14, height: 14, borderRadius: 7 },
    dotFilled: { backgroundColor: colors.primary },
    dotEmpty: { backgroundColor: colors.border },
    keypad: { width: "100%", gap: 10 },
    keyRow: { flexDirection: "row", justifyContent: "center", gap: 10 },
    key: { width: 88, height: 72, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    keyNum: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
    keySub: { fontSize: 9, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.5 },
    keyDel: { backgroundColor: "transparent", borderColor: "transparent" },
    errorText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#EF4444", textAlign: "center", marginBottom: 12 },
    nfcIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 20 },
    waitingText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground, textAlign: "center", marginBottom: 8 },
    waitingSubtext: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", lineHeight: 20, marginBottom: 24 },
    successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#10B98120", borderWidth: 1, borderColor: "#10B98140", alignItems: "center", justifyContent: "center", marginBottom: 20 },
    successText: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center", marginBottom: 8 },
    successSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", marginBottom: 28, lineHeight: 20 },
    doneBtn: { width: "100%", borderRadius: 14, overflow: "hidden" },
    doneGrad: { paddingVertical: 15, alignItems: "center", justifyContent: "center" },
    doneBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFF" },
    retryBtn: { width: "100%", borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingVertical: 14, alignItems: "center", marginBottom: 12 },
    retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    cancelText: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground, paddingVertical: 10 },
  });

  const KEYS = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["", "0", "DEL"],
  ];

  const SUB: Record<string, string> = { "2": "ABC", "3": "DEF", "4": "GHI", "5": "JKL", "6": "MNO", "7": "PQRS", "8": "TUV", "9": "WXYZ" };

  const currentPin = pinStep === "enter" ? pin : confirmPin;

  function renderContent() {
    if (status === "unsupported") {
      return (
        <View style={s.body}>
          <View style={[s.successIcon, { backgroundColor: "#EF444420", borderColor: "#EF444440" }]}>
            <Icon name="wifi-outline" size={36} color="#EF4444" />
          </View>
          <Text style={s.waitingText}>NFC Not Available</Text>
          <Text style={s.waitingSubtext}>{errorMsg || "This device doesn't support NFC or it's not enabled."}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={handleClose}>
            <Text style={s.retryText}>Close</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (status === "pin") {
      return (
        <View style={s.body}>
          <Text style={s.pinLabel}>{pinStep === "enter" ? "STEP 1 OF 2" : "STEP 2 OF 2"}</Text>
          <Text style={s.pinTitle}>{pinStep === "enter" ? "Set NFC Card PIN" : "Confirm PIN"}</Text>
          {!!errorMsg && <Text style={s.errorText}>{errorMsg}</Text>}
          <View style={s.dots}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View key={i} style={[s.dot, i < currentPin.length ? s.dotFilled : s.dotEmpty]} />
            ))}
          </View>
          <View style={s.keypad}>
            {KEYS.map((row, ri) => (
              <View key={ri} style={s.keyRow}>
                {row.map((k, ki) => {
                  if (!k) return <View key={ki} style={s.key} />;
                  return (
                    <TouchableOpacity key={ki} style={[s.key, k === "DEL" && s.keyDel]} onPress={() => handleKeyPress(k)} activeOpacity={0.65}>
                      {k === "DEL" ? (
                        <Icon name="backspace-outline" size={22} color={colors.foreground} />
                      ) : (
                        <>
                          <Text style={s.keyNum}>{k}</Text>
                          {SUB[k] && <Text style={s.keySub}>{SUB[k]}</Text>}
                        </>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={handleClose} style={{ marginTop: 16 }}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (status === "waiting" || status === "writing") {
      return (
        <View style={s.body}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <LinearGradient colors={["#0EA5E9", "#6366F1"]} style={s.nfcIcon}>
              {status === "writing"
                ? <ActivityIndicator color="#FFF" size="large" />
                : <Icon name="wifi-outline" size={36} color="#FFF" />
              }
            </LinearGradient>
          </Animated.View>
          <Text style={s.waitingText}>{status === "writing" ? "Writing to card…" : "Hold card to phone"}</Text>
          <Text style={s.waitingSubtext}>
            {status === "writing"
              ? "Keep the card still until writing is complete."
              : "Place your NFC card flat against the back of your phone to write the encrypted wallet."}
          </Text>
          <TouchableOpacity onPress={handleClose}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (status === "success") {
      return (
        <View style={s.body}>
          <View style={s.successIcon}>
            <Icon name="checkmark-circle" size={40} color="#10B981" />
          </View>
          <Text style={s.successText}>Wallet saved to card!</Text>
          <Text style={s.successSub}>
            Your encrypted wallet is now on the NFC card. Tap it on the home screen to load it. Never lose your PIN — without it the card cannot be decrypted.
          </Text>
          <TouchableOpacity style={s.doneBtn} onPress={() => { onSuccess(); onClose(); }} activeOpacity={0.85}>
            <LinearGradient colors={["#10B981", "#059669"]} style={s.doneGrad}>
              <Text style={s.doneBtnText}>Done</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      );
    }

    if (status === "error") {
      return (
        <View style={s.body}>
          <View style={[s.successIcon, { backgroundColor: "#EF444420", borderColor: "#EF444440" }]}>
            <Icon name="close-circle" size={40} color="#EF4444" />
          </View>
          <Text style={s.waitingText}>Write Failed</Text>
          <Text style={s.waitingSubtext}>{errorMsg}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setStatus("waiting"); setConfirmPin(""); setPinStep("enter"); setPin(""); }}>
            <Text style={s.retryText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClose}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.75)", opacity: overlayOpacity }]} pointerEvents="none" />
      <View style={s.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
        <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={s.handle} />
          <View style={s.header}>
            <Text style={s.title}>Save to NFC Card</Text>
            <TouchableOpacity style={s.closeBtn} onPress={handleClose}>
              <Icon name="close" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          {renderContent()}
        </Animated.View>
      </View>
    </Modal>
  );
}
