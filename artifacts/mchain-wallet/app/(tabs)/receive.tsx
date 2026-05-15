import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWallet } from "@/context/WalletContext";
import { useColors } from "@/hooks/useColors";

export default function ReceiveScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { mxcAddress } = useWallet();

  async function handleCopy() {
    if (!mxcAddress) return;
    await Clipboard.setStringAsync(mxcAddress);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function handleShare() {
    if (!mxcAddress) return;
    try {
      await Share.share({ message: mxcAddress });
    } catch {
      // User cancelled
    }
  }

  const s = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    inner: {
      flex: 1,
      alignItems: "center",
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 24),
      paddingHorizontal: 24,
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 24),
    },
    title: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      marginBottom: 36,
    },
    qrWrapper: {
      backgroundColor: "#FFFFFF",
      borderRadius: colors.radius + 8,
      padding: 24,
      marginBottom: 28,
      shadowColor: "#0EA5E9",
      shadowOpacity: 0.15,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    addressBox: {
      width: "100%",
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 16,
    },
    addressLabel: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      letterSpacing: 1.5,
      marginBottom: 8,
    },
    addressText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.primary,
      lineHeight: 20,
    },
    actionRow: {
      flexDirection: "row",
      width: "100%",
      gap: 12,
    },
    actionBtn: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: colors.radius - 4,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    actionText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
  });

  return (
    <View style={s.container}>
      <View style={s.inner}>
        <Text style={s.title}>Receive MC</Text>
        <Text style={s.subtitle}>Share your address to receive MC tokens</Text>

        <View style={s.qrWrapper}>
          {mxcAddress ? (
            <QRCode
              value={mxcAddress}
              size={220}
              color="#000000"
              backgroundColor="#FFFFFF"
            />
          ) : (
            <View style={{ width: 220, height: 220, backgroundColor: "#F0F0F0" }} />
          )}
        </View>

        <View style={s.addressBox}>
          <Text style={s.addressLabel}>YOUR MXC ADDRESS</Text>
          <Text style={s.addressText} selectable>
            {mxcAddress ?? "Loading..."}
          </Text>
        </View>

        <View style={s.actionRow}>
          <TouchableOpacity style={s.actionBtn} onPress={handleCopy}>
            <Feather name="copy" size={16} color={colors.primary} />
            <Text style={s.actionText}>Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={handleShare}>
            <Feather name="share-2" size={16} color={colors.primary} />
            <Text style={s.actionText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
