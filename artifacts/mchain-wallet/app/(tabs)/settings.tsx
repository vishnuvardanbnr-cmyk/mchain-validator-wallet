import { Icon } from "@/components/Icon";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PinSetupModal } from "@/components/PinSetupModal";
import { hasPin } from "@/services/pin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { api } from "@/services/api";
import { shortenAddress } from "@/services/crypto";
import {
  DEFAULT_NODE_URL,
  getNodeUrl,
  isDefaultNode,
  resetNodeUrl,
  setNodeUrl,
  testNodeConnection,
} from "@/services/node";
import { useColors } from "@/hooks/useColors";

type LegalType = "terms" | "privacy" | null;

async function fetchLegalContent(): Promise<{ terms: string; privacy: string }> {
  try {
    const res = await fetch("/api/legal/content");
    if (!res.ok) return { terms: "", privacy: "" };
    return res.json();
  } catch {
    return { terms: "", privacy: "" };
  }
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { mxcAddress, ethAddress, publicKey, moniker, updateMoniker, getPrivateKey } = useWallet();
  const scrollRef = useRef<ScrollView>(null);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pinSetupMode, setPinSetupMode] = useState<"setup" | "change" | "remove">("setup");

  useEffect(() => {
    hasPin().then(setPinEnabled);
  }, []);

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [])
  );

  const [editingMoniker, setEditingMoniker] = useState(false);
  const [monikerInput, setMonikerInput] = useState(moniker);
  const [keyVisible, setKeyVisible] = useState(false);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState(false);
  const [legalModal, setLegalModal] = useState<LegalType>(null);

  const [currentNode, setCurrentNode] = useState(() => getNodeUrl());
  const [editingNode, setEditingNode] = useState(false);
  const [nodeInput, setNodeInput] = useState(getNodeUrl());
  const [testingNode, setTestingNode] = useState(false);
  const [nodeTestMs, setNodeTestMs] = useState<number | null>(null);
  const [nodeTestError, setNodeTestError] = useState<string | null>(null);

  const FALLBACK_NODES = [
    { label: "Primary", url: "https://api.mxc.org/api" },
    { label: "Node 1", url: "https://5.189.144.115/api" },
    { label: "Node 2", url: "https://62.169.31.67/api" },
    { label: "Node 3", url: "https://217.76.51.75/api" },
  ];

  const { data: chainInfo } = useQuery({
    queryKey: ["chainInfo"],
    queryFn: () => api.getChainInfo(),
    refetchInterval: 30_000,
  });

  const { data: legalContent } = useQuery({
    queryKey: ["legalContent"],
    queryFn: fetchLegalContent,
    staleTime: 60_000,
  });

  async function handleSaveMoniker() {
    await updateMoniker(monikerInput.trim() || moniker);
    setEditingMoniker(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function handleTestNode(url: string) {
    setTestingNode(true);
    setNodeTestMs(null);
    setNodeTestError(null);
    try {
      const ms = await testNodeConnection(url);
      setNodeTestMs(ms);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setNodeTestError(err instanceof Error ? err.message : "Connection failed");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setTestingNode(false);
    }
  }

  async function handleSaveNode() {
    const url = nodeInput.trim().replace(/\/$/, "");
    if (!url) return;
    try { new URL(url); } catch {
      Alert.alert("Invalid URL", "Please enter a valid URL starting with http:// or https://");
      return;
    }
    await setNodeUrl(url);
    setCurrentNode(url);
    setEditingNode(false);
    setNodeTestMs(null);
    setNodeTestError(null);
    queryClient.clear();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  async function handleResetNode() {
    Alert.alert("Reset to Default", `Switch back to the official MChain node?\n\n${DEFAULT_NODE_URL}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        onPress: async () => {
          await resetNodeUrl();
          setCurrentNode(DEFAULT_NODE_URL);
          setNodeInput(DEFAULT_NODE_URL);
          setEditingNode(false);
          setNodeTestMs(null);
          setNodeTestError(null);
          queryClient.clear();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      },
    ]);
  }

  async function handleRevealKey() {
    if (keyVisible) { setKeyVisible(false); setPrivateKey(null); return; }
    Alert.alert("Reveal Private Key", "Your private key gives full access to your wallet. Never share it with anyone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reveal", style: "destructive",
        onPress: async () => {
          setLoadingKey(true);
          try { const key = await getPrivateKey(); setPrivateKey(key); setKeyVisible(true); }
          finally { setLoadingKey(false); }
        },
      },
    ]);
  }

  async function handleExportKey() {
    Alert.alert("Export Private Key", "This will copy your private key to the clipboard. Make sure no one can see your screen.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Copy Key", style: "destructive",
        onPress: async () => {
          const key = await getPrivateKey();
          if (key) {
            await Clipboard.setStringAsync(key);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            Alert.alert("Copied", "Private key copied to clipboard");
          }
        },
      },
    ]);
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 32 },

    // Header
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20,
      paddingBottom: 24,
    },
    headerTop: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
    avatar: {
      width: 48, height: 48, borderRadius: 24,
      backgroundColor: colors.primary + "20",
      borderWidth: 1.5, borderColor: colors.primary + "50",
      alignItems: "center", justifyContent: "center", marginRight: 14,
    },
    avatarText: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.primary },
    headerInfo: { flex: 1 },
    headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground },
    headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 },

    // Sections
    section: { marginHorizontal: 20, marginBottom: 24 },
    sectionHeader: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 10 },
    sectionIcon: { width: 24, height: 24, borderRadius: 7, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center" },
    sectionLabel: { fontSize: 11, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 1.2 },

    // Card
    card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },

    // Row
    row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    rowLast: { borderBottomWidth: 0 },
    rowIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center" },
    rowBody: { flex: 1 },
    rowLabel: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground },
    rowSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 },
    rowRight: { flexDirection: "row", alignItems: "center", gap: 4 },
    rowValue: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    rowChevron: { opacity: 0.5 },

    // Moniker
    monikerInput: {
      flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", color: colors.foreground,
      backgroundColor: colors.input, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
      borderWidth: 1, borderColor: colors.primary, marginRight: 8,
    },

    // Node
    nodeCard: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    nodeRow: { padding: 16 },
    nodeUrlRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
    nodeUrl: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: colors.foreground },
    nodeActions: { flexDirection: "row", gap: 8 },
    nodeActionBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: colors.primary + "15", borderWidth: 1, borderColor: colors.primary + "35" },
    nodeActionText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primary },
    nodeResetBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    nodeResetText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    nodeInput: {
      backgroundColor: colors.input, borderRadius: 10, borderWidth: 1.5, borderColor: colors.primary + "60",
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 12, fontFamily: "Inter_400Regular",
      color: colors.foreground, marginBottom: 10,
    },
    nodeEditActions: { flexDirection: "row", gap: 8 },
    nodeSaveBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primary },
    nodeSaveBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
    nodeTestBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    nodeTestBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    nodeCancelBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
    nodeCancelText: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    nodeStatusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
    nodeStatusDot: { width: 7, height: 7, borderRadius: 4 },
    nodeStatusText: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    customBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.primary + "15", borderWidth: 1, borderColor: colors.primary + "35" },
    customBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: colors.primary, letterSpacing: 0.6 },

    // Danger
    dangerCard: { backgroundColor: "#0d0000", borderRadius: 14, borderWidth: 1, borderColor: "#EF444425", overflow: "hidden" },
    dangerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: "#EF444420" },
    dangerRowLast: { borderBottomWidth: 0 },
    dangerIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#EF444415", alignItems: "center", justifyContent: "center" },
    dangerText: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#F87171" },
    keyBox: { backgroundColor: colors.secondary, marginHorizontal: 16, marginBottom: 12, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
    keyText: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 18, letterSpacing: 0.5 },

    // Version
    version: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" },

    // Legal modal
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    modalSheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "85%", overflow: "hidden" },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground },
    modalBody: { padding: 20 },
    legalText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 22 },
    legalEmpty: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", paddingVertical: 40 },
  });

  const initials = (moniker || "W").slice(0, 2).toUpperCase();

  return (
    <View style={s.container}>
      <ScrollView ref={scrollRef} contentContainerStyle={s.scroll}>

        {/* ── Header ──────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerTop}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials}</Text>
            </View>
            <View style={s.headerInfo}>
              <Text style={s.headerTitle}>{moniker || "My Wallet"}</Text>
              <Text style={s.headerSub}>{mxcAddress ? shortenAddress(mxcAddress, 12) : "No wallet"}</Text>
            </View>
          </View>
        </View>

        {/* ── Validator ────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={s.sectionIcon}><Icon name="medal-outline" size={13} color={colors.primary} /></View>
            <Text style={s.sectionLabel}>VALIDATOR</Text>
          </View>
          <View style={s.card}>
            <View style={[s.row, s.rowLast]}>
              <View style={s.rowIcon}><Icon name="at-circle-outline" size={16} color={colors.mutedForeground} /></View>
              <View style={s.rowBody}>
                <Text style={s.rowLabel}>Moniker</Text>
              </View>
              {editingMoniker ? (
                <>
                  <TextInput
                    style={s.monikerInput}
                    value={monikerInput}
                    onChangeText={(t) => setMonikerInput(t.slice(0, 32))}
                    autoFocus maxLength={32} autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={handleSaveMoniker}>
                    <Icon name="checkmark-circle" size={22} color={colors.success} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setEditingMoniker(false); setMonikerInput(moniker); }} style={{ marginLeft: 8 }}>
                    <Icon name="close-circle" size={22} color={colors.destructive} />
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={s.rowRight} onPress={() => { setMonikerInput(moniker); setEditingMoniker(true); }}>
                  <Text style={s.rowValue}>{moniker || "—"}</Text>
                  <Icon name="pencil-outline" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* ── Network ──────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={s.sectionIcon}><Icon name="wifi-outline" size={13} color={colors.primary} /></View>
            <Text style={s.sectionLabel}>NETWORK</Text>
          </View>
          <View style={s.nodeCard}>
            <View style={s.nodeRow}>
              {!editingNode ? (
                <>
                  <View style={s.nodeUrlRow}>
                    <Text style={s.nodeUrl} numberOfLines={2}>{currentNode}</Text>
                    {!isDefaultNode() && (
                      <View style={s.customBadge}>
                        <Text style={s.customBadgeText}>CUSTOM</Text>
                      </View>
                    )}
                  </View>
                  {(nodeTestMs !== null || nodeTestError) && (
                    <View style={s.nodeStatusRow}>
                      <View style={[s.nodeStatusDot, { backgroundColor: nodeTestError ? "#EF4444" : "#10B981" }]} />
                      <Text style={s.nodeStatusText}>
                        {nodeTestError ? nodeTestError : `Connected · ${nodeTestMs} ms`}
                      </Text>
                    </View>
                  )}
                  <View style={[s.nodeActions, { marginTop: 12 }]}>
                    <TouchableOpacity style={s.nodeActionBtn} onPress={() => { setNodeInput(currentNode); setEditingNode(true); setNodeTestMs(null); setNodeTestError(null); }} activeOpacity={0.75}>
                      <Icon name="pencil-outline" size={13} color={colors.primary} />
                      <Text style={s.nodeActionText}>Change</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.nodeActionBtn} onPress={() => handleTestNode(currentNode)} disabled={testingNode} activeOpacity={0.75}>
                      {testingNode ? <ActivityIndicator size="small" color={colors.primary} style={{ width: 13, height: 13 }} /> : <Icon name="wifi-outline" size={13} color={colors.primary} />}
                      <Text style={s.nodeActionText}>Test</Text>
                    </TouchableOpacity>
                    {!isDefaultNode() && (
                      <TouchableOpacity style={s.nodeResetBtn} onPress={handleResetNode} activeOpacity={0.75}>
                        <Icon name="refresh-outline" size={13} color={colors.mutedForeground} />
                        <Text style={s.nodeResetText}>Reset</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              ) : (
                <>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    {FALLBACK_NODES.map((n) => {
                      const isActive = nodeInput.trim().replace(/\/$/, "") === n.url;
                      return (
                        <TouchableOpacity key={n.url} onPress={() => { setNodeInput(n.url); setNodeTestMs(null); setNodeTestError(null); }}
                          style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: isActive ? colors.primary : colors.border, backgroundColor: isActive ? colors.primary + "18" : colors.secondary }}>
                          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: isActive ? colors.primary : colors.mutedForeground }}>{n.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TextInput
                    style={s.nodeInput}
                    value={nodeInput}
                    onChangeText={(v) => { setNodeInput(v); setNodeTestMs(null); setNodeTestError(null); }}
                    placeholder="https://your-node.example.com/api"
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="none" autoCorrect={false} autoFocus keyboardType="url"
                    onSubmitEditing={handleSaveNode}
                  />
                  {(nodeTestMs !== null || nodeTestError) && (
                    <View style={[s.nodeStatusRow, { marginBottom: 8, marginTop: -4 }]}>
                      <View style={[s.nodeStatusDot, { backgroundColor: nodeTestError ? "#EF4444" : "#10B981" }]} />
                      <Text style={s.nodeStatusText}>{nodeTestError ? nodeTestError : `Connected · ${nodeTestMs} ms`}</Text>
                    </View>
                  )}
                  <View style={s.nodeEditActions}>
                    <TouchableOpacity style={s.nodeTestBtn} onPress={() => handleTestNode(nodeInput)} disabled={testingNode} activeOpacity={0.75}>
                      {testingNode ? <ActivityIndicator size="small" color={colors.foreground} /> : <Icon name="wifi-outline" size={14} color={colors.foreground} />}
                      <Text style={s.nodeTestBtnText}>Test</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.nodeSaveBtn} onPress={handleSaveNode} activeOpacity={0.85}>
                      <Icon name="checkmark" size={14} color="#FFFFFF" />
                      <Text style={s.nodeSaveBtnText}>Save</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.nodeCancelBtn} onPress={() => { setEditingNode(false); setNodeTestMs(null); setNodeTestError(null); }} activeOpacity={0.75}>
                      <Text style={s.nodeCancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </View>

        {/* ── Security ─────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={s.sectionIcon}><Icon name="shield-checkmark-outline" size={13} color={colors.primary} /></View>
            <Text style={s.sectionLabel}>SECURITY</Text>
          </View>
          <View style={s.card}>
            <TouchableOpacity
              style={[s.row, s.rowLast]}
              onPress={() => {
                setPinSetupMode(pinEnabled ? "change" : "setup");
                setShowPinSetup(true);
              }}
              activeOpacity={0.75}
            >
              <View style={s.rowIcon}><Icon name="lock-closed-outline" size={16} color={colors.mutedForeground} /></View>
              <View style={s.rowBody}>
                <Text style={s.rowLabel}>Wallet PIN</Text>
                <Text style={s.rowSub}>{pinEnabled ? "Required to open wallet & send" : "Not set — tap to enable"}</Text>
              </View>
              <View style={s.rowRight}>
                <Text style={[s.rowValue, { color: pinEnabled ? "#10B981" : colors.mutedForeground }]}>
                  {pinEnabled ? "ON" : "OFF"}
                </Text>
                {pinEnabled && (
                  <TouchableOpacity
                    onPress={() => { setPinSetupMode("remove"); setShowPinSetup(true); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ marginLeft: 8 }}
                  >
                    <Icon name="trash-outline" size={14} color={colors.destructive} />
                  </TouchableOpacity>
                )}
                <Icon name="chevron-forward" size={14} color={colors.mutedForeground} style={s.rowChevron} />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Wallet ───────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={s.sectionIcon}><Icon name="wallet-outline" size={13} color={colors.primary} /></View>
            <Text style={s.sectionLabel}>WALLET</Text>
          </View>
          <View style={s.card}>
            <TouchableOpacity style={s.row} onPress={() => {
              if (mxcAddress) { Clipboard.setStringAsync(mxcAddress); if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
            }}>
              <View style={s.rowIcon}><Icon name="location-outline" size={16} color={colors.mutedForeground} /></View>
              <View style={s.rowBody}>
                <Text style={s.rowLabel}>MXC Address</Text>
                <Text style={s.rowSub}>{mxcAddress ? shortenAddress(mxcAddress, 14) : "—"}</Text>
              </View>
              <Icon name="copy-outline" size={14} color={colors.mutedForeground} style={s.rowChevron} />
            </TouchableOpacity>
            <TouchableOpacity style={s.row} onPress={() => {
              if (ethAddress) { Clipboard.setStringAsync(ethAddress); if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
            }}>
              <View style={s.rowIcon}><Icon name="diamond-outline" size={16} color={colors.mutedForeground} /></View>
              <View style={s.rowBody}>
                <Text style={s.rowLabel}>EVM Address (0x)</Text>
                <Text style={s.rowSub}>{ethAddress ? shortenAddress(ethAddress, 14) : "—"}</Text>
              </View>
              <Icon name="copy-outline" size={14} color={colors.mutedForeground} style={s.rowChevron} />
            </TouchableOpacity>
            <View style={[s.row, s.rowLast]}>
              <View style={s.rowIcon}><Icon name="key-outline" size={16} color={colors.mutedForeground} /></View>
              <View style={s.rowBody}>
                <Text style={s.rowLabel}>Public Key</Text>
                <Text style={s.rowSub}>{publicKey ? shortenAddress(publicKey, 14) : "—"}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Chain ────────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={s.sectionIcon}><Icon name="git-branch-outline" size={13} color={colors.primary} /></View>
            <Text style={s.sectionLabel}>CHAIN</Text>
          </View>
          <View style={s.card}>
            {[
              { label: "Network", value: "MChain", icon: "globe-outline" },
              { label: "Chain ID", value: String(chainInfo?.chainId ?? "1888"), icon: "finger-print-outline" },
              { label: "Block Height", value: chainInfo?.blockHeight?.toLocaleString() ?? "—", icon: "cube-outline" },
              { label: "Gas Price", value: String(chainInfo?.gasPrice ?? "—"), icon: "flash-outline" },
            ].map((item, i, arr) => (
              <View key={item.label} style={[s.row, i === arr.length - 1 ? s.rowLast : undefined]}>
                <View style={s.rowIcon}><Icon name={item.icon as never} size={15} color={colors.mutedForeground} /></View>
                <View style={s.rowBody}><Text style={s.rowLabel}>{item.label}</Text></View>
                <Text style={s.rowValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Security ─────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={[s.sectionIcon, { backgroundColor: "#EF444415" }]}><Icon name="shield-outline" size={13} color="#F87171" /></View>
            <Text style={[s.sectionLabel, { color: "#F87171" }]}>SECURITY</Text>
          </View>
          <View style={s.dangerCard}>
            <TouchableOpacity style={s.dangerRow} onPress={handleRevealKey}>
              <View style={s.dangerIcon}>
                {loadingKey ? <ActivityIndicator color="#F87171" size="small" /> : <Icon name={keyVisible ? "eye-off-outline" : "eye-outline"} size={16} color="#F87171" />}
              </View>
              <Text style={[s.dangerText, { flex: 1 }]}>{keyVisible ? "Hide" : "Show"} Private Key</Text>
              <Icon name="chevron-forward" size={14} color="#F8717160" />
            </TouchableOpacity>
            {keyVisible && privateKey && (
              <View style={s.keyBox}>
                <Text style={s.keyText} selectable>{privateKey}</Text>
              </View>
            )}
            <TouchableOpacity style={[s.dangerRow, s.dangerRowLast]} onPress={handleExportKey}>
              <View style={s.dangerIcon}><Icon name="copy-outline" size={16} color="#F87171" /></View>
              <Text style={[s.dangerText, { flex: 1 }]}>Export Private Key</Text>
              <Icon name="chevron-forward" size={14} color="#F8717160" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Legal ────────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={s.sectionIcon}><Icon name="document-text-outline" size={13} color={colors.primary} /></View>
            <Text style={s.sectionLabel}>LEGAL</Text>
          </View>
          <View style={s.card}>
            <TouchableOpacity style={s.row} onPress={() => setLegalModal("terms")}>
              <View style={s.rowIcon}><Icon name="document-outline" size={16} color={colors.mutedForeground} /></View>
              <View style={s.rowBody}><Text style={s.rowLabel}>Terms &amp; Conditions</Text></View>
              <Icon name="chevron-forward" size={14} color={colors.mutedForeground} style={s.rowChevron} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.row, s.rowLast]} onPress={() => setLegalModal("privacy")}>
              <View style={s.rowIcon}><Icon name="shield-checkmark-outline" size={16} color={colors.mutedForeground} /></View>
              <View style={s.rowBody}><Text style={s.rowLabel}>Privacy Policy</Text></View>
              <Icon name="chevron-forward" size={14} color={colors.mutedForeground} style={s.rowChevron} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Version ──────────────────────────────────────────── */}
        <View style={[s.section, { alignItems: "center" }]}>
          <Text style={s.version}>MChain Validator Wallet v1.0.0</Text>
        </View>

      </ScrollView>

      {/* ── Legal Modal ──────────────────────────────────────── */}
      <Modal visible={!!legalModal} transparent animationType="slide" onRequestClose={() => setLegalModal(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { paddingBottom: insets.bottom }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {legalModal === "terms" ? "Terms & Conditions" : "Privacy Policy"}
              </Text>
              <TouchableOpacity onPress={() => setLegalModal(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="close" size={22} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.modalBody}>
              {legalModal === "terms" && (
                legalContent?.terms
                  ? <Text style={s.legalText}>{legalContent.terms}</Text>
                  : <Text style={s.legalEmpty}>No terms have been published yet.</Text>
              )}
              {legalModal === "privacy" && (
                legalContent?.privacy
                  ? <Text style={s.legalText}>{legalContent.privacy}</Text>
                  : <Text style={s.legalEmpty}>No privacy policy has been published yet.</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <PinSetupModal
        visible={showPinSetup}
        mode={pinSetupMode}
        onDone={() => {
          setShowPinSetup(false);
          hasPin().then(setPinEnabled);
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }}
        onCancel={() => setShowPinSetup(false)}
      />
    </View>
  );
}
