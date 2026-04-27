/**
 * SPEAQ Lock Screen
 * Face ID / Touch ID / PIN code authentication
 * Shows every time the app opens
 */

import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Alert } from "react-native";
import { colors, spacing, radius } from "../theme/brand";
import Logo from "../components/Logo";

interface Props {
  onUnlock: () => void;
  isFirstTime: boolean;
}

export default function LockScreen({ onUnlock, isFirstTime }: Props) {
  const [pin, setPin] = useState("");
  const [settingPin, setSettingPin] = useState(isFirstTime);
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">("enter");

  // In production: use react-native-biometrics for Face ID / Touch ID
  // For now: PIN code authentication

  function handlePinSubmit() {
    if (settingPin) {
      if (step === "enter") {
        if (pin.length < 4) {
          Alert.alert("PIN too short", "Enter at least 4 digits.");
          return;
        }
        setStep("confirm");
        setConfirmPin(pin);
        setPin("");
      } else {
        if (pin === confirmPin) {
          // PIN set successfully - in production: save encrypted
          onUnlock();
        } else {
          Alert.alert("PINs don't match", "Try again.");
          setStep("enter");
          setPin("");
          setConfirmPin("");
        }
      }
    } else {
      // In production: verify against stored PIN
      if (pin.length >= 4) {
        onUnlock();
      }
    }
  }

  function handleDigit(digit: string) {
    if (pin.length < 6) setPin(pin + digit);
  }

  function handleDelete() {
    setPin(pin.slice(0, -1));
  }

  const title = settingPin
    ? step === "enter" ? "Set Your PIN" : "Confirm Your PIN"
    : "Enter PIN";

  const subtitle = settingPin
    ? step === "enter" ? "Choose a PIN to secure your SPEAQ identity" : "Enter the same PIN again"
    : "Unlock to access SPEAQ";

  return (
    <View style={styles.container}>
      <View style={styles.logoWrap}>
        <Logo />
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      {/* PIN dots */}
      <View style={styles.dotsRow}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
        ))}
      </View>

      {/* Numpad */}
      <View style={styles.numpad}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "del"].map((key) => (
          <TouchableOpacity
            key={key || "empty"}
            style={[styles.numKey, key === "" && styles.numKeyEmpty]}
            onPress={() => {
              if (key === "del") handleDelete();
              else if (key === "") return;
              else if (key === "*") return;
              else handleDigit(key);
            }}
            activeOpacity={0.6}
            disabled={key === ""}
          >
            <Text style={[styles.numKeyText, key === "del" && styles.numKeyDel, key === "*" && { fontSize: 28, color: "#D4A853" }]}>
              {key === "del" ? "←" : key === "*" ? "✱" : key}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Submit - always rendered to reserve layout space, hidden until pin >= 4
          so the numpad does not shift the moment the 4th digit is entered. */}
      <TouchableOpacity
        style={[styles.unlockBtn, pin.length < 4 && { opacity: 0 }]}
        onPress={handlePinSubmit}
        activeOpacity={0.8}
        disabled={pin.length < 4}
        pointerEvents={pin.length < 4 ? "none" : "auto"}
        accessibilityElementsHidden={pin.length < 4}
        importantForAccessibility={pin.length < 4 ? "no-hide-descendants" : "auto"}
      >
        <Text style={styles.unlockText}>{settingPin ? (step === "enter" ? "Next" : "Set PIN") : "Unlock"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.depth.void, alignItems: "center", justifyContent: "center" },

  logoWrap: { marginBottom: 32 },

  title: { color: colors.signal.white, fontSize: 20, fontWeight: "600", marginBottom: 6 },
  subtitle: { color: colors.signal.steel, fontSize: 12, marginBottom: 32 },

  dotsRow: { flexDirection: "row", gap: 12, marginBottom: 40 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: colors.voice.gold },
  dotFilled: { backgroundColor: colors.voice.gold },

  numpad: { flexDirection: "row", flexWrap: "wrap", width: 240, justifyContent: "center" },
  numKey: {
    width: 72, height: 56, alignItems: "center", justifyContent: "center",
    margin: 4, borderRadius: radius.md, backgroundColor: colors.depth.card,
  },
  numKeyEmpty: { backgroundColor: "transparent" },
  numKeyText: { color: colors.signal.white, fontSize: 24, fontWeight: "400" },
  numKeyDel: { fontSize: 20 },

  unlockBtn: {
    backgroundColor: colors.voice.gold, paddingHorizontal: 40, paddingVertical: 12,
    borderRadius: radius.lg, marginTop: 24,
  },
  unlockText: { color: colors.depth.void, fontSize: 15, fontWeight: "600" },
});
