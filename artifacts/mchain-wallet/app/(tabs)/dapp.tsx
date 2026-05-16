import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { LinearGradient } from "expo-linear-gradient";
import React, { useRef, useState } from "react";
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
import { WebView, type WebViewNavigation } from "react-native-webview";

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
    icon: "swap-horizontal-outline",
    color: "#8B5CF6",
  },
  {
    id: "swap",
    name: "MChain Swap",
    desc: "Swap tokens on MChain",
    url: "https://swap.mvault.pro",
    icon: "repeat-outline",
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

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "https://" + trimmed;
}

export default function DAppScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // null = home screen, string = URL to open in WebView
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [displayUrl, setDisplayUrl] = useState("");
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(false);
  const webViewRef = useRef<WebView>(null);

  function openDApp(url: string) {
    const target = normalizeUrl(url);
    if (!target) return;
    Keyboard.dismiss();

    // On web: just open a new tab; no in-app WebView needed
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.open(target, "_blank");
      return;
    }

    setDisplayUrl(target);
    setActiveUrl(target);
    setCanGoBack(false);
    setCanGoForward(false);
  }

  function handleGoUrl() {
    const target = normalizeUrl(urlInput);
    if (!target) return;
    openDApp(target);
  }

  function handleNavStateChange(nav: WebViewNavigation) {
    setCanGoBack(nav.canGoBack);
    setCanGoForward(nav.canGoForward);
    if (nav.url) setDisplayUrl(nav.url);
  }

  function handleClose() {
    setActiveUrl(null);
    setDisplayUrl("");
    setUrlInput("");
    setCanGoBack(false);
    setCanGoForward(false);
    setLoading(false);
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },

    // Home / grid
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
    goBtn: { width: 32, height: 32, borderRadius: 10, overflow: "hidden" as const },
    goBtnGrad: { width: 32, height: 32, alignItems: "center" as const, justifyContent: "center" as const },
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
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    cardName: { fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground },
    cardDesc: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 16 },
    openRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
    openText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

    // Browser chrome
    browserChrome: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 4),
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    browserTopRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      paddingVertical: 6,
      gap: 4,
    },
    navBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    urlBar: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.background,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      height: 36,
      gap: 6,
    },
    urlText: {
      flex: 1,
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    progressBar: {
      height: 2,
      backgroundColor: colors.primary,
    },
    webview: { flex: 1, backgroundColor: colors.background },
  });

  // ── In-app browser view ───────────────────────────────────────────────
  if (activeUrl) {
    const shortUrl = displayUrl
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");

    return (
      <View style={s.container}>
        {/* Browser chrome */}
        <View style={s.browserChrome}>
          <View style={s.browserTopRow}>
            {/* Back */}
            <TouchableOpacity
              style={[s.navBtn, !canGoBack && { opacity: 0.35 }]}
              onPress={() => webViewRef.current?.goBack()}
              disabled={!canGoBack}
              activeOpacity={0.7}
            >
              <Icon name="arrow-back" size={18} color={colors.foreground} />
            </TouchableOpacity>

            {/* Forward */}
            <TouchableOpacity
              style={[s.navBtn, !canGoForward && { opacity: 0.35 }]}
              onPress={() => webViewRef.current?.goForward()}
              disabled={!canGoForward}
              activeOpacity={0.7}
            >
              <Icon name="arrow-forward" size={18} color={colors.foreground} />
            </TouchableOpacity>

            {/* URL bar */}
            <View style={s.urlBar}>
              <Icon name="globe-outline" size={12} color={colors.mutedForeground} />
              <Text style={s.urlText} numberOfLines={1} ellipsizeMode="tail">
                {shortUrl}
              </Text>
              {loading && <ActivityIndicator size="small" color={colors.primary} />}
            </View>

            {/* Reload */}
            <TouchableOpacity
              style={s.navBtn}
              onPress={() => webViewRef.current?.reload()}
              activeOpacity={0.7}
            >
              <Icon name="refresh-outline" size={18} color={colors.foreground} />
            </TouchableOpacity>

            {/* Close / Home */}
            <TouchableOpacity style={s.closeBtn} onPress={handleClose} activeOpacity={0.8}>
              <Icon name="home" size={17} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Loading progress indicator */}
          {loading && (
            <View style={[s.progressBar, { opacity: 0.7 }]} />
          )}
        </View>

        <WebView
          ref={webViewRef}
          source={{ uri: activeUrl }}
          style={s.webview}
          onNavigationStateChange={handleNavStateChange}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          allowsBackForwardNavigationGestures
          sharedCookiesEnabled
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
        />
      </View>
    );
  }

  // ── Home / dApp grid ──────────────────────────────────────────────────
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
            placeholder="Enter dApp URL…"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={handleGoUrl}
          />
          {urlInput.trim().length > 0 && (
            <TouchableOpacity style={s.goBtn} onPress={handleGoUrl} activeOpacity={0.85}>
              <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.goBtnGrad}>
                <Icon name="arrow-forward" size={16} color="#FFF" />
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
                <Icon name={dapp.icon as Parameters<typeof Icon>[0]["name"]} size={22} color={dapp.color} />
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
