import React, { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const { width: SW, height: SH } = Dimensions.get("screen");
const BG = "#060E1A";
const BLUE = "#0EA5E9";
const BLUE_DARK = "#0369A1";
const MIN_MS = 1800; // minimum time splash stays visible

export function SplashLoader({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const mountTime = useRef(Date.now());

  // entrance
  const logoScale   = useRef(new Animated.Value(0.78)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const barWidth    = useRef(new Animated.Value(0)).current;
  const ringPulse   = useRef(new Animated.Value(1)).current;

  // exit
  const exitOpacity = useRef(new Animated.Value(1)).current;
  const [hidden, setHidden] = useState(false);

  // ── entrance sequence ─────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1, tension: 80, friction: 7, useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1, duration: 400, delay: 100, useNativeDriver: true,
      }),
      Animated.timing(textOpacity, {
        toValue: 1, duration: 380, delay: 320, useNativeDriver: true,
      }),
    ]).start();

    Animated.timing(barWidth, {
      toValue: 1, duration: MIN_MS - 200,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: false,
    }).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ringPulse, { toValue: 1.06, duration: 2200, useNativeDriver: true }),
        Animated.timing(ringPulse, { toValue: 1,    duration: 2200, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // ── exit when app ready (respect minimum display time) ───────
  useEffect(() => {
    if (!ready) return;
    const elapsed = Date.now() - mountTime.current;
    const delay = Math.max(0, MIN_MS - elapsed);
    const t = setTimeout(() => {
      Animated.timing(exitOpacity, {
        toValue: 0, duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setHidden(true);
        onDone();
      });
    }, delay);
    return () => clearTimeout(t);
  }, [ready]);

  if (hidden) return null;

  return (
    <Animated.View style={[s.root, { opacity: exitOpacity }]}>
      {/* ── rings ── */}
      <Animated.View style={[s.ringOuter, { transform: [{ scale: ringPulse }] }]}>
        <View style={s.ringMid}>
          <View style={s.ringInner}>
            <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
              <LinearGradient
                colors={[BLUE, BLUE_DARK]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={s.iconGrad}
              >
                <View style={s.chainMark}>
                  <View style={[s.chainLink, s.chainLinkTop]} />
                  <View style={[s.chainLink, s.chainLinkBot]} />
                </View>
              </LinearGradient>
            </Animated.View>
          </View>
        </View>
      </Animated.View>

      {/* ── brand ── */}
      <Animated.View style={[s.brand, { opacity: textOpacity }]}>
        <Text style={s.wordmark}>MCHAIN</Text>
        <Text style={s.tagline}>Validator Wallet</Text>
      </Animated.View>

      {/* ── pills ── */}
      <Animated.View style={[s.pillRow, { opacity: textOpacity }]}>
        {["Non-custodial", "256-bit", "On-chain"].map(label => (
          <View key={label} style={s.pill}>
            <Text style={s.pillText}>{label}</Text>
          </View>
        ))}
      </Animated.View>

      {/* ── progress bar ── */}
      <Animated.View
        style={[
          s.barFill,
          {
            width: barWidth.interpolate({
              inputRange: [0, 1],
              outputRange: ["0%", "100%"],
            }),
          },
        ]}
      >
        <LinearGradient
          colors={[BLUE_DARK, BLUE, "#38BDF8"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0, left: 0,
    width: SW, height: SH,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    elevation: 9999,
  },
  ringOuter: {
    width: 196, height: 196, borderRadius: 98,
    borderWidth: 1, borderColor: `${BLUE}12`,
    alignItems: "center", justifyContent: "center",
    marginBottom: 36,
  },
  ringMid: {
    width: 155, height: 155, borderRadius: 78,
    borderWidth: 1, borderColor: `${BLUE}26`,
    alignItems: "center", justifyContent: "center",
  },
  ringInner: {
    width: 118, height: 118, borderRadius: 59,
    borderWidth: 1.5, borderColor: `${BLUE}44`,
    backgroundColor: `${BLUE}09`,
    alignItems: "center", justifyContent: "center",
  },
  iconGrad: {
    width: 90, height: 90, borderRadius: 45,
    alignItems: "center", justifyContent: "center",
  },
  chainMark: { width: 36, height: 40, alignItems: "center", justifyContent: "center" },
  chainLink: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 4, borderColor: "rgba(255,255,255,0.95)",
    position: "absolute",
  },
  chainLinkTop: { top: 0, left: 0 },
  chainLinkBot: { bottom: 0, right: 0 },
  brand: { alignItems: "center", marginBottom: 22 },
  wordmark: {
    fontSize: 12, letterSpacing: 7, marginBottom: 8,
    color: BLUE,
  },
  tagline: {
    fontSize: 26, color: "#F1F5F9", letterSpacing: 0.2,
  },
  pillRow: { flexDirection: "row", gap: 8 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: `${BLUE}22`, backgroundColor: `${BLUE}0A`,
  },
  pillText: { fontSize: 11, color: "#94A3B8" },
  barFill: {
    position: "absolute", bottom: 0, left: 0,
    height: 3, overflow: "hidden",
  },
});
