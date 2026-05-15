import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import {
  addCustomToken,
  VERIFIED_TOKENS,
  type VerifiedToken,
} from "@/services/tokens";

type Panel = "popular" | "custom";

type Props = {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
};

export function AddTokenModal({ visible, onClose, onAdded }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [panel, setPanel] = useState<Panel>("popular");
  const [search, setSearch] = useState("");
  const [selectedVerified, setSelectedVerified] = useState<VerifiedToken | null>(null);

  // Popular → contract entry step
  const [contractInput, setContractInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Custom form
  const [cAddress, setCAddress] = useState("");
  const [cSymbol, setCSymbol] = useState("");
  const [cName, setCName] = useState("");
  const [cDecimals, setCDecimals] = useState("18");

  const slideAnim = useRef(new Animated.Value(500)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setPanel("popular");
      setSearch("");
      setSelectedVerified(null);
      setContractInput("");
      setError("");
      setCAddress(""); setCSymbol(""); setCName(""); setCDecimals("18");
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 320, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
        Animated.timing(overlayOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 500, duration: 260, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
        Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredVerified = VERIFIED_TOKENS.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.symbol.toLowerCase().includes(search.toLowerCase())
  );

  function isValidAddress(addr: string) {
    return /^0x[0-9a-fA-F]{40}$/.test(addr.trim());
  }

  async function handleAddVerified() {
    if (!selectedVerified) return;
    const addr = contractInput.trim();
    if (!isValidAddress(addr)) {
      setError("Enter a valid contract address (0x…)");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await addCustomToken({
        contractAddress: addr,
        symbol: selectedVerified.symbol,
        name: selectedVerified.name,
        decimals: selectedVerified.decimals,
        logoUrl: selectedVerified.logoUrl,
        verified: true,
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onAdded();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleAddCustom() {
    const addr = cAddress.trim();
    if (!isValidAddress(addr)) { setError("Enter a valid contract address (0x…)"); return; }
    if (!cSymbol.trim()) { setError("Symbol is required"); return; }
    if (!cName.trim()) { setError("Name is required"); return; }
    const dec = parseInt(cDecimals, 10);
    if (isNaN(dec) || dec < 0 || dec > 18) { setError("Decimals must be 0–18"); return; }
    setSaving(true);
    setError("");
    try {
      await addCustomToken({
        contractAddress: addr,
        symbol: cSymbol.trim().toUpperCase(),
        name: cName.trim(),
        decimals: dec,
        verified: false,
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onAdded();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1,
      borderColor: colors.border,
      paddingBottom: insets.bottom + 8,
      maxHeight: "92%",
    },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginTop: 12, marginBottom: 4 },
    sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    sheetTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    panelRow: { flexDirection: "row", marginHorizontal: 20, marginTop: 14, marginBottom: 4, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 4 },
    panelBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" },
    panelBtnActive: { backgroundColor: colors.primary + "20", borderWidth: 1, borderColor: colors.primary + "50" },
    panelBtnText: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    panelBtnTextActive: { fontFamily: "Inter_700Bold", color: colors.primary },
    searchWrap: { marginHorizontal: 20, marginTop: 12, marginBottom: 4, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10 },
    searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground },
    sectionLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.5, marginTop: 14, marginBottom: 8, marginHorizontal: 20 },
    tokenItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border + "60" },
    tokenLogo: { width: 36, height: 36, borderRadius: 18 },
    tokenLogoFallback: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    tokenLogoText: { fontSize: 10, fontFamily: "Inter_700Bold", color: colors.primary },
    tokenItemInfo: { flex: 1 },
    tokenItemName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    tokenItemSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 },
    verifiedBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: "#10B98115", borderWidth: 1, borderColor: "#10B98140" },
    verifiedText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#10B981", letterSpacing: 0.6 },
    contractStep: { paddingHorizontal: 20, paddingTop: 4 },
    backRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14, marginTop: 8 },
    backText: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    selectedTokenCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 16 },
    fieldLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.2, marginBottom: 6 },
    fieldInput: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, marginBottom: 14 },
    fieldHint: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginBottom: 16, marginTop: -10 },
    errorText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#EF4444", marginBottom: 12 },
    primaryBtn: { borderRadius: 14, overflow: "hidden", marginBottom: 8, marginTop: 4 },
    primaryGrad: { paddingVertical: 15, alignItems: "center", justifyContent: "center" },
    primaryBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
    row2: { flexDirection: "row", gap: 10 },
    halfInput: { flex: 1 },
  });

  const body = (
    <>
      {/* Panel switcher */}
      <View style={s.panelRow}>
        {(["popular", "custom"] as Panel[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[s.panelBtn, panel === p && s.panelBtnActive]}
            onPress={() => { setPanel(p); setSelectedVerified(null); setError(""); }}
            activeOpacity={0.8}
          >
            <Text style={[s.panelBtnText, panel === p && s.panelBtnTextActive]}>
              {p === "popular" ? "Popular" : "Custom"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Popular panel */}
      {panel === "popular" && !selectedVerified && (
        <>
          <View style={s.searchWrap}>
            <Icon name="search" size={15} color={colors.mutedForeground} />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search tokens…"
              placeholderTextColor={colors.mutedForeground}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Icon name="close" size={13} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
          <Text style={s.sectionLabel}>VERIFIED TOKENS</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {filteredVerified.map((token) => (
              <TouchableOpacity
                key={token.coingeckoId}
                style={s.tokenItem}
                onPress={async () => {
                  if (token.contractAddress) {
                    setSaving(true);
                    setError("");
                    try {
                      await addCustomToken({
                        contractAddress: token.contractAddress,
                        symbol: token.symbol,
                        name: token.name,
                        decimals: token.decimals,
                        logoUrl: token.logoUrl,
                        verified: true,
                      });
                      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      onAdded();
                      onClose();
                    } finally {
                      setSaving(false);
                    }
                  } else {
                    setSelectedVerified(token);
                    setContractInput("");
                    setError("");
                  }
                }}
                activeOpacity={0.75}
              >
                <Image
                  source={{ uri: token.logoUrl }}
                  style={s.tokenLogo}
                  defaultSource={undefined}
                  onError={() => {}}
                />
                <View style={s.tokenItemInfo}>
                  <Text style={s.tokenItemName}>{token.symbol}</Text>
                  <Text style={s.tokenItemSub}>{token.name}</Text>
                </View>
                <View style={s.verifiedBadge}>
                  <Text style={s.verifiedText}>VERIFIED</Text>
                </View>
                <Icon name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            ))}
            {filteredVerified.length === 0 && (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <Text style={[s.tokenItemSub, { textAlign: "center" }]}>No tokens match "{search}"</Text>
              </View>
            )}
          </ScrollView>
        </>
      )}

      {/* Popular → contract address step */}
      {panel === "popular" && selectedVerified && (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={s.contractStep}>
            <TouchableOpacity style={s.backRow} onPress={() => setSelectedVerified(null)}>
              <Icon name="arrow-back" size={15} color={colors.mutedForeground} />
              <Text style={s.backText}>Back to popular tokens</Text>
            </TouchableOpacity>

            <View style={s.selectedTokenCard}>
              <Image source={{ uri: selectedVerified.logoUrl }} style={s.tokenLogo} />
              <View style={{ flex: 1 }}>
                <Text style={s.tokenItemName}>{selectedVerified.symbol}</Text>
                <Text style={s.tokenItemSub}>{selectedVerified.name} · {selectedVerified.decimals} decimals</Text>
              </View>
              <View style={s.verifiedBadge}>
                <Text style={s.verifiedText}>VERIFIED</Text>
              </View>
            </View>

            <Text style={s.fieldLabel}>CONTRACT ADDRESS ON MCHAIN</Text>
            <TextInput
              style={s.fieldInput}
              value={contractInput}
              onChangeText={(v) => { setContractInput(v); setError(""); }}
              placeholder="0x…"
              placeholderTextColor={colors.mutedForeground}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <Text style={s.fieldHint}>Paste the {selectedVerified.symbol} contract address deployed on MChain (Chain ID 1888).</Text>

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[s.primaryBtn, saving && { opacity: 0.65 }]}
              onPress={handleAddVerified}
              disabled={saving}
              activeOpacity={0.85}
            >
              <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
                <Text style={s.primaryBtnText}>Add {selectedVerified.symbol}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Custom panel */}
      {panel === "custom" && (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={s.contractStep}>
            <View style={{ height: 10 }} />
            <Text style={s.fieldLabel}>CONTRACT ADDRESS</Text>
            <TextInput style={s.fieldInput} value={cAddress} onChangeText={(v) => { setCAddress(v); setError(""); }} placeholder="0x…" placeholderTextColor={colors.mutedForeground} autoCorrect={false} autoCapitalize="none" />

            <View style={s.row2}>
              <View style={s.halfInput}>
                <Text style={s.fieldLabel}>SYMBOL</Text>
                <TextInput style={s.fieldInput} value={cSymbol} onChangeText={(v) => { setCSymbol(v); setError(""); }} placeholder="e.g. USDT" placeholderTextColor={colors.mutedForeground} autoCapitalize="characters" />
              </View>
              <View style={s.halfInput}>
                <Text style={s.fieldLabel}>DECIMALS</Text>
                <TextInput style={s.fieldInput} value={cDecimals} onChangeText={(v) => { setCDecimals(v); setError(""); }} placeholder="18" placeholderTextColor={colors.mutedForeground} keyboardType="numeric" />
              </View>
            </View>

            <Text style={s.fieldLabel}>TOKEN NAME</Text>
            <TextInput style={s.fieldInput} value={cName} onChangeText={(v) => { setCName(v); setError(""); }} placeholder="e.g. Tether USD" placeholderTextColor={colors.mutedForeground} />

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[s.primaryBtn, saving && { opacity: 0.65 }]}
              onPress={handleAddCustom}
              disabled={saving}
              activeOpacity={0.85}
            >
              <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.primaryGrad}>
                <Text style={s.primaryBtnText}>Add Custom Token</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[s.overlay, { opacity: overlayOpacity }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={s.handle} />
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Add Token</Text>
            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
              <Icon name="close" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          {body}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
