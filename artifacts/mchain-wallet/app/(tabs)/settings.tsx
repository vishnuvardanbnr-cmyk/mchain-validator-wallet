import { Feather } from "@expo/vector-icons";
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
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/context/WalletContext";
import { api } from "@/services/api";
import { shortenAddress } from "@/services/crypto";
import { useColors } from "@/hooks/useColors";

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mxcAddress, ethAddress, publicKey, moniker, updateMoniker, getPrivateKey } = useWallet();

  const [editingMoniker, setEditingMoniker] = useState(false);
  const [monikerInput, setMonikerInput] = useState(moniker);
  const [keyVisible, setKeyVisible] = useState(false);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState(false);

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
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 24,
    },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    title: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    section: {
      marginHorizontal: 20,
      marginBottom: 20,
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      letterSpacing: 1.5,
      marginBottom: 8,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    rowLabel: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      width: 100,
    },
    rowValue: {
      flex: 1,
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    monikerRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
    },
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
    dangerCard: {
      backgroundColor: "#130000",
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: "#EF444430",
      overflow: "hidden",
    },
    dangerRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: "#EF444430",
      gap: 12,
    },
    dangerRowLast: {
      borderBottomWidth: 0,
    },
    dangerText: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: "#F87171",
    },
    keyBox: {
      backgroundColor: colors.secondary,
      margin: 16,
      borderRadius: 8,
      padding: 12,
    },
    keyText: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 18,
      letterSpacing: 0.5,
    },
    chainRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    chainLabel: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    chainValue: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
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
                    <Feather name="check" size={20} color={colors.success} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setEditingMoniker(false); setMonikerInput(moniker); }} style={{ marginLeft: 10 }}>
                    <Feather name="x" size={20} color={colors.destructive} />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={[s.rowValue, { fontSize: 15, fontFamily: "Inter_600SemiBold" }]}>{moniker || "—"}</Text>
                  <TouchableOpacity onPress={() => { setMonikerInput(moniker); setEditingMoniker(true); }}>
                    <Feather name="edit-2" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>WALLET</Text>
          <View style={s.card}>
            <View style={s.row}>
              <Text style={s.rowLabel}>MXC Address</Text>
              <Text style={s.rowValue} numberOfLines={1}>{mxcAddress ? shortenAddress(mxcAddress, 8) : "—"}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.rowLabel}>ETH Address</Text>
              <Text style={s.rowValue} numberOfLines={1}>{ethAddress ? shortenAddress(ethAddress, 8) : "—"}</Text>
            </View>
            <View style={[s.row, s.rowLast]}>
              <Text style={s.rowLabel}>Public Key</Text>
              <Text style={s.rowValue} numberOfLines={1}>{publicKey ? shortenAddress(publicKey, 8) : "—"}</Text>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>SECURITY</Text>
          <View style={s.dangerCard}>
            <TouchableOpacity
              style={s.dangerRow}
              onPress={handleRevealKey}
            >
              {loadingKey ? (
                <ActivityIndicator color="#F87171" size="small" />
              ) : (
                <Feather name={keyVisible ? "eye-off" : "eye"} size={18} color="#F87171" />
              )}
              <Text style={s.dangerText}>
                {keyVisible ? "Hide" : "Show"} Private Key
              </Text>
            </TouchableOpacity>

            {keyVisible && privateKey && (
              <View style={s.keyBox}>
                <Text style={s.keyText} selectable>{privateKey}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.dangerRow, s.dangerRowLast]}
              onPress={handleExportKey}
            >
              <Feather name="copy" size={18} color="#F87171" />
              <Text style={s.dangerText}>Export Private Key</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>CHAIN</Text>
          <View style={s.card}>
            <View style={[s.chainRow]}>
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
