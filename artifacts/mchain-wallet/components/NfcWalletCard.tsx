import React, { useRef, useState, useEffect } from "react";
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
import { useWallet } from "@/context/WalletContext";
import {
  readWalletFromNfc,
  decryptPrivateKey,
  isNfcSupported,
  cancelNfc,
  type NfcWalletPayload,
} from "@/services/nfc";

type ScanStatus = "idle" | "scanning" | "pinentry" | "decrypting" | "success" | "error" | "unsupported";

const PIN_LENGTH = 6;
const KEYS = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["", "0", "DEL"]];
const SUB: Record<string, string> = {
  "2": "ABC", "3": "DEF", "4": "GHI", "5": "JKL",
  "6": "MNO", "7": "PQRS", "8": "TUV", "9": "WXYZ",
};

function NfcRings({ color }: { color: string }) {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    function animateRing(val: Animated.Value, delay: number) {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1, duration: 1800,
            easing: Easing.out(Easing.ease), useNativeDriver: true,
          }),
          Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
    }
    const a1 = animateRing(ring1, 0);
    const a2 = animateRing(ring2, 550);
    const a3 = animateRing(ring3, 1100);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ringStyle = (val: Animated.Value) => ({
    position: "absolute" as const,
    width: 200, height: 200, borderRadius: 100,
    borderWidth: 1.5, borderColor: color,
    opacity: val.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.55, 0] }),
    transform: [{ scale: val.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }) }],
  });

  return (
    <View style={{ width: 200, height: 200, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={ringStyle(ring1)} />
      <Animated.View style={ringStyle(ring2)} />
      <Animated.View style={ringStyle(ring3)} />
    </View>
  );
}

function CardIllustration() {
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -7, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 7, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
    return () => floatAnim.stopAnimation();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View style={{ transform: [{ translateY: floatAnim }] }}>
      <LinearGradient
        colors={["#1e1b4b", "#312e81", "#4338ca"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{
          width: 130, height: 82, borderRadius: 12,
          padding: 12, justifyContent: "space-between",
          shadowColor: "#6366F1", shadowOpacity: 0.5,
          shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
          elevation: 12,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <Icon name="wifi-outline" size={20} color="rgba(255,255,255,0.7)" />
        </View>
        <View>
          <View style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)", marginBottom: 4 }} />
          <View style={{ width: 48, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)" }} />
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export function NfcWalletCard() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addNfcTemporaryWallet, switchWallet } = useWallet();

  const [nfcSupported, setNfcSupported] = useState<boolean | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [scannedPayload, setScannedPayload] = useState<NfcWalletPayload | null>(null);
  const [pin, setPin] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const slideAnim = useRef(new Animated.Value(600)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const successScale = useRef(new Animated.Value(0)).current;
  const cardGlow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    isNfcSupported().then(setNfcSupported);
  }, []);

  useEffect(() => {
    if (nfcSupported) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(cardGlow, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(cardGlow, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    }
  }, [nfcSupported]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scanStatus === "success") {
      Animated.spring(successScale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 6 }).start();
    }
  }, [scanStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  function crossfadeTo(next: ScanStatus) {
    Animated.timing(contentOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setScanStatus(next);
      Animated.timing(contentOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  }

  function shakeError() {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }

  function openModal() {
    successScale.setValue(0);
    setModalVisible(true);
    setScanStatus("idle");
    setScannedPayload(null);
    setPin(""); setErrorMsg("");
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 380, useNativeDriver: true, easing: Easing.out(Easing.back(1.1)) }),
      Animated.timing(overlayOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start(() => {
      // startScan() internally calls crossfadeTo("scanning") — don't call it again here
      startScan();
    });
  }

  function closeModal() {
    cancelNfc().catch(() => {});
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 600, duration: 280, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => setModalVisible(false));
  }

  async function startScan() {
    setPin(""); setErrorMsg("");
    crossfadeTo("scanning");
    try {
      const payload = await readWalletFromNfc();
      if (!payload) {
        crossfadeTo("error");
        setErrorMsg("No wallet found on this card. Make sure it's an MChain NFC card.");
        return;
      }
      setScannedPayload(payload);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      crossfadeTo("pinentry");
    } catch (e) {
      crossfadeTo("error");
      setErrorMsg(e instanceof Error ? e.message : "Scan failed. Try again.");
    }
  }

  function handleKeyPress(key: string) {
    if (key === "DEL") { setPin(p => p.slice(0, -1)); return; }
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + key;
    setPin(next);
    if (next.length === PIN_LENGTH) setTimeout(() => handleDecrypt(next), 180);
  }

  async function handleDecrypt(enteredPin: string) {
    if (!scannedPayload) return;
    crossfadeTo("decrypting");
    try {
      const privateKey = await decryptPrivateKey(scannedPayload.enc, scannedPayload.iv, enteredPin);
      if (!privateKey || privateKey.length < 60) throw new Error("Wrong PIN");

      const { hexToBytes } = await import("@/services/crypto");
      const keyBytes = hexToBytes(privateKey);
      const { secp256k1 } = await import("@noble/curves/secp256k1");
      if (!secp256k1.utils.isValidPrivateKey(keyBytes)) throw new Error("Wrong PIN");

      const { keccak_256 } = await import("@noble/hashes/sha3");
      const { bech32 } = await import("bech32");
      const pubKeyCompressed = secp256k1.getPublicKey(keyBytes, true);
      const pubKeyUncompressed = secp256k1.getPublicKey(keyBytes, false);
      const pubKeyHash = keccak_256(pubKeyUncompressed.slice(1));
      const addressBytes = pubKeyHash.slice(-20);
      const ethAddress = "0x" + Array.from(addressBytes).map(b => b.toString(16).padStart(2, "0")).join("");
      const words = bech32.toWords(addressBytes);
      const mxcAddress = bech32.encode("mxc", words);

      const keypair = {
        privateKey,
        publicKey: Array.from(pubKeyCompressed).map(b => b.toString(16).padStart(2, "0")).join(""),
        ethAddress, mxcAddress,
      };

      const entry = await addNfcTemporaryWallet(keypair, scannedPayload.label || "NFC Wallet");
      await switchWallet(entry.id);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      crossfadeTo("success");
    } catch {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      shakeError();
      setErrorMsg("Wrong PIN. The card could not be decrypted.");
      setPin("");
      crossfadeTo("pinentry");
    }
  }

  const s = StyleSheet.create({
    card: { marginHorizontal: 16, marginBottom: 16, borderRadius: 20, overflow: "hidden" },
    cardBorder: { borderRadius: 20, borderWidth: 1, borderColor: colors.border },
    cardInner: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
    iconWrap: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    textWrap: { flex: 1 },
    cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 2 },
    cardSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 17 },
    arrowWrap: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },

    overlay: { flex: 1, justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 32, borderTopRightRadius: 32,
      borderTopWidth: 1, borderColor: colors.border,
      paddingBottom: insets.bottom + 12,
    },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginTop: 14, marginBottom: 4 },
    header: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 24, paddingVertical: 18,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    title: { fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground },
    closeBtn: {
      width: 34, height: 34, borderRadius: 17, backgroundColor: colors.card,
      borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center",
    },
    body: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8, alignItems: "center" },

    nfcLabel: { fontSize: 11, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 1.5, marginBottom: 6 },
    nfcTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center", marginBottom: 6 },
    nfcSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", lineHeight: 20, marginBottom: 20, paddingHorizontal: 8 },

    pinLabel: { fontSize: 11, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 1.5, marginBottom: 4 },
    pinTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center", marginBottom: 4 },
    pinSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", marginBottom: 16 },
    dots: { flexDirection: "row", gap: 12, marginBottom: 26 },
    dot: { width: 14, height: 14, borderRadius: 7 },
    dotFilled: { backgroundColor: "#6366F1" },
    dotEmpty: { backgroundColor: colors.border },
    dotError: { backgroundColor: "#EF4444" },

    keypad: { width: "100%", gap: 8 },
    keyRow: { flexDirection: "row", justifyContent: "center", gap: 8 },
    key: {
      width: 92, height: 68, borderRadius: 20,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      alignItems: "center", justifyContent: "center",
    },
    keyNum: { fontSize: 24, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    keySub: { fontSize: 8, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 2 },
    keyDel: { backgroundColor: "transparent", borderColor: "transparent" },
    errorText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#EF4444", textAlign: "center", marginBottom: 8 },
    cancelText: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground, paddingVertical: 12 },

    successCircle: {
      width: 88, height: 88, borderRadius: 44,
      backgroundColor: "#10B98115", borderWidth: 1.5, borderColor: "#10B98140",
      alignItems: "center", justifyContent: "center", marginBottom: 20, marginTop: 8,
    },
    successPill: {
      flexDirection: "row", alignItems: "center", gap: 6,
      backgroundColor: "#10B98110", borderWidth: 1, borderColor: "#10B98130",
      borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 28,
    },
    successPillText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#10B981" },
    primaryBtn: { width: "100%", borderRadius: 16, overflow: "hidden", marginBottom: 10 },
    primaryGrad: { paddingVertical: 16, alignItems: "center", justifyContent: "center" },
    primaryBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFF" },
    ghostBtn: { paddingVertical: 10 },
    ghostBtnText: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground, textAlign: "center" },

    errorCircle: {
      width: 88, height: 88, borderRadius: 44,
      backgroundColor: "#EF444415", borderWidth: 1.5, borderColor: "#EF444435",
      alignItems: "center", justifyContent: "center", marginBottom: 20, marginTop: 8,
    },
    retryBtn: {
      width: "100%", borderRadius: 16, borderWidth: 1.5,
      borderColor: colors.border, paddingVertical: 15, alignItems: "center", marginBottom: 10,
    },
    retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
  });

  if (nfcSupported === false) return null;

  function renderSheetContent() {
    if (scanStatus === "scanning") {
      return (
        <View style={s.body}>
          <View style={{ alignItems: "center", justifyContent: "center", marginTop: 8 }}>
            <NfcRings color="#6366F1" />
            <View style={{ position: "absolute" }}>
              <CardIllustration />
            </View>
          </View>
          <Text style={s.nfcLabel}>SCANNING</Text>
          <Text style={s.nfcTitle}>Hold card to phone</Text>
          <Text style={s.nfcSubtitle}>Place your NFC wallet card flat against the back of your phone near the camera area.</Text>
          <TouchableOpacity onPress={closeModal} style={s.ghostBtn}>
            <Text style={s.ghostBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (scanStatus === "pinentry") {
      const hasError = !!errorMsg;
      return (
        <View style={s.body}>
          <LinearGradient colors={["#6366F120", "#6366F108"]} style={{
            width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center",
            borderWidth: 1, borderColor: "#6366F130", marginTop: 8, marginBottom: 16,
          }}>
            <Icon name="lock-closed" size={32} color="#6366F1" />
          </LinearGradient>
          <Text style={s.pinLabel}>ENTER CARD PIN</Text>
          <Text style={s.pinTitle}>{scannedPayload?.label || "NFC Wallet"}</Text>
          <Text style={s.pinSub}>Enter the 6-digit PIN you set when writing this card.</Text>
          {!!errorMsg && <Text style={s.errorText}>{errorMsg}</Text>}
          <Animated.View style={[s.dots, { transform: [{ translateX: shakeAnim }] }]}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View key={i} style={[s.dot, i < pin.length ? (hasError ? s.dotError : s.dotFilled) : s.dotEmpty]} />
            ))}
          </Animated.View>
          <View style={s.keypad}>
            {KEYS.map((row, ri) => (
              <View key={ri} style={s.keyRow}>
                {row.map((k, ki) => {
                  if (!k) return <View key={ki} style={s.key} />;
                  return (
                    <TouchableOpacity key={ki} style={[s.key, k === "DEL" && s.keyDel]} onPress={() => handleKeyPress(k)} activeOpacity={0.6}>
                      {k === "DEL"
                        ? <Icon name="backspace-outline" size={22} color={colors.foreground} />
                        : (<>
                          <Text style={s.keyNum}>{k}</Text>
                          {SUB[k] && <Text style={s.keySub}>{SUB[k]}</Text>}
                        </>)}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={closeModal} style={[s.ghostBtn, { marginTop: 6 }]}>
            <Text style={s.ghostBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (scanStatus === "decrypting") {
      return (
        <View style={s.body}>
          <LinearGradient colors={["#6366F1", "#4F46E5"]} style={[s.successCircle, { backgroundColor: undefined, borderColor: "transparent" }]}>
            <ActivityIndicator color="#FFF" size="large" />
          </LinearGradient>
          <Text style={s.nfcTitle}>Decrypting…</Text>
          <Text style={s.nfcSubtitle}>Verifying your PIN and loading the wallet securely.</Text>
        </View>
      );
    }

    if (scanStatus === "success") {
      return (
        <View style={s.body}>
          <Animated.View style={[s.successCircle, { transform: [{ scale: successScale }] }]}>
            <Icon name="checkmark-circle" size={48} color="#10B981" />
          </Animated.View>
          <Text style={s.nfcTitle}>Wallet Loaded!</Text>
          <Text style={s.nfcSubtitle}>
            {scannedPayload?.label || "NFC Wallet"} has been added and set as your active wallet.
          </Text>
          <View style={s.successPill}>
            <Icon name="shield-checkmark" size={14} color="#10B981" />
            <Text style={s.successPillText}>Decrypted on-device · Key secured</Text>
          </View>
          <TouchableOpacity style={s.primaryBtn} onPress={closeModal} activeOpacity={0.85}>
            <LinearGradient colors={["#10B981", "#059669"]} style={s.primaryGrad}>
              <Text style={s.primaryBtnText}>Open Wallet</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      );
    }

    if (scanStatus === "error") {
      return (
        <View style={s.body}>
          <View style={s.errorCircle}>
            <Icon name="close-circle" size={48} color="#EF4444" />
          </View>
          <Text style={s.nfcTitle}>Scan Failed</Text>
          <Text style={s.nfcSubtitle}>{errorMsg}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setPin(""); setErrorMsg(""); startScan(); }}>
            <Text style={s.retryText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={closeModal} style={s.ghostBtn}>
            <Text style={s.ghostBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  }

  return (
    <>
      <TouchableOpacity onPress={openModal} activeOpacity={0.78} style={s.card}>
        <View style={s.cardBorder}>
          <Animated.View style={{
            ...StyleSheet.absoluteFillObject,
            borderRadius: 20,
            opacity: cardGlow.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.12] }),
            backgroundColor: "#6366F1",
          }} />
          <LinearGradient colors={["#6366F108", "#0EA5E908"]} style={s.cardInner}>
            <LinearGradient colors={["#6366F1", "#0EA5E9"]} style={s.iconWrap}>
              <Icon name="wifi-outline" size={26} color="#FFF" />
            </LinearGradient>
            <View style={s.textWrap}>
              <Text style={s.cardTitle}>Card Vault</Text>
              <Text style={s.cardSub}>Tap to load a wallet from your NFC card</Text>
            </View>
            <LinearGradient colors={["#6366F1", "#0EA5E9"]} style={s.arrowWrap}>
              <Icon name="chevron-forward" size={16} color="#FFF" />
            </LinearGradient>
          </LinearGradient>
        </View>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="none" onRequestClose={closeModal} statusBarTranslucent>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.8)", opacity: overlayOpacity }]} pointerEvents="none" />
        <View style={s.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeModal} />
          <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
            <View style={s.handle} />
            <View style={s.header}>
              <Text style={s.title}>Card Vault</Text>
              <TouchableOpacity style={s.closeBtn} onPress={closeModal}>
                <Icon name="close" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <Animated.View style={{ opacity: contentOpacity }}>
              {renderSheetContent()}
            </Animated.View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}
