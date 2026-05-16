import { Icon } from "@/components/Icon";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { mxcAddress, ethAddress, publicKey, moniker, updateMoniker, getPrivateKey } = useWallet();

  const [editingMoniker, setEditingMoniker] = useState(false);
  const [monikerInput, setMonikerInput] = useState(moniker);
  const [keyVisible, setKeyVisible] = useState(false);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState(false);

  // Node URL state
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
    try {
      new URL(url);
    } catch {
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
    Alert.alert(
      "Reset to Default",
      `Switch back to the official MChain node?\n\n${DEFAULT_NODE_URL}`,
      [
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
      ]
    );
  }

  async function handleRevealKey() {
    if (keyVisible) {
      setKeyVisible(false);
      setPrivateKey(null);
      return;
    }

    Alert.alert(
      "Reveal Private Key",
      "Your private key gives full access to your wallet. Never share it with anyone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reveal",
          style: "destructive",
          onPress: async () => {
            setLoadingKey(true);
            try {
              const key = await getPrivateKey();
              setPrivateKey(key);
              setKeyVisible(true);
            } finally {
              setLoadingKey(false);
            }
          },
        },
      ]
    );
  }

  async function handleExportKey() {
    Alert.alert(
      "Export Private Key",
      "This will copy your private key to the clipboard. Make sure no one can see your screen.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Copy Key",
          style: "destructive",
          onPress: async () => {
            const key = await getPrivateKey();
            if (key) {
              await Clipboard.setStringAsync(key);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              Alert.alert("Copied", "Private key copied to clipboard");
            }
          },
        },
      ]
    );
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24 },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    title: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground },
    section: { marginHorizontal: 20, marginBottom: 20 },
    sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.5, marginBottom: 8 },
    card: { backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    row: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    rowLast: { borderBottomWidth: 0 },
    rowLabel: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground, width: 100 },
    rowValue: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground },
    monikerRow: { flexDirection: "row", alignItems: "center", padding: 16 },
    monikerInput: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
      backgroundColor: colors.input,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.primary,
      marginRight: 8,
    },
    dangerCard: { backgroundColor: "#130000", borderRadius: colors.radius, borderWidth: 1, borderColor: "#EF444430", overflow: "hidden" },
    dangerRow: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#EF444430", gap: 12 },
    dangerRowLast: { borderBottomWidth: 0 },
    dangerText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: "#F87171" },
    keyBox: { backgroundColor: colors.secondary, margin: 16, borderRadius: 8, padding: 12 },
    keyText: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 18, letterSpacing: 0.5 },
    chainRow: { flexDirection: "row", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    chainLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    chainValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    nodeCard: { backgroundColor: colors.card, borderRadius: colors.radius, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    nodeRow: { padding: 16 },
    nodeUrlRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
    nodeUrl: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: colors.foreground },
    nodeActions: { flexDirection: "row", gap: 8 },
    nodeActionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.primary + "15",
      borderWidth: 1,
      borderColor: colors.primary + "35",
    },
    nodeActionText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primary },
    nodeResetBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    nodeResetText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    nodeInput: {
      backgroundColor: colors.input,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.primary + "60",
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      marginBottom: 10,
    },
    nodeEditActions: { flexDirection: "row", gap: 8 },
    nodeSaveBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    nodeSaveBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
    nodeTestBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    nodeTestBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    nodeCancelBtn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
    },
    nodeCancelText: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    nodeStatusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
    nodeStatusDot: { width: 7, height: 7, borderRadius: 4 },
    nodeStatusText: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    customBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: colors.primary + "15",
      borderWidth: 1,
      borderColor: colors.primary + "35",
    },
    customBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: colors.primary, letterSpacing: 0.6 },
  });

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <Text style={s.title}>Settings</Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>VALIDATOR</Text>
          <View style={s.card}>
            <View style={s.monikerRow}>
              <Text style={[s.rowLabel, { alignSelf: "center" }]}>Moniker</Text>
              {editingMoniker ? (
                <>
                  <TextInput
                    style={s.monikerInput}
                    value={monikerInput}
                    onChangeText={(t) => setMonikerInput(t.slice(0, 32))}
                    autoFocus
                    maxLength={32}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={handleSaveMoniker}>
                    <Icon name="checkmark" size={20} color={colors.success} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setEditingMoniker(false); setMonikerInput(moniker); }} style={{ marginLeft: 10 }}>
                    <Icon name="close" size={20} color={colors.destructive} />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={[s.rowValue, { fontSize: 15, fontFamily: "Inter_600SemiBold" }]}>{moniker || "—"}</Text>
                  <TouchableOpacity onPress={() => { setMonikerInput(moniker); setEditingMoniker(true); }}>
                    <Icon name="pencil-outline" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>

        {/* ── Network / Node URL ─────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>NETWORK</Text>
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
                    <TouchableOpacity
                      style={s.nodeActionBtn}
                      onPress={() => { setNodeInput(currentNode); setEditingNode(true); setNodeTestMs(null); setNodeTestError(null); }}
                      activeOpacity={0.75}
                    >
                      <Icon name="pencil-outline" size={13} color={colors.primary} />
                      <Text style={s.nodeActionText}>Change</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.nodeActionBtn}
                      onPress={() => handleTestNode(currentNode)}
                      disabled={testingNode}
                      activeOpacity={0.75}
                    >
                      {testingNode ? (
                        <ActivityIndicator size="small" color={colors.primary} style={{ width: 13, height: 13 }} />
                      ) : (
                        <Icon name="wifi-outline" size={13} color={colors.primary} />
                      )}
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
                        <TouchableOpacity
                          key={n.url}
                          onPress={() => { setNodeInput(n.url); setNodeTestMs(null); setNodeTestError(null); }}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: isActive ? colors.primary : colors.border,
                            backgroundColor: isActive ? colors.primary + "18" : colors.secondary,
                          }}
                        >
                          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: isActive ? colors.primary : colors.mutedForeground }}>
                            {n.label}
                          </Text>
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
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    keyboardType="url"
                    onSubmitEditing={handleSaveNode}
                  />

                  {(nodeTestMs !== null || nodeTestError) && (
                    <View style={[s.nodeStatusRow, { marginBottom: 8, marginTop: -4 }]}>
                      <View style={[s.nodeStatusDot, { backgroundColor: nodeTestError ? "#EF4444" : "#10B981" }]} />
                      <Text style={s.nodeStatusText}>
                        {nodeTestError ? nodeTestError : `Connected · ${nodeTestMs} ms`}
                      </Text>
                    </View>
                  )}

                  <View style={s.nodeEditActions}>
                    <TouchableOpacity
                      style={s.nodeTestBtn}
                      onPress={() => handleTestNode(nodeInput)}
                      disabled={testingNode}
                      activeOpacity={0.75}
                    >
                      {testingNode ? (
                        <ActivityIndicator size="small" color={colors.foreground} />
                      ) : (
                        <Icon name="wifi-outline" size={14} color={colors.foreground} />
                      )}
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

        <View style={s.section}>
          <Text style={s.sectionLabel}>WALLET</Text>
          <View style={s.card}>
            <TouchableOpacity style={s.row} onPress={() => {
              if (mxcAddress) {
                Clipboard.setStringAsync(mxcAddress);
                if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
            }}>
              <Text style={s.rowLabel}>MXC Address</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={s.rowValue} numberOfLines={1}>{mxcAddress ? shortenAddress(mxcAddress, 8) : "—"}</Text>
                <Icon name="copy-outline" size={13} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={s.row} onPress={() => {
              if (ethAddress) {
                Clipboard.setStringAsync(ethAddress);
                if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
            }}>
              <Text style={s.rowLabel}>EVM Address (0x)</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={s.rowValue} numberOfLines={1}>{ethAddress ? shortenAddress(ethAddress, 8) : "—"}</Text>
                <Icon name="copy-outline" size={13} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
            <View style={[s.row, s.rowLast]}>
              <Text style={s.rowLabel}>Public Key</Text>
              <Text style={s.rowValue} numberOfLines={1}>{publicKey ? shortenAddress(publicKey, 8) : "—"}</Text>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>SECURITY</Text>
          <View style={s.dangerCard}>
            <TouchableOpacity style={s.dangerRow} onPress={handleRevealKey}>
              {loadingKey ? (
                <ActivityIndicator color="#F87171" size="small" />
              ) : (
                <Icon name={keyVisible ? "eye-off-outline" : "eye-outline"} size={18} color="#F87171" />
              )}
              <Text style={s.dangerText}>{keyVisible ? "Hide" : "Show"} Private Key</Text>
            </TouchableOpacity>

            {keyVisible && privateKey && (
              <View style={s.keyBox}>
                <Text style={s.keyText} selectable>{privateKey}</Text>
              </View>
            )}

            <TouchableOpacity style={[s.dangerRow, s.dangerRowLast]} onPress={handleExportKey}>
              <Icon name="copy-outline" size={18} color="#F87171" />
              <Text style={s.dangerText}>Export Private Key</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>CHAIN</Text>
          <View style={s.card}>
            <View style={s.chainRow}>
              <Text style={s.chainLabel}>Network</Text>
              <Text style={s.chainValue}>MChain</Text>
            </View>
            <View style={s.chainRow}>
              <Text style={s.chainLabel}>Chain ID</Text>
              <Text style={s.chainValue}>{chainInfo?.chainId ?? "1888"}</Text>
            </View>
            <View style={s.chainRow}>
              <Text style={s.chainLabel}>Block Height</Text>
              <Text style={s.chainValue}>{chainInfo?.blockHeight?.toLocaleString() ?? "—"}</Text>
            </View>
            <View style={[s.chainRow, { borderBottomWidth: 0 }]}>
              <Text style={s.chainLabel}>Gas Price</Text>
              <Text style={s.chainValue}>{chainInfo?.gasPrice ?? "—"}</Text>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <Text style={[s.chainLabel, { textAlign: "center" }]}>MChain Validator Wallet v1.0.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}
