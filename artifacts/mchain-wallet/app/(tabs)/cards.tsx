import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function CardChip({ color = "#FFD700" }: { color?: string }) {
  return (
    <View style={{ width: 32, height: 24, borderRadius: 5, backgroundColor: color, opacity: 0.9,
      borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" }}>
      <View style={{ position: "absolute", top: 7, left: 4, right: 4, height: 1,
        backgroundColor: "rgba(255,255,255,0.4)" }} />
      <View style={{ position: "absolute", top: 4, left: 4, bottom: 4, width: 1,
        backgroundColor: "rgba(255,255,255,0.3)" }} />
    </View>
  );
}

function ContactlessIcon({ color = "rgba(255,255,255,0.7)" }: { color?: string }) {
  return (
    <View style={{ width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
      {[8, 13, 18].map((size, i) => (
        <View key={i} style={{
          position: "absolute",
          width: size, height: size,
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor: color,
          borderLeftColor: "transparent",
          borderBottomColor: "transparent",
          transform: [{ rotate: "45deg" }],
          opacity: 0.6 + i * 0.15,
        }} />
      ))}
    </View>
  );
}

export default function CardsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 12),
      paddingHorizontal: 20,
      paddingBottom: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: 19,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
      alignItems: "center", justifyContent: "center",
    },
    headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground, flex: 1 },
    scroll: { paddingHorizontal: 20, paddingBottom: 120 },
    sectionTitle: {
      fontSize: 11, fontFamily: "Inter_700Bold",
      color: colors.mutedForeground, letterSpacing: 1.5,
      marginBottom: 16, marginTop: 8,
    },

    // ── Card visual ──────────────────────────────────────────
    cardVisual: {
      borderRadius: 20, overflow: "hidden",
      marginBottom: 20,
      aspectRatio: 1.586,
      shadowColor: "#000",
      shadowOpacity: 0.3, shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    },
    cardGrad: { flex: 1, padding: 22, justifyContent: "space-between" },
    cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    cardNetwork: {
      fontSize: 10, fontFamily: "Inter_700Bold",
      color: "rgba(255,255,255,0.8)", letterSpacing: 2,
    },
    cardNumberRow: { gap: 4 },
    cardNumberLabel: {
      fontSize: 9, fontFamily: "Inter_500Medium",
      color: "rgba(255,255,255,0.5)", letterSpacing: 1.5,
    },
    cardNumber: {
      fontSize: 15, fontFamily: "Inter_600SemiBold",
      color: "rgba(255,255,255,0.9)", letterSpacing: 3,
    },
    cardBottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    cardName: {
      fontSize: 13, fontFamily: "Inter_700Bold",
      color: "rgba(255,255,255,0.9)", letterSpacing: 1.5,
    },
    cardExpiry: {
      fontSize: 10, fontFamily: "Inter_400Regular",
      color: "rgba(255,255,255,0.6)", marginTop: 3,
    },

    // ── Info panel ────────────────────────────────────────────
    infoPanel: {
      backgroundColor: colors.card,
      borderRadius: 16, borderWidth: 1,
      borderColor: colors.border, padding: 18,
      marginBottom: 14,
    },
    infoPanelTitle: {
      fontSize: 17, fontFamily: "Inter_700Bold",
      color: colors.foreground, marginBottom: 6,
    },
    infoPanelDesc: {
      fontSize: 13, fontFamily: "Inter_400Regular",
      color: colors.mutedForeground, lineHeight: 20, marginBottom: 16,
    },
    featureRow: {
      flexDirection: "row", gap: 8, marginBottom: 8,
      alignItems: "flex-start",
    },
    featureText: {
      fontSize: 13, fontFamily: "Inter_400Regular",
      color: colors.foreground, flex: 1, lineHeight: 19,
    },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 16 },
    poweredRow: {
      flexDirection: "row", alignItems: "center", gap: 8,
    },
    poweredText: {
      fontSize: 11, fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    stripeBadge: {
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
      backgroundColor: "#635BFF20", borderWidth: 1, borderColor: "#635BFF40",
    },
    stripeBadgeText: {
      fontSize: 11, fontFamily: "Inter_700Bold", color: "#635BFF",
    },

    // ── CTA button ────────────────────────────────────────────
    ctaBtn: {
      borderRadius: 14, overflow: "hidden",
      shadowColor: "#0EA5E9", shadowOpacity: 0.35,
      shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    ctaGrad: {
      paddingVertical: 16, alignItems: "center",
      flexDirection: "row", justifyContent: "center", gap: 8,
    },
    ctaText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFF" },

    // ── Coming soon card ──────────────────────────────────────
    comingSoonCard: {
      backgroundColor: colors.card,
      borderRadius: 16, borderWidth: 1,
      borderColor: colors.border, padding: 18,
      marginBottom: 14, opacity: 0.75,
    },
    comingSoonBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
      backgroundColor: colors.primary + "15",
      borderWidth: 1, borderColor: colors.primary + "30",
      marginBottom: 14,
    },
    comingSoonBadgeText: {
      fontSize: 10, fontFamily: "Inter_700Bold",
      color: colors.primary, letterSpacing: 1.5,
    },
  });

  return (
    <View style={s.container}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Icon name="arrow-back" size={18} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Virtual Cards</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ══════════════════════════════════════
            CARD 1 — USDT to Fiat (Stripe)
        ══════════════════════════════════════ */}
        <Text style={s.sectionTitle}>AVAILABLE NOW</Text>

        {/* Card visual */}
        <View style={s.cardVisual}>
          <LinearGradient
            colors={["#0D2B4E", "#0EA5E9", "#0284C7"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.cardGrad}
          >
            <View style={s.cardTopRow}>
              <View>
                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold",
                  color: "rgba(255,255,255,0.9)", letterSpacing: 1 }}>
                  MChain
                </Text>
                <Text style={{ fontSize: 8, fontFamily: "Inter_400Regular",
                  color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>
                  VIRTUAL CARD
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ContactlessIcon />
                <CardChip />
              </View>
            </View>

            <View style={s.cardNumberRow}>
              <Text style={s.cardNumberLabel}>CARD NUMBER</Text>
              <Text style={s.cardNumber}>•••• •••• •••• ••••</Text>
            </View>

            <View style={s.cardBottomRow}>
              <View>
                <Text style={s.cardName}>YOUR NAME</Text>
                <Text style={s.cardExpiry}>VALID THRU  MM/YY</Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <View style={{ flexDirection: "row" }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11,
                    backgroundColor: "#EB001B", opacity: 0.9 }} />
                  <View style={{ width: 22, height: 22, borderRadius: 11,
                    backgroundColor: "#F79E1B", opacity: 0.9, marginLeft: -8 }} />
                </View>
                <Text style={{ fontSize: 7, fontFamily: "Inter_700Bold",
                  color: "rgba(255,255,255,0.6)", letterSpacing: 1, marginTop: 2 }}>
                  MASTERCARD
                </Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Info panel */}
        <View style={s.infoPanel}>
          <Text style={s.infoPanelTitle}>USDT to Fiat Card</Text>
          <Text style={s.infoPanelDesc}>
            Deposit USDT and spend anywhere Mastercard is accepted — online, in stores, and tap-to-pay.
          </Text>

          {[
            { icon: "card-outline", text: "Virtual Mastercard — works online everywhere" },
            { icon: "phone-portrait-outline", text: "Add to Apple Pay & Google Pay for tap-to-pay" },
            { icon: "swap-horizontal-outline", text: "USDT automatically converted to local currency at checkout" },
            { icon: "flash-outline", text: "Instant top-up from your USDT balance" },
            { icon: "lock-closed-outline", text: "Freeze & unfreeze your card anytime" },
          ].map((f, i) => (
            <View key={i} style={s.featureRow}>
              <Icon name={f.icon} size={15} color={colors.primary} />
              <Text style={s.featureText}>{f.text}</Text>
            </View>
          ))}

          <View style={s.divider} />

          <View style={s.poweredRow}>
            <Text style={s.poweredText}>Powered by</Text>
            <View style={s.stripeBadge}>
              <Text style={s.stripeBadgeText}>Stripe Issuing</Text>
            </View>
            <Text style={[s.poweredText, { marginLeft: "auto" }]}>Visa / Mastercard</Text>
          </View>
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={s.ctaBtn}
          activeOpacity={0.85}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }}
        >
          <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.ctaGrad}>
            <Icon name="card-outline" size={18} color="#FFF" />
            <Text style={s.ctaText}>Apply for Card</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* ══════════════════════════════════════
            CARD 2 — Direct USDT (Coming soon)
        ══════════════════════════════════════ */}
        <Text style={[s.sectionTitle, { marginTop: 32 }]}>COMING SOON</Text>

        {/* Card visual — muted */}
        <View style={[s.cardVisual, { opacity: 0.55 }]}>
          <LinearGradient
            colors={["#1a1a2e", "#16213e", "#0f3460"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.cardGrad}
          >
            <View style={s.cardTopRow}>
              <View>
                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold",
                  color: "rgba(255,255,255,0.9)", letterSpacing: 1 }}>
                  MChain
                </Text>
                <Text style={{ fontSize: 8, fontFamily: "Inter_400Regular",
                  color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>
                  WEB3 CARD
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ContactlessIcon color="rgba(255,255,255,0.5)" />
                <CardChip color="#A0AEC0" />
              </View>
            </View>

            <View style={s.cardNumberRow}>
              <Text style={s.cardNumberLabel}>CARD NUMBER</Text>
              <Text style={s.cardNumber}>•••• •••• •••• ••••</Text>
            </View>

            <View style={s.cardBottomRow}>
              <View>
                <Text style={s.cardName}>YOUR NAME</Text>
                <Text style={s.cardExpiry}>VALID THRU  MM/YY</Text>
              </View>
              <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" }}>
                <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold",
                  color: "rgba(255,255,255,0.6)", letterSpacing: 1 }}>
                  USDT
                </Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        <View style={s.comingSoonCard}>
          <View style={s.comingSoonBadge}>
            <Text style={s.comingSoonBadgeText}>COMING SOON</Text>
          </View>
          <Text style={[s.infoPanelTitle, { marginBottom: 6 }]}>Direct Spending USDT Card</Text>
          <Text style={s.infoPanelDesc}>
            Spend your USDT directly — no conversion, no exchange rate. Pay at merchants natively with stablecoins.
          </Text>

          {[
            { icon: "logo-usd", text: "Spend USDT directly — no fiat conversion" },
            { icon: "globe-outline", text: "Accepted at Web3-native merchants worldwide" },
            { icon: "shield-checkmark-outline", text: "Non-custodial — your keys, your funds" },
            { icon: "phone-portrait-outline", text: "Apple Pay & Google Pay via crypto tokenization" },
          ].map((f, i) => (
            <View key={i} style={[s.featureRow, { opacity: 0.7 }]}>
              <Icon name={f.icon} size={15} color={colors.mutedForeground} />
              <Text style={[s.featureText, { color: colors.mutedForeground }]}>{f.text}</Text>
            </View>
          ))}

          <View style={[s.divider, { marginTop: 12 }]} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="time-outline" size={14} color={colors.mutedForeground} />
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular",
              color: colors.mutedForeground }}>
              We'll notify you when this is ready
            </Text>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}
