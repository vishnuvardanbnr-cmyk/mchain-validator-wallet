import { Icon } from "@/components/Icon";
import { Toast } from "@/components/Toast";
import { useWallet } from "@/context/WalletContext";
import { useColors } from "@/hooks/useColors";
import { p2pApi, type P2pProfile } from "@/services/p2pApi";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  visible: boolean;
  onClose: () => void;
  profile: P2pProfile | null;
}

function StarRating({ rating }: { rating: number }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Icon key={i} name={i <= Math.round(rating) ? "star" : "star-outline"} size={14} color={i <= Math.round(rating) ? "#F59E0B" : colors.border} />
      ))}
    </View>
  );
}

const KYC_DOCS = [
  { id: "passport", label: "Passport" },
  { id: "national_id", label: "National ID" },
  { id: "drivers_license", label: "Driver's Licence" },
];

export function ProfileModal({ visible, onClose, profile }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mxcAddress } = useWallet();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"overview" | "kyc">("overview");
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [kycName, setKycName] = useState("");
  const [kycDoc, setKycDoc] = useState("passport");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");

  const completionRate = profile
    ? profile.totalTrades > 0
      ? ((profile.completedTrades / profile.totalTrades) * 100).toFixed(1)
      : "100.0"
    : "—";

  async function handleSaveProfile() {
    if (!mxcAddress) return;
    if (!displayName.trim()) { setToast("Enter a display name"); return; }
    setLoading(true);
    try {
      await p2pApi.upsertProfile({ mxcAddress, displayName: displayName.trim() });
      queryClient.invalidateQueries({ queryKey: ["p2p_profile"] });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setToast("Profile saved");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitKyc() {
    if (!mxcAddress) return;
    if (!displayName.trim() || !kycName.trim()) { setToast("Fill in all fields"); return; }
    setLoading(true);
    try {
      await p2pApi.submitKyc({ mxcAddress, displayName: displayName.trim(), kycName: kycName.trim(), kycDocType: kycDoc });
      queryClient.invalidateQueries({ queryKey: ["p2p_profile"] });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setToast("KYC submitted — pending review");
      setTab("overview");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setLoading(false);
    }
  }

  const kycColor = profile?.kycStatus === "verified" ? "#10B981" : profile?.kycStatus === "pending" ? "#F59E0B" : profile?.kycStatus === "rejected" ? "#EF4444" : colors.mutedForeground;
  const kycLabel = profile?.kycStatus === "verified" ? "Verified" : profile?.kycStatus === "pending" ? "Pending Review" : profile?.kycStatus === "rejected" ? "Rejected" : "Not Submitted";

  const s = StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.72)" },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 16, maxHeight: "92%" },
    handle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    tabBar: { flexDirection: "row", marginHorizontal: 20, marginTop: 14, marginBottom: 4, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 3 },
    tabBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" },
    tabBtnActive: { backgroundColor: colors.primary + "20", borderWidth: 1, borderColor: colors.primary + "50" },
    tabText: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    tabTextActive: { fontFamily: "Inter_700Bold", color: colors.primary },
    scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
    avatarWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary + "20", alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 10, borderWidth: 2, borderColor: colors.primary + "40" },
    avatarText: { fontSize: 26, fontFamily: "Inter_700Bold", color: colors.primary },
    nameText: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center" },
    addrText: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", marginBottom: 8 },
    badgeRow: { flexDirection: "row", justifyContent: "center", gap: 6, flexWrap: "wrap", marginBottom: 14 },
    badgeKyc: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: "#10B98115", borderWidth: 1, borderColor: "#10B98140" },
    badgeKycText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#10B981" },
    badgeVerified: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: "#0EA5E915", borderWidth: 1, borderColor: "#0EA5E960" },
    badgeVerifiedText: { fontSize: 10, fontFamily: "Inter_700Bold", color: colors.primary },
    badgeMerchant: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: "#F59E0B15", borderWidth: 1, borderColor: "#F59E0B40" },
    badgeMerchantText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#F59E0B" },
    badgeVolume: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: "#FFFFFF08", borderWidth: 1, borderColor: "#FFFFFF20" },
    badgeVolumeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: colors.mutedForeground },
    statsRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
    statBox: { flex: 1, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, alignItems: "center" },
    statVal: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
    statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    kycCard: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 18, flexDirection: "row", alignItems: "center", gap: 12 },
    kycLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    kycSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
    label: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1.2, marginBottom: 8 },
    input: { backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground, marginBottom: 14 },
    docGrid: { flexDirection: "row", gap: 8, marginBottom: 18 },
    docChip: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center" },
    docChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + "15" },
    docText: { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    docTextActive: { color: colors.primary, fontFamily: "Inter_600SemiBold" },
    btn: { borderRadius: 14, overflow: "hidden", marginTop: 4 },
    btnGrad: { paddingVertical: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
    btnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FFF" },
    infoBox: { backgroundColor: "#0EA5E910", borderRadius: 10, borderWidth: 1, borderColor: "#0EA5E930", padding: 12, marginBottom: 18 },
    infoText: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 18 },
  });

  const initial = (profile?.displayName ?? mxcAddress ?? "?").slice(0, 2).toUpperCase();

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={s.overlay} onPress={onClose} />
        <View style={s.sheet}>
              <View style={s.handle} />
              <View style={s.header}>
                <Text style={s.title}>P2P Profile</Text>
                <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                  <Icon name="close" size={16} color={colors.foreground} />
                </TouchableOpacity>
              </View>

              {/* Tabs */}
              <View style={s.tabBar}>
                {(["overview", "kyc"] as const).map(t => (
                  <TouchableOpacity key={t} style={[s.tabBtn, tab === t && s.tabBtnActive]} onPress={() => setTab(t)}>
                    <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t === "overview" ? "Overview" : "KYC Verification"}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
                {tab === "overview" ? (
                  <>
                    <View style={s.avatarWrap}>
                      <Text style={s.avatarText}>{initial}</Text>
                    </View>
                    <Text style={s.nameText}>{profile?.displayName ?? "New Trader"}</Text>
                    <Text style={s.addrText}>{mxcAddress ? `${mxcAddress.slice(0, 12)}…${mxcAddress.slice(-6)}` : "—"}</Text>

                    {/* Badges row */}
                    {(profile?.kycStatus === "verified" || profile?.isMerchant || (profile?.completedTrades ?? 0) >= 10) && (
                      <View style={s.badgeRow}>
                        {profile?.kycStatus === "verified" && (
                          <View style={s.badgeKyc}><Text style={s.badgeKycText}>✓ KYC Verified</Text></View>
                        )}
                        {profile?.isMerchant && profile?.kycStatus === "verified" && (
                          <View style={s.badgeVerified}><Text style={s.badgeVerifiedText}>✦ Trusted Merchant</Text></View>
                        )}
                        {profile?.isMerchant && profile?.kycStatus !== "verified" && (
                          <View style={s.badgeMerchant}><Text style={s.badgeMerchantText}>Merchant</Text></View>
                        )}
                        {(profile?.completedTrades ?? 0) >= 500 && (
                          <View style={s.badgeVolume}><Text style={s.badgeVolumeText}>💎 Platinum</Text></View>
                        )}
                        {(profile?.completedTrades ?? 0) >= 100 && (profile?.completedTrades ?? 0) < 500 && (
                          <View style={s.badgeVolume}><Text style={s.badgeVolumeText}>🥇 Gold</Text></View>
                        )}
                        {(profile?.completedTrades ?? 0) >= 50 && (profile?.completedTrades ?? 0) < 100 && (
                          <View style={s.badgeVolume}><Text style={s.badgeVolumeText}>🥈 Silver</Text></View>
                        )}
                        {(profile?.completedTrades ?? 0) >= 10 && (profile?.completedTrades ?? 0) < 50 && (
                          <View style={s.badgeVolume}><Text style={s.badgeVolumeText}>🥉 Bronze</Text></View>
                        )}
                      </View>
                    )}

                    <View style={s.statsRow}>
                      <View style={s.statBox}>
                        <Text style={s.statVal}>{profile?.completedTrades ?? 0}</Text>
                        <Text style={s.statLabel}>Trades</Text>
                      </View>
                      <View style={s.statBox}>
                        <Text style={s.statVal}>{completionRate}%</Text>
                        <Text style={s.statLabel}>Completion</Text>
                      </View>
                      <View style={s.statBox}>
                        <StarRating rating={parseFloat(profile?.avgRating ?? "0")} />
                        <Text style={s.statLabel}>Rating</Text>
                      </View>
                    </View>

                    <View style={s.kycCard}>
                      <Icon name={profile?.kycStatus === "verified" ? "checkmark-circle" : "shield-outline"} size={24} color={kycColor} />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.kycLabel, { color: kycColor }]}>KYC {kycLabel}</Text>
                        <Text style={s.kycSub}>
                          {profile?.kycStatus === "verified" ? "Identity verified — builds trust with traders" :
                           profile?.kycStatus === "pending" ? "Your documents are under review" :
                           "Verify your identity to become a trusted trader"}
                        </Text>
                      </View>
                      {(!profile?.kycStatus || profile.kycStatus === "none" || profile.kycStatus === "rejected") && (
                        <TouchableOpacity onPress={() => setTab("kyc")}>
                          <Icon name="chevron-forward" size={16} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      )}
                    </View>

                    <Text style={s.label}>DISPLAY NAME</Text>
                    <TextInput style={s.input} value={displayName} onChangeText={setDisplayName} placeholder="Your trader name" placeholderTextColor={colors.mutedForeground} maxLength={50} />

                    <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={handleSaveProfile} disabled={loading} activeOpacity={0.85}>
                      <LinearGradient colors={["#0EA5E9", "#0284C7"]} style={s.btnGrad}>
                        {loading ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnText}>Save Profile</Text>}
                      </LinearGradient>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <View style={s.infoBox}>
                      <Text style={s.infoText}>KYC verification increases your trading limits and builds trust. Your data is stored securely and used only for identity verification purposes.</Text>
                    </View>

                    <Text style={s.label}>DISPLAY NAME</Text>
                    <TextInput style={s.input} value={displayName} onChangeText={setDisplayName} placeholder="Name shown to traders" placeholderTextColor={colors.mutedForeground} />

                    <Text style={s.label}>LEGAL FULL NAME (as on document)</Text>
                    <TextInput style={s.input} value={kycName} onChangeText={setKycName} placeholder="First and last name" placeholderTextColor={colors.mutedForeground} />

                    <Text style={s.label}>DOCUMENT TYPE</Text>
                    <View style={s.docGrid}>
                      {KYC_DOCS.map(d => (
                        <TouchableOpacity key={d.id} style={[s.docChip, kycDoc === d.id && s.docChipActive]} onPress={() => setKycDoc(d.id)}>
                          <Text style={[s.docText, kycDoc === d.id && s.docTextActive]}>{d.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={handleSubmitKyc} disabled={loading} activeOpacity={0.85}>
                      <LinearGradient colors={["#10B981", "#059669"]} style={s.btnGrad}>
                        {loading ? <ActivityIndicator color="#FFF" /> : <><Icon name="shield-checkmark-outline" size={16} color="#FFF" /><Text style={s.btnText}>Submit for Verification</Text></>}
                      </LinearGradient>
                    </TouchableOpacity>
                  </>
                )}
              </ScrollView>
        </View>
      </KeyboardAvoidingView>
      <Toast message={toast} visible={!!toast} onHide={() => setToast("")} />
    </Modal>
  );
}
