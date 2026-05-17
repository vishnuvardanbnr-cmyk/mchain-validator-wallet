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
import { mnemonicToKeyPair } from "@/services/crypto";

type ScanStatus = "idle" | "scanning" | "pinentry" | "decrypting" | "success" | "error" | "unsupported";

const PIN_LENGTH = 6;

export function NfcWalletCard() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addWallet, switchWallet } = useWallet();

  const [nfcSupported, setNfcSupported] = useState<boolean | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [scannedPayload, setScannedPayload] = useState<NfcWalletPayload | null>(null);
  const [pin, setPin] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(500)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    isNfcSupported().then(setNfcSupported);
  }, []);

  useEffect(() => {
    if (scanStatus === "scanning") {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [scanStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  function openModal() {
    setModalVisible(true);
    setScanStatus("idle");
    setScannedPayload(null);
    setPin("");
    setErrorMsg("");
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 320, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(overlayOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start(() => startScan());
  }

  function closeModal() {
    cancelNfc().catch(() => {});
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 500, duration: 260, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setModalVisible(false));
  }

  async function startScan() {
    setScanStatus("scanning");
    setErrorMsg("");
    try {
      const payload = await readWalletFromNfc();
      if (!payload) {
        setScanStatus("error");
        setErrorMsg("No wallet found on this card. Make sure you're using an MChain wallet card.");
        return;
      }
      setScannedPayload(payload);
      setScanStatus("pinentry");
      setPin("");
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      setScanStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Scan failed. Try again.");
    }
  }

  function handleKeyPress(key: string) {
    if (key === "DEL") { setPin(p => p.slice(0, -1)); return; }
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + key;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      setTimeout(() => handleDecrypt(next), 150);
    }
  }

  async function handleDecrypt(enteredPin: string) {
    if (!scannedPayload) return;
    setScanStatus("decrypting");
    try {
      const privateKey = await decryptPrivateKey(scannedPayload.enc, scannedPayload.iv, enteredPin);
      if (!privateKey || privateKey.length < 60) throw new Error("Wrong PIN");
      const { generateKeyPair: _unused, ...rest } = await import("@/services/crypto");
      const kp = rest.mnemonicToKeyPair ? rest.mnemonicToKeyPair("") : null;
      const { privKeyBytesToKeyPair: _2, hexToBytes } = await import("@/services/crypto");
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
        ethAddress,
        mxcAddress,
      };

      const entry = await addWallet(keypair, scannedPayload.label || "NFC Wallet");
      await switchWallet(entry.id);
      setScanStatus("success");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setScanStatus("error");
      setErrorMsg("Wrong PIN. The card could not be decrypted.");
      setPin("");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  const s = StyleSheet.create({
    card: {
      marginHorizontal: 16, marginBottom: 16, borderRadius: 20,
      borderWidth: 1, borderColor: colors.border, overflow: "hidden",
    },
    cardInner: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
    iconWrap: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
    textWrap: { flex: 1 },
    cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 2 },
    cardSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 17 },
    arrowWrap: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28,
      borderTopWidth: 1, borderColor: colors.border, paddingBottom: insets.bottom + 8,
    },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginTop: 12, marginBottom: 4 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    body: { padding: 24, alignItems: "center" },
    nfcIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 20 },
    bigText: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center", marginBottom: 8 },
    subText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", lineHeight: 20, marginBottom: 24 },
    cancelText: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground, paddingVertical: 10 },
    pinLabel: { fontSize: 11, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 1.5, marginBottom: 4, textAlign: "center" },
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
    primaryBtn: { width: "100%", borderRadius: 14, overflow: "hidden", marginBottom: 12 },
    primaryGrad: { paddingVertical: 15, alignItems: "center", justifyContent: "center" },
    primaryBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFF" },
    retryBtn: { width: "100%", borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, paddingVertical: 14, alignItems: "center", marginBottom: 12 },
    retryText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    errorText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#EF4444", textAlign: "center", marginBottom: 12 },
  });

  const KEYS = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["", "0", "DEL"]];
  const SUB: Record<string, string> = { "2": "ABC", "3": "DEF", "4": "GHI", "5": "JKL", "6": "MNO", "7": "PQRS", "8": "TUV", "9": "WXYZ" };

  if (nfcSupported === false) return null;

  function renderSheetContent() {
    if (scanStatus === "scanning") {
      return (
        <View style={s.body}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <LinearGradient colors={["#0EA5E9", "#6366F1"]} style={s.nfcIcon}>
              <Icon name="wifi-outline" size={36} color="#FFF" />
            </LinearGradient>
          </Animated.View>
          <Text style={s.bigText}>Hold card to phone</Text>
          <Text style={s.subText}>Place your NFC wallet card flat against the back of your phone.</Text>
          <TouchableOpacity onPress={closeModal}><Text style={s.cancelText}>Cancel</Text></TouchableOpacity>
        </View>
      );
    }

    if (scanStatus === "pinentry") {
      return (
        <View style={s.body}>
          <Text style={s.pinLabel}>ENTER CARD PIN</Text>
          <Text style={s.pinTitle}>{scannedPayload?.label || "NFC Wallet"}</Text>
          {!!errorMsg && <Text style={s.errorText}>{errorMsg}</Text>}
          <View style={s.dots}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View key={i} style={[s.dot, i < pin.length ? s.dotFilled : s.dotEmpty]} />
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
          <TouchableOpacity onPress={closeModal} style={{ marginTop: 16 }}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (scanStatus === "decrypting") {
      return (
        <View style={s.body}>
          <LinearGradient colors={["#0EA5E9", "#6366F1"]} style={s.nfcIcon}>
            <ActivityIndicator color="#FFF" size="large" />
          </LinearGradient>
          <Text style={s.bigText}>Decrypting…</Text>
          <Text style={s.subText}>Verifying your PIN and loading the wallet.</Text>
        </View>
      );
    }

    if (scanStatus === "success") {
      return (
        <View style={s.body}>
          <View style={[s.nfcIcon, { backgroundColor: "#10B98120", borderWidth: 1, borderColor: "#10B98140" }]}>
            <Icon name="checkmark-circle" size={40} color="#10B981" />
          </View>
          <Text style={s.bigText}>Wallet Loaded!</Text>
          <Text style={s.subText}>
            {scannedPayload?.label || "NFC Wallet"} has been added and is now your active wallet.
          </Text>
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
          <View style={[s.nfcIcon, { backgroundColor: "#EF444420", borderWidth: 1, borderColor: "#EF444440" }]}>
            <Icon name="close-circle" size={40} color="#EF4444" />
          </View>
          <Text style={s.bigText}>Failed</Text>
          <Text style={s.subText}>{errorMsg}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setPin(""); setErrorMsg(""); startScan(); }}>
            <Text style={s.retryText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={closeModal}><Text style={s.cancelText}>Cancel</Text></TouchableOpacity>
        </View>
      );
    }

    return null;
  }

  return (
    <>
      <TouchableOpacity onPress={openModal} activeOpacity={0.78} style={s.card}>
        <LinearGradient colors={["#6366F110", "#0EA5E910"]} style={s.cardInner}>
          <LinearGradient colors={["#6366F1", "#0EA5E9"]} style={s.iconWrap}>
            <Icon name="wifi-outline" size={26} color="#FFF" />
          </LinearGradient>
          <View style={s.textWrap}>
            <Text style={s.cardTitle}>NFC Wallet Card</Text>
            <Text style={s.cardSub}>Tap to load a wallet stored on your NFC card</Text>
          </View>
          <LinearGradient colors={["#6366F1", "#0EA5E9"]} style={s.arrowWrap}>
            <Icon name="wifi-outline" size={18} color="#FFF" />
          </LinearGradient>
        </LinearGradient>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="none" onRequestClose={closeModal} statusBarTranslucent>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.75)", opacity: overlayOpacity }]} pointerEvents="none" />
        <View style={s.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeModal} />
          <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
            <View style={s.handle} />
            <View style={s.header}>
              <Text style={s.title}>NFC Wallet Card</Text>
              <TouchableOpacity style={s.closeBtn} onPress={closeModal}>
                <Icon name="close" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {renderSheetContent()}
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}
