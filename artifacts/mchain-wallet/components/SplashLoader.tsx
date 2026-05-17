import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const BG = "#060E1A";
const BLUE = "#0EA5E9";
const BLUE_DARK = "#0369A1";

export function SplashLoader({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  // ── entrance animations ──────────────────────────────────────
  const fadeIn   = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.82)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const barWidth  = useRef(new Animated.Value(0)).current;

  // ── exit animation ───────────────────────────────────────────
  const exitOpacity = useRef(new Animated.Value(1)).current;
  const [hidden, setHidden] = useState(false);

  // ── concentric ring pulse ─────────────────────────────────────
  const ringPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 1. Fade-in whole screen
    Animated.timing(fadeIn, {
      toValue: 1, duration: 280, useNativeDriver: true,
    }).start();

    // 2. Logo pops in with spring
    Animated.sequence([
      Animated.delay(160),
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 90, friction: 7, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      ]),
    ]).start();

    // 3. Brand text fades in
    Animated.sequence([
      Animated.delay(380),
      Animated.timing(textOpacity, { toValue: 1, duration: 340, useNativeDriver: true }),
    ]).start();

    // 4. Progress bar slides across
    Animated.sequence([
      Animated.delay(480),
      Animated.timing(barWidth, {
        toValue: 1,
        duration: 1600,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: false,
      }),
    ]).start();

    // 5. Ring pulse loop
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ringPulse, { toValue: 1.07, duration: 2000, useNativeDriver: true }),
        Animated.timing(ringPulse, { toValue: 1,    duration: 2000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // ── exit when app is ready ────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    Animated.timing(exitOpacity, {
      toValue: 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setHidden(true);
      onDone();
    });
  }, [ready]);

  if (hidden) return null;

  return (
    <Animated.View style={[s.root, { opacity: exitOpacity }]}>
      <Animated.View style={[s.inner, { opacity: fadeIn }]}>

        {/* ── Concentric glow rings ── */}
        <Animated.View style={[s.ringOuter, { transform: [{ scale: ringPulse }] }]}>
          <View style={s.ringMid}>
            <View style={s.ringInner}>
              <Animated.View style={[s.iconWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
                <LinearGradient
                  colors={[BLUE, BLUE_DARK]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.iconGrad}
                >
                  {/* Chain link mark — pure geometric */}
                  <View style={s.chainMark}>
                    <View style={[s.chainLink, s.chainLinkTop]} />
                    <View style={[s.chainLink, s.chainLinkBot]} />
                  </View>
                </LinearGradient>
              </Animated.View>
            </View>
          </View>
        </Animated.View>

        {/* ── Brand text ── */}
        <Animated.View style={[s.brand, { opacity: textOpacity }]}>
          <Text style={s.wordmark}>MCHAIN</Text>
          <Text style={s.tagline}>Validator Wallet</Text>
        </Animated.View>

        {/* ── Trust pills ── */}
        <Animated.View style={[s.pillRow, { opacity: textOpacity }]}>
          {["Non-custodial", "256-bit", "On-chain"].map(label => (
            <View key={label} style={s.pill}>
              <Text style={s.pillText}>{label}</Text>
            </View>
          ))}
        </Animated.View>
      </Animated.View>

      {/* ── Bottom progress bar (absolute) ── */}
      <Animated.View style={[s.barTrack, { opacity: textOpacity }]}>
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
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  inner: {
    alignItems: "center",
  },

  // Rings
  ringOuter: {
    width: 192, height: 192, borderRadius: 96,
    borderWidth: 1, borderColor: `${BLUE}14`,
    alignItems: "center", justifyContent: "center",
    marginBottom: 36,
  },
  ringMid: {
    width: 152, height: 152, borderRadius: 76,
    borderWidth: 1, borderColor: `${BLUE}28`,
    alignItems: "center", justifyContent: "center",
  },
  ringInner: {
    width: 116, height: 116, borderRadius: 58,
    borderWidth: 1.5, borderColor: `${BLUE}45`,
    backgroundColor: `${BLUE}0A`,
    alignItems: "center", justifyContent: "center",
  },
  iconWrap: { width: 88, height: 88, borderRadius: 44 },
  iconGrad: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: "center", justifyContent: "center",
  },

  // Geometric chain link mark
  chainMark: { width: 36, height: 40, alignItems: "center", justifyContent: "center" },
  chainLink: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 4, borderColor: "rgba(255,255,255,0.95)",
    position: "absolute",
  },
  chainLinkTop: { top: 0, left: 0 },
  chainLinkBot: { bottom: 0, right: 0 },

  // Brand
  brand: { alignItems: "center", marginBottom: 20 },
  wordmark: {
    fontSize: 13, fontFamily: "Inter_700Bold",
    color: BLUE, letterSpacing: 6, marginBottom: 8,
  },
  tagline: {
    fontSize: 26, fontFamily: "Inter_700Bold",
    color: "#F1F5F9", letterSpacing: 0.3,
  },

  // Pills
  pillRow: { flexDirection: "row", gap: 8 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
    borderColor: `${BLUE}25`,
    backgroundColor: `${BLUE}0C`,
  },
  pillText: {
    fontSize: 11, fontFamily: "Inter_500Medium",
    color: "#94A3B8",
  },

  // Progress bar
  barTrack: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    height: 3, backgroundColor: `${BLUE}15`,
  },
  barFill: { height: 3, overflow: "hidden" },
});
