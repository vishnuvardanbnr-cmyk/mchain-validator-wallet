import { Icon } from "@/components/Icon";
import { useWallet } from "@/context/WalletContext";
import { useColors } from "@/hooks/useColors";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { p2pApi, type P2pAd } from "@/services/p2pApi";
import { PostAdModal } from "@/components/p2p/PostAdModal";
import { OrderModal } from "@/components/p2p/OrderModal";
import { MyOrdersModal } from "@/components/p2p/MyOrdersModal";
import { ProfileModal } from "@/components/p2p/ProfileModal";

type Token = "MC" | "USDT";
type Side = "buy" | "sell";

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
              ? <View style={s.verifiedMerchantBadge}><Text style={s.verifiedMerchantText}>✦ VERIFIED</Text></View>
              : ad.isMerchant
              ? <View style={s.merchantBadge}><Text style={s.merchantText}>MERCHANT</Text></View>
              : null}
            {ad.completedOrders >= 500 && <View style={s.platinumBadge}><Text style={s.platinumText}>💎</Text></View>}
            {ad.completedOrders >= 100 && ad.completedOrders < 500 && <View style={s.goldBadge}><Text style={s.goldText}>🥇</Text></View>}
            {ad.completedOrders >= 50 && ad.completedOrders < 100 && <View style={s.silverBadge}><Text style={s.silverText}>🥈</Text></View>}
            {ad.completedOrders >= 10 && ad.completedOrders < 50 && <View style={s.bronzeBadge}><Text style={s.bronzeText}>🥉</Text></View>}
          </View>
          <Text style={s.statsText}>{ad.completedOrders} orders · {rate.toFixed(0)}% completion</Text>
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

  const [token, setToken] = useState<Token>("MC");
  const [side, setSide] = useState<Side>("buy");
  const [showPostAd, setShowPostAd] = useState(false);
  const [selectedAd, setSelectedAd] = useState<P2pAd | null>(null);
  const [showMyOrders, setShowMyOrders] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const { data: ads = [], isLoading, refetch } = useQuery({
    queryKey: ["p2p_ads", token, side],
    queryFn: () => p2pApi.getAds({ token, side }),
    refetchInterval: 15_000,
  });

  const { data: profile } = useQuery({
    queryKey: ["p2p_profile", mxcAddress],
    queryFn: () => p2pApi.getProfile(mxcAddress!),
    enabled: !!mxcAddress,
  });

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
  });

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
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : ads.length === 0 ? (
          <View style={s.empty}>
            <Icon name="storefront-outline" size={48} color={colors.border} />
            <Text style={s.emptyText}>No ads available</Text>
            <Text style={s.emptyDesc}>Be the first to post a {side} ad for {token}</Text>
          </View>
        ) : (
          ads.map((ad) => (
            <AdRow
              key={ad.id}
              ad={ad}
              myAddress={mxcAddress ?? ""}
              onPress={() => { setSelectedAd(ad); if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            />
          ))
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
        onPosted={() => { queryClient.invalidateQueries({ queryKey: ["p2p_ads"] }); }}
      />
      {selectedAd && (
        <OrderModal
          ad={selectedAd}
          visible={!!selectedAd}
          onClose={() => setSelectedAd(null)}
          onOrderPlaced={() => { setSelectedAd(null); queryClient.invalidateQueries({ queryKey: ["p2p_ads"] }); setShowMyOrders(true); }}
        />
      )}
      <MyOrdersModal visible={showMyOrders} onClose={() => setShowMyOrders(false)} />
      <ProfileModal visible={showProfile} onClose={() => setShowProfile(false)} profile={profile ?? null} />
    </View>
  );
}
