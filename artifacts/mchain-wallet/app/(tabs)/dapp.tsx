import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const FEATURED_DAPPS = [
  {
    id: "explorer",
    name: "MChain Explorer",
    desc: "Browse blocks, transactions and addresses",
    url: "https://explorer.mvault.pro",
    icon: "search-outline",
    color: "#0EA5E9",
  },
  {
    id: "bridge",
    name: "MChain Bridge",
    desc: "Bridge assets between networks",
    url: "https://bridge.mvault.pro",
    icon: "git-compare-outline",
    color: "#8B5CF6",
  },
  {
    id: "swap",
    name: "MChain Swap",
    desc: "Swap tokens on MChain",
    url: "https://swap.mvault.pro",
    icon: "swap-horizontal-outline",
    color: "#10B981",
  },
  {
    id: "staking",
    name: "Staking Portal",
    desc: "Stake MC and earn rewards",
    url: "https://stake.mvault.pro",
    icon: "server-outline",
    color: "#F59E0B",
  },
  {
    id: "governance",
    name: "Governance",
    desc: "Participate in MChain governance",
    url: "https://gov.mvault.pro",
    icon: "people-outline",
    color: "#EF4444",
  },
  {
    id: "nft",
    name: "NFT Marketplace",
    desc: "Buy and sell MChain NFTs",
    url: "https://nft.mvault.pro",
    icon: "images-outline",
    color: "#EC4899",
  },
];

export default function DAppScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [urlInput, setUrlInput] = useState("");
  const [opening, setOpening] = useState<string | null>(null);

  async function openDApp(url: string) {
    let target = url.trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) target = "https://" + target;
    setOpening(target);
    Keyboard.dismiss();
    try {
      if (Platform.OS === "web") {
        window.open(target, "_blank");
      } else {
        await WebBrowser.openBrowserAsync(target, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
          toolbarColor: colors.background,
          controlsColor: colors.primary,
        });
      }
    } catch {
      // ignore
    } finally {
      setOpening(null);
    }
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    title: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 4 },
    subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: 20,
      marginBottom: 24,
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      gap: 8,
    },
    input: {
      flex: 1,
      paddingVertical: 13,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    goBtn: {
      width: 32,
      height: 32,
      borderRadius: 10,
      overflow: "hidden",
    },
    goBtnGrad: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      letterSpacing: 1.5,
      marginHorizontal: 20,
      marginBottom: 12,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      paddingHorizontal: 14,
      gap: 10,
      paddingBottom: 40 + insets.bottom,
    },
    card: {
      width: "47%",
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      gap: 10,
    },
    cardIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    cardName: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground },
    cardDesc: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 16 },
    openRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
    openText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
    loadingOverlay: { position: "absolute", right: 10, top: 10 },
  });

  return (
    <View style={s.container}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Text style={s.title}>dApp Browser</Text>
          <Text style={s.subtitle}>Explore the MChain ecosystem</Text>
        </View>

        {/* URL bar */}
        <View style={s.searchBar}>
          <Icon name="globe-outline" size={16} color={colors.mutedForeground} />
          <TextInput
            style={s.input}
            value={urlInput}
            onChangeText={setUrlInput}
            placeholder="Enter dApp URL or search…"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={() => openDApp(urlInput)}
          />
          {urlInput.trim().length > 0 && (
            <TouchableOpacity
              style={s.goBtn}
              onPress={() => openDApp(urlInput)}
              activeOpacity={0.85}
            >
              <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.goBtnGrad}>
                {opening === (urlInput.trim().startsWith("http") ? urlInput.trim() : "https://" + urlInput.trim()) ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Icon name="arrow-forward" size={16} color="#FFF" />
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>

        <Text style={s.sectionLabel}>FEATURED DAPPS</Text>
        <View style={s.grid}>
          {FEATURED_DAPPS.map((dapp) => (
            <TouchableOpacity
              key={dapp.id}
              style={s.card}
              onPress={() => openDApp(dapp.url)}
              activeOpacity={0.8}
            >
              <View style={[s.cardIconWrap, { backgroundColor: dapp.color + "20" }]}>
                {opening === dapp.url ? (
                  <ActivityIndicator size="small" color={dapp.color} />
                ) : (
                  <Icon name={dapp.icon as Parameters<typeof Icon>[0]["name"]} size={22} color={dapp.color} />
                )}
              </View>
              <Text style={s.cardName}>{dapp.name}</Text>
              <Text style={s.cardDesc}>{dapp.desc}</Text>
              <View style={s.openRow}>
                <Icon name="open-outline" size={11} color={dapp.color} />
                <Text style={[s.openText, { color: dapp.color }]}>Open</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
