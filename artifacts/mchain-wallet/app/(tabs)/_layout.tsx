import { Icon } from "@/components/Icon";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function TabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isWeb = Platform.OS === "web";
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          position: "absolute",
          backgroundColor:
            Platform.OS === "ios" ? "transparent" : colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          paddingBottom: isWeb ? 0 : Math.max(insets.bottom, 10),
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView
              intensity={80}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: colors.card },
              ]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Icon name={focused ? "home" : "home-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="send" options={{ href: null }} />
      <Tabs.Screen name="receive" options={{ href: null }} />
      <Tabs.Screen name="cards" options={{ href: null }} />
      <Tabs.Screen
        name="validator"
        options={{
          title: "Validator",
          tabBarIcon: ({ color, focused }) => (
            <Icon name={focused ? "shield" : "shield-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="earnings" options={{ href: null }} />
      <Tabs.Screen
        name="p2p"
        options={{
          title: "P2P",
          tabBarIcon: ({ color, focused }) => (
            <Icon name={focused ? "swap-horizontal" : "swap-horizontal-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="dapp"
        options={{
          title: "dApps",
          tabBarIcon: ({ color, focused }) => (
            <Icon name={focused ? "globe" : "globe-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, focused }) => (
            <Icon name={focused ? "settings" : "settings-outline"} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
