import { Icon } from "@/components/Icon";
import { AdCardSkeleton } from "@/components/Skeleton";
import { useWallet } from "@/context/WalletContext";
import { useColors } from "@/hooks/useColors";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { p2pApi, type P2pAd } from "@/services/p2pApi";
import { PostAdModal } from "@/components/p2p/PostAdModal";
import { OrderModal } from "@/components/p2p/OrderModal";
import { MyOrdersModal } from "@/components/p2p/MyOrdersModal";
import { ProfileModal } from "@/components/p2p/ProfileModal";

type Token = "MC" | "USDT";
type Side = "buy" | "sell";
const AD_LIMIT = 20;

function AdRow({ ad, myAddress, onPress }: { ad: P2pAd; myAddress: string; onPress: () => void }) {
  const colors = useColors();
  const isOwn = ad.ownerAddress === myAddress;
  const rate = parseFloat(ad.completionRate ?? "0");

  const s = StyleSheet.create({
    row: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 10,
    },
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
    nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    name: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    kycBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: "#10B98115", borderWidth: 1, borderColor: "#10B98140" },
    kycText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#10B981" },
    merchantBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: "#0EA5E915", borderWidth: 1, borderColor: "#0EA5E940" },
    merchantText: { fontSize: 9, fontFamily: "Inter_700Bold", color: colors.primary },
    verifiedMerchantBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: "#0EA5E915", borderWidth: 1, borderColor: "#0EA5E960" },
    verifiedMerchantText: { fontSize: 9, fontFamily: "Inter_700Bold", color: colors.primary },
    bronzeBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: "#92400E20", borderWidth: 1, borderColor: "#92400E50" },
    bronzeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#D97706" },
    silverBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: "#94A3B820", borderWidth: 1, borderColor: "#94A3B850" },
    silverText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#CBD5E1" },
    goldBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: "#FBBF2420", borderWidth: 1, borderColor: "#FBBF2450" },
    goldText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#FDE68A" },
    platinumBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: "#22D3EE20", borderWidth: 1, borderColor: "#22D3EE50" },
    platinumText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#67E8F9" },
    statsText: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    price: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.primary },
    priceUnit: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
    limitText: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    limitsVal: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    pmWrap: { flexDirection: "row", gap: 4, flexWrap: "wrap" },
    pmChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
    pmText: { fontSize: 10, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    buyBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, overflow: "hidden" as const, marginTop: 10 },
    ownTag: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, alignItems: "center" as const, borderWidth: 1, borderColor: colors.border, marginTop: 10 },
    ownTagText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
  });

  return (
    <View style={s.row}>
      <View style={s.topRow}>
        <View>
          <View style={s.nameRow}>
            <Text style={s.name}>{ad.displayName ?? shortenAddr(ad.ownerAddress)}</Text>
            {ad.kycVerified && <View style={s.kycBadge}><Text style={s.kycText}>✓ KYC</Text></View>}
            {ad.isMerchant && ad.kycVerified
              ? <View style={s.verifiedMerchantBadge}><Text style={s.verifiedMerchantText}>✦ TRUSTED</Text></View>
              : ad.isMerchant
              ? <View style={s.merchantBadge}><Text style={s.merchantText}>MERCHANT</Text></View>
              : null}
            {ad.completedOrders >= 500 && <View style={s.platinumBadge}><Text style={s.platinumText}>💎</Text></View>}
            {ad.completedOrders >= 100 && ad.completedOrders < 500 && <View style={s.goldBadge}><Text style={s.goldText}>🥇</Text></View>}
            {ad.completedOrders >= 50 && ad.completedOrders < 100 && <View style={s.silverBadge}><Text style={s.silverText}>🥈</Text></View>}
            {ad.completedOrders >= 10 && ad.completedOrders < 50 && <View style={s.bronzeBadge}><Text style={s.bronzeText}>🥉</Text></View>}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
            <Text style={s.statsText}>{ad.completedOrders} orders · {rate.toFixed(0)}% completion</Text>
            {parseFloat(ad.avgRating ?? "0") > 0 && (
              <>
                <Text style={[s.statsText, { color: colors.border }]}>·</Text>
                <Icon name="star" size={10} color="#F59E0B" />
                <Text style={[s.statsText, { color: "#F59E0B" }]}>{parseFloat(ad.avgRating!).toFixed(1)}</Text>
              </>
            )}
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={s.price}>{parseFloat(ad.price).toLocaleString("en-US", { maximumFractionDigits: 4 })}</Text>
          <Text style={s.priceUnit}>USDT per {ad.token}</Text>
        </View>
      </View>

      <View style={s.metaRow}>
        <View>
          <Text style={s.limitText}>Available</Text>
          <Text style={s.limitsVal}>{parseFloat(ad.availableAmount).toFixed(2)} {ad.token}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={s.limitText}>Limit</Text>
          <Text style={s.limitsVal}>{parseFloat(ad.minAmount).toFixed(0)} – {parseFloat(ad.maxAmount).toFixed(0)} {ad.token}</Text>
        </View>
      </View>

      <View style={[s.metaRow, { marginTop: 8 }]}>
        <View style={s.pmWrap}>
          {ad.paymentMethods.slice(0, 3).map((pm) => (
            <View key={pm} style={s.pmChip}>
              <Text style={s.pmText}>{pm.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</Text>
            </View>
          ))}
          {ad.paymentMethods.length > 3 && (
            <View style={s.pmChip}><Text style={s.pmText}>+{ad.paymentMethods.length - 3}</Text></View>
          )}
        </View>
      </View>

      {isOwn ? (
        <View style={s.ownTag}><Text style={s.ownTagText}>Your Ad</Text></View>
      ) : (
        <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={s.buyBtn}>
          <LinearGradient
            colors={ad.side === "sell" ? ["#0EA5E9", "#0284C7"] : ["#10B981", "#059669"]}
            style={{ paddingVertical: 0, alignItems: "center" as const }}
          >
            <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#FFF", paddingVertical: 9 }}>
              {ad.side === "sell" ? `Buy ${ad.token}` : `Sell ${ad.token}`}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );
}

function shortenAddr(addr: string) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function P2PScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mxcAddress } = useWallet();
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [])
  );

  const [token, setToken] = useState<Token>("MC");
  const [side, setSide] = useState<Side>("buy");
  const [showPostAd, setShowPostAd] = useState(false);
  const [selectedAd, setSelectedAd] = useState<P2pAd | null>(null);
  const [showMyOrders, setShowMyOrders] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // ── Paginated ads state ──────────────────────────────────────────────────
  const [adItems, setAdItems] = useState<P2pAd[]>([]);
  const [adTotal, setAdTotal] = useState(0);
  const [adPage, setAdPage] = useState(0);
  const [adLoading, setAdLoading] = useState(false);

  const totalPages = Math.ceil(adTotal / AD_LIMIT);

  const loadAds = useCallback(async (page: number) => {
    setAdLoading(true);
    try {
      const res = await p2pApi.getAds({ token, side, offset: page * AD_LIMIT });
      setAdItems(res.ads);
      setAdTotal(res.total);
      setAdPage(page);
    } catch {
      // silently ignore
    } finally {
      setAdLoading(false);
    }
  }, [token, side]);

  // Reset to page 0 and reload when token/side changes (loadAds identity changes)
  useEffect(() => {
    setAdItems([]);
    setAdTotal(0);
    setAdPage(0);
    void loadAds(0);
  }, [loadAds]);

  // Auto-refresh current page every 15 s
  useEffect(() => {
    const id = setInterval(() => { void loadAds(adPage); }, 15_000);
    return () => clearInterval(id);
  }, [loadAds, adPage]);

  const {
    data: profile,
    isLoading: profileLoading,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ["p2p_profile", mxcAddress],
    queryFn: async () => {
      try { return await p2pApi.getProfile(mxcAddress!); }
      catch { return null; }
    },
    enabled: !!mxcAddress,
  });

  const [activating, setActivating] = useState(false);
  const [connectName, setConnectName] = useState("");
  const [connectPhone, setConnectPhone] = useState("");
  const [connectErr, setConnectErr] = useState("");
  // true when both fields were loaded from AsyncStorage (previously saved)
  const [savedCredentials, setSavedCredentials] = useState(false);

  // Reset fields immediately when wallet switches, then restore any saved values
  useEffect(() => {
    setConnectName("");
    setConnectPhone("");
    setConnectErr("");
    setSavedCredentials(false);
    if (!mxcAddress) return;
    Promise.all([
      AsyncStorage.getItem(`p2p_displayname_${mxcAddress}`),
      AsyncStorage.getItem(`p2p_phone_${mxcAddress}`),
    ]).then(([savedName, savedPhone]) => {
      if (savedName) setConnectName(savedName);
      if (savedPhone) setConnectPhone(savedPhone);
      if (savedName && savedPhone) setSavedCredentials(true);
    }).catch(() => {});
  }, [mxcAddress]);

  function handleDisconnect() {
    Alert.alert(
      "Disconnect P2P Wallet",
      "Your profile will be removed from the P2P market. You can reconnect anytime.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            try {
              if (mxcAddress) await p2pApi.disconnectProfile(mxcAddress);
            } catch {
              // ignore — even if server fails, clear locally
            }
            queryClient.setQueryData(["p2p_profile", mxcAddress], null);
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  }

  async function handleActivate() {
    if (!mxcAddress) return;
    if (!connectName.trim() || connectName.trim().length < 2) {
      setConnectErr("Enter a display name (at least 2 characters)");
      return;
    }
    if (!connectPhone.trim()) {
      setConnectErr("Phone number is required");
      return;
    }
    setConnectErr("");
    setActivating(true);
    try {
      await p2pApi.upsertProfile({
        mxcAddress,
        displayName: connectName.trim(),
        phone: connectPhone.trim(),
      });
      // Persist name + phone so they pre-fill (and lock) if user reconnects later
      AsyncStorage.setItem(`p2p_displayname_${mxcAddress}`, connectName.trim()).catch(() => {});
      AsyncStorage.setItem(`p2p_phone_${mxcAddress}`, connectPhone.trim()).catch(() => {});
      void refetchProfile();
    } catch (e) {
      setConnectErr(e instanceof Error ? e.message : "Failed to connect");
    } finally {
      setActivating(false);
    }
  }

  const profileReady = !profileLoading;
  const hasProfile = profile != null;

  // Render a neutral loading state — prevents the P2P market from flashing
  // before the profile query resolves and the connect-wallet screen appears.
  if (profileLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top + 60 }}>
        {[1,2,3].map(i => <AdCardSkeleton key={i} />)}
      </View>
    );
  }

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 8),
      paddingHorizontal: 20,
      paddingBottom: 12,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    title: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
    headerRight: { flexDirection: "row", gap: 8 },
    iconBtn: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      alignItems: "center", justifyContent: "center",
    },
    tokenBar: { flexDirection: "row", marginHorizontal: 20, marginBottom: 10, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 3 },
    tokenBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: "center" },
    tokenBtnActive: { backgroundColor: colors.primary + "20", borderWidth: 1, borderColor: colors.primary + "50" },
    tokenText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    tokenTextActive: { color: colors.primary },
    sideBar: { flexDirection: "row", marginHorizontal: 20, marginBottom: 14, gap: 8 },
    sideBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card },
    sideBtnBuy: { borderColor: "#10B981", backgroundColor: "#10B98110" },
    sideBtnSell: { borderColor: "#0EA5E9", backgroundColor: "#0EA5E910" },
    sideText: { fontSize: 13, fontFamily: "Inter_700Bold", color: colors.mutedForeground },
    sideBuyText: { color: "#10B981" },
    sideSellText: { color: "#0EA5E9" },
    scroll: { paddingHorizontal: 20, paddingBottom: 120 },
    empty: { alignItems: "center", paddingTop: 60, gap: 12 },
    emptyText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    emptyDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" },
    postBtn: {
      position: "absolute", bottom: insets.bottom + 88, right: 20,
      borderRadius: 28, overflow: "hidden",
      shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    postBtnGrad: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 14 },
    postBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#FFF" },
    paginationRow: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      marginTop: 8, marginBottom: 4,
    },
    pageBtn: {
      paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10,
      borderWidth: 1, borderColor: colors.border,
    },
    pageBtnDisabled: { opacity: 0.3 },
    pageBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primary },
    pageInfo: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    connectScroll: { paddingBottom: 40 },
    connectHero: { alignItems: "center", paddingTop: 36, paddingBottom: 28, paddingHorizontal: 24 },
    connectRingOuter: { width: 104, height: 104, borderRadius: 52, borderWidth: 1, borderColor: colors.primary + "18", alignItems: "center", justifyContent: "center", marginBottom: 24 },
    connectRingInner: { width: 80, height: 80, borderRadius: 40, borderWidth: 1.5, borderColor: colors.primary + "40", backgroundColor: colors.primary + "0C", alignItems: "center", justifyContent: "center" },
    connectTitle: { fontSize: 26, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center", marginBottom: 10, letterSpacing: -0.3 },
    connectDesc: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", lineHeight: 22 },
    connectTrustRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20, marginBottom: 24, flexWrap: "wrap", justifyContent: "center" },
    connectTrustPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.primary + "25", backgroundColor: colors.primary + "0A" },
    connectTrustText: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.primary },
    connectForm: { marginHorizontal: 20 },
    connectAddrCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 20, gap: 10 },
    connectAddrLabel: { fontSize: 9, fontFamily: "Inter_700Bold", color: colors.primary, letterSpacing: 1.5, marginBottom: 3 },
    connectAddrText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    connectFieldWrap: { marginBottom: 16 },
    connectFieldLabel: { fontSize: 10, fontFamily: "Inter_700Bold", color: colors.mutedForeground, letterSpacing: 1.5, marginBottom: 8 },
    connectInput: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground },
    connectInputFocus: { borderColor: colors.primary + "80" },
    connectInputErr: { borderColor: "#EF4444" },
    connectErrBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EF444410", borderRadius: 10, borderWidth: 1, borderColor: "#EF444430", padding: 12, marginBottom: 16 },
    connectErrText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#EF4444", flex: 1 },
    connectBtn: { borderRadius: 16, overflow: "hidden", marginBottom: 16, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
    connectBtnGrad: { paddingVertical: 17, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
    connectBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFF", letterSpacing: 0.2 },
    connectNoteRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 4 },
    connectNote: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 18, flex: 1 },
  });

  if (profileReady && !hasProfile) {
    return (
      <KeyboardAvoidingView
        style={[s.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 8) }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={s.connectScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* ── Hero ── */}
          <View style={s.connectHero}>
            <View style={s.connectRingOuter}>
              <View style={s.connectRingInner}>
                <Icon name="storefront-outline" size={34} color={colors.primary} />
              </View>
            </View>
            <Text style={s.connectTitle}>Activate P2P Trading</Text>
            <Text style={s.connectDesc}>
              Your wallet address is your P2P identity — no password needed. Set a display name so other traders can recognise you.
            </Text>
          </View>

          {/* ── Trust pills ── */}
          <View style={s.connectTrustRow}>
            {[
              { icon: "shield-checkmark-outline", label: "Non-custodial" },
              { icon: "flash-outline", label: "Instant Settlement" },
              { icon: "lock-closed-outline", label: "Private Keys Local" },
            ].map(p => (
              <View key={p.label} style={s.connectTrustPill}>
                <Icon name={p.icon} size={11} color={colors.primary} />
                <Text style={s.connectTrustText}>{p.label}</Text>
              </View>
            ))}
          </View>

          {/* ── Form ── */}
          <View style={s.connectForm}>
            {/* Address card */}
            <View style={s.connectAddrCard}>
              <Icon name="wallet-outline" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={s.connectAddrLabel}>WALLET ADDRESS</Text>
                <Text style={s.connectAddrText} numberOfLines={1}>
                  {mxcAddress ? `${mxcAddress.slice(0, 20)}…${mxcAddress.slice(-8)}` : "—"}
                </Text>
              </View>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981" }} />
            </View>

            {/* Display name */}
            <View style={s.connectFieldWrap}>
              <Text style={s.connectFieldLabel}>DISPLAY NAME <Text style={{ color: "#EF4444" }}>*</Text></Text>
              {savedCredentials ? (
                <View style={[s.connectInput, { justifyContent: "center", opacity: 0.7 }]} pointerEvents="none">
                  <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground }}>{connectName}</Text>
                </View>
              ) : (
                <TextInput
                  style={[s.connectInput, connectErr && connectErr.includes("name") ? s.connectInputErr : null]}
                  value={connectName}
                  onChangeText={setConnectName}
                  placeholder="Your trader name (visible to others)"
                  placeholderTextColor={colors.mutedForeground}
                  maxLength={50}
                  autoCorrect={false}
                />
              )}
            </View>

            {/* Phone */}
            <View style={s.connectFieldWrap}>
              <Text style={s.connectFieldLabel}>PHONE NUMBER <Text style={{ color: "#EF4444" }}>*</Text></Text>
              {savedCredentials ? (
                <View style={[s.connectInput, { justifyContent: "center", opacity: 0.7 }]} pointerEvents="none">
                  <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground }}>{connectPhone}</Text>
                </View>
              ) : (
                <TextInput
                  style={[s.connectInput, connectErr && connectErr.includes("Phone") ? s.connectInputErr : null]}
                  value={connectPhone}
                  onChangeText={setConnectPhone}
                  placeholder="+1 234 567 890"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad"
                  maxLength={20}
                />
              )}
            </View>

            {!!connectErr && (
              <View style={s.connectErrBox}>
                <Icon name="alert-circle-outline" size={15} color="#EF4444" />
                <Text style={s.connectErrText}>{connectErr}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.connectBtn, activating && { opacity: 0.6 }]}
              onPress={handleActivate}
              disabled={activating}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={["#0EA5E9", "#0284C7"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.connectBtnGrad}
              >
                {activating
                  ? <ActivityIndicator color="#FFF" />
                  : <><Icon name="flash-outline" size={18} color="#FFF" /><Text style={s.connectBtnText}>Connect Wallet to P2P</Text></>
                }
              </LinearGradient>
            </TouchableOpacity>

            <View style={s.connectNoteRow}>
              <Icon name="lock-closed-outline" size={13} color={colors.mutedForeground} />
              <Text style={s.connectNote}>Your private keys stay on your device at all times. Only your address and trade history are stored on the platform.</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>P2P Market</Text>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.iconBtn} onPress={() => setShowMyOrders(true)}>
            <Icon name="receipt-outline" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() => setShowProfile(true)}>
            <Icon name="person-circle-outline" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.iconBtn, { borderColor: "#EF444440" }]} onPress={handleDisconnect}>
            <Icon name="log-out-outline" size={18} color="#F87171" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Token selector */}
      <View style={s.tokenBar}>
        {(["MC", "USDT"] as Token[]).map((t) => (
          <TouchableOpacity key={t} style={[s.tokenBtn, token === t && s.tokenBtnActive]} onPress={() => setToken(t)} activeOpacity={0.75}>
            <Text style={[s.tokenText, token === t && s.tokenTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Buy / Sell side */}
      <View style={s.sideBar}>
        <TouchableOpacity style={[s.sideBtn, side === "buy" && s.sideBtnBuy]} onPress={() => setSide("buy")} activeOpacity={0.8}>
          <Text style={[s.sideText, side === "buy" && s.sideBuyText]}>Buy {token}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.sideBtn, side === "sell" && s.sideBtnSell]} onPress={() => setSide("sell")} activeOpacity={0.8}>
          <Text style={[s.sideText, side === "sell" && s.sideSellText]}>Sell {token}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={adLoading} onRefresh={() => { void loadAds(adPage); }} tintColor={colors.primary} />}
      >
        {adLoading ? (
          <>{[1,2,3].map(i => <AdCardSkeleton key={i} />)}</>
        ) : adItems.length === 0 ? (
          <View style={s.empty}>
            <Icon name="storefront-outline" size={48} color={colors.border} />
            <Text style={s.emptyText}>No ads available</Text>
            <Text style={s.emptyDesc}>Be the first to post a {side} ad for {token}</Text>
          </View>
        ) : (
          <>
            {adItems.map((ad) => (
              <AdRow
                key={ad.id}
                ad={ad}
                myAddress={mxcAddress ?? ""}
                onPress={() => { setSelectedAd(ad); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              />
            ))}
            {totalPages > 1 && (
              <View style={s.paginationRow}>
                <TouchableOpacity
                  style={[s.pageBtn, adPage === 0 && s.pageBtnDisabled]}
                  onPress={() => { void loadAds(adPage - 1); }}
                  disabled={adPage === 0}
                  activeOpacity={0.75}
                >
                  <Text style={[s.pageBtnText, adPage === 0 && { color: colors.border }]}>← Prev</Text>
                </TouchableOpacity>
                <Text style={s.pageInfo}>Page {adPage + 1} of {totalPages}</Text>
                <TouchableOpacity
                  style={[s.pageBtn, adPage >= totalPages - 1 && s.pageBtnDisabled]}
                  onPress={() => { void loadAds(adPage + 1); }}
                  disabled={adPage >= totalPages - 1}
                  activeOpacity={0.75}
                >
                  <Text style={[s.pageBtnText, adPage >= totalPages - 1 && { color: colors.border }]}>Next →</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <TouchableOpacity style={s.postBtn} onPress={() => setShowPostAd(true)} activeOpacity={0.85}>
        <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.postBtnGrad}>
          <Icon name="add-circle-outline" size={18} color="#FFF" />
          <Text style={s.postBtnText}>Post Ad</Text>
        </LinearGradient>
      </TouchableOpacity>

      <PostAdModal
        visible={showPostAd}
        onClose={() => setShowPostAd(false)}
        onPosted={() => { void loadAds(0); }}
      />
      {selectedAd && (
        <OrderModal
          ad={selectedAd}
          visible={!!selectedAd}
          onClose={() => setSelectedAd(null)}
          onOrderPlaced={() => { setSelectedAd(null); void loadAds(0); setShowMyOrders(true); }}
        />
      )}
      <MyOrdersModal visible={showMyOrders} onClose={() => setShowMyOrders(false)} />
      <ProfileModal visible={showProfile} onClose={() => setShowProfile(false)} profile={profile ?? null} />
    </View>
  );
}
