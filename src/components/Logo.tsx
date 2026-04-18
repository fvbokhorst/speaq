/**
 * SPEAQ Logo - shared component.
 * Mirrors the PWA rendering exactly:
 *   <span text-3xl font-heading>SPEA</span>
 *   <div w-9 h-9 rounded-full border border-voice-gold>
 *     <span text-2xl font-heading>Q</span>
 *     <div w-1 h-1 bottom-1 right-2 bg-quantum-teal />
 *   </div>
 *
 * Tailwind -> RN conversion (4px per unit, 16px text base):
 *   text-3xl = 30, text-2xl = 24, w-9 = 36, w-1 = 4, bottom-1 = 4, right-2 = 8, ml-0.5 = 2.
 */

import React from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { colors, fonts } from "../theme/brand";

type Props = {
  glowAnim?: Animated.Value;
};

export default function Logo({ glowAnim }: Props) {
  const circle = (
    <View style={styles.qCircle}>
      <Text style={styles.qLetter}>Q</Text>
      <View style={styles.qBall} />
    </View>
  );

  return (
    <View style={styles.row}>
      <Text style={styles.spea}>SPEA</Text>
      {glowAnim ? (
        <Animated.View
          style={[
            styles.qCircle,
            {
              shadowColor: colors.voice.gold,
              shadowOffset: { width: 0, height: 0 },
              shadowRadius: 8,
              shadowOpacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.5] }),
            },
          ]}
        >
          <Text style={styles.qLetter}>Q</Text>
          <View style={styles.qBall} />
        </Animated.View>
      ) : (
        circle
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  spea: {
    fontSize: 30,
    fontFamily: fonts.display,
    fontWeight: "700",
    color: colors.signal.white,
    letterSpacing: -0.75,
  },
  qCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.voice.gold,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  qLetter: {
    fontSize: 24,
    fontFamily: fonts.display,
    fontWeight: "700",
    color: colors.voice.gold,
    marginTop: -2,
  },
  qBall: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.quantum.teal,
    position: "absolute",
    bottom: 4,
    right: 8,
  },
});
