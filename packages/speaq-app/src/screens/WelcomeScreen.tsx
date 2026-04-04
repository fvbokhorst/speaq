import React, { useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { colors, spacing, radius } from "../theme/brand";

interface Props {
  onCreateIdentity: () => void;
}

export default function WelcomeScreen({ onCreateIdentity }: Props) {
  const glowAnim = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1500, useNativeDriver: false }),
      ])
    ).start();
    Animated.timing(fadeIn, { toValue: 1, duration: 800, delay: 200, useNativeDriver: true }).start();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeIn }]}>

        {/* SPEAQ logo: SPEA + Q with circle and teal dot */}
        <View style={styles.logoRow}>
          <Text style={styles.spea}>SPEA</Text>
          {/* Brand guide Q: letter inside circle with teal ball */}
          <Animated.View style={[styles.qCircle, {
            shadowOpacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.5] })
          }]}>
            <Text style={styles.qLetter}>Q</Text>
            <View style={styles.qBall} />
          </Animated.View>
        </View>

        {/* SPEAQ Freely */}
        <Text style={styles.freely}>SPEAQ Freely.</Text>

        {/* Golden circle with tagline - pulsing gold glow */}
        <Animated.View style={[styles.taglineCircle, {
          borderColor: glowAnim.interpolate({
            inputRange: [0, 1],
            outputRange: ["rgba(212, 168, 83, 0.2)", "rgba(212, 168, 83, 0.7)"]
          }),
          shadowOpacity: glowAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.05, 0.4]
          }),
        }]}>
          <Text style={styles.taglineText}>Your voice.{"\n"}Your money.{"\n"}Your freedom.</Text>
        </Animated.View>

        {/* CTA */}
        <TouchableOpacity style={styles.cta} onPress={onCreateIdentity} activeOpacity={0.8}>
          <Text style={styles.ctaLabel}>Create Your Identity</Text>
        </TouchableOpacity>
        <Text style={styles.ctaSub}>No phone number. No email. No registration.</Text>

      </Animated.View>

      <View style={styles.bottom}>
        <Text style={styles.bottomText}>Quantum Encrypted  -  Uncensorable  -  No ID Required</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.depth.void, alignItems: "center", justifyContent: "center" },
  content: { alignItems: "center" },

  // SPEAQ logo row: SPEA text + Q in circle
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  spea: {
    fontSize: 48,
    fontWeight: "700",
    fontFamily: "Georgia",
    color: colors.signal.white,
    letterSpacing: -1,
  },
  // Q with circle and teal ball - matches brand guide exactly
  qCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: colors.voice.gold,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
    shadowColor: colors.voice.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 15,
  },
  qLetter: {
    fontSize: 36,
    fontWeight: "700",
    fontFamily: "Georgia",
    color: colors.voice.gold,
    marginTop: -2,
  },
  qBall: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.quantum.teal,
    position: "absolute",
    bottom: 8,
    right: 12,
  },

  // SPEAQ Freely
  freely: {
    color: colors.voice.warm,
    fontSize: 13,
    fontStyle: "italic",
    fontFamily: "Georgia",
    marginTop: 12,
    letterSpacing: 1,
  },

  // Golden circle with tagline
  taglineCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1.5,
    backgroundColor: colors.voice.gold,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 36,
    shadowColor: colors.voice.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
  },
  taglineText: {
    color: colors.signal.white,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    fontWeight: "600",
    letterSpacing: 0.3,
  },

  // CTA
  cta: {
    backgroundColor: colors.voice.gold,
    paddingHorizontal: 32,
    paddingVertical: 13,
    borderRadius: radius.lg,
    marginTop: 40,
    shadowColor: colors.voice.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  ctaLabel: { color: colors.depth.void, fontSize: 15, fontWeight: "600", letterSpacing: 0.5 },
  ctaSub: { color: colors.signal.steel, fontSize: 10, marginTop: 10 },

  // Bottom
  bottom: { position: "absolute", bottom: 44 },
  bottomText: { color: colors.signal.steel, fontSize: 9, letterSpacing: 0.5 },
});
