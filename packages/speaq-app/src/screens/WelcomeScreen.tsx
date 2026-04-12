import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated, TextInput, Modal } from "react-native";
import { colors, spacing, radius } from "../theme/brand";

interface Props {
  onCreateIdentity: (name: string) => void;
}

export default function WelcomeScreen({ onCreateIdentity }: Props) {
  const [showNameModal, setShowNameModal] = useState(false);
  const [name, setName] = useState("");
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

        {/* SPEAQ logo */}
        <View style={styles.logoRow}>
          <Text style={styles.spea}>SPEA</Text>
          <Animated.View style={[styles.qCircle, {
            shadowOpacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.1, 0.5] })
          }]}>
            <Text style={styles.qLetter}>Q</Text>
            <View style={styles.qBall} />
          </Animated.View>
        </View>

        <Text style={styles.freely}>SPEAQ Freely.</Text>

        {/* Pulsing gold circle with tagline */}
        <Animated.View style={[styles.taglineCircle, {
          borderColor: glowAnim.interpolate({
            inputRange: [0, 1],
            outputRange: ["rgba(212, 168, 83, 0.3)", "rgba(212, 168, 83, 0.8)"]
          }),
          shadowOpacity: glowAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.05, 0.4]
          }),
        }]}>
          <Text style={styles.taglineText}>Your voice.{"\n"}Your money.{"\n"}Your freedom.</Text>
        </Animated.View>

        {/* CTA - clean, no input field */}
        <TouchableOpacity style={styles.cta} onPress={() => setShowNameModal(true)} activeOpacity={0.8}>
          <Text style={styles.ctaLabel}>Create Your Identity</Text>
        </TouchableOpacity>
        <Text style={styles.ctaSub}>No phone number. No email. No registration.</Text>

      </Animated.View>

      <View style={styles.bottom}>
        <Text style={styles.bottomText}>Quantum Encrypted  -  Uncensorable  -  No ID Required</Text>
      </View>

      {/* Name input modal - appears after tapping Create Your Identity */}
      <Modal visible={showNameModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Your Identity</Text>
            <Text style={styles.modalSub}>Choose a display name. This is how others will see you.</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.signal.steel}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => name.trim() && onCreateIdentity(name.trim())}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowNameModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, !name.trim() && styles.modalDisabled]}
                onPress={() => name.trim() && onCreateIdentity(name.trim())}
                disabled={!name.trim()}
              >
                <Text style={styles.modalConfirmText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.depth.void, alignItems: "center", justifyContent: "center" },
  content: { alignItems: "center" },

  logoRow: { flexDirection: "row", alignItems: "center" },
  spea: { fontSize: 48, fontWeight: "700", fontFamily: "Georgia", color: colors.signal.white, letterSpacing: -1 },
  qCircle: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 1.5, borderColor: colors.voice.gold,
    alignItems: "center", justifyContent: "center", marginLeft: 2,
    shadowColor: colors.voice.gold, shadowOffset: { width: 0, height: 0 }, shadowRadius: 15,
  },
  qLetter: { fontSize: 36, fontWeight: "700", fontFamily: "Georgia", color: colors.voice.gold, marginTop: -2 },
  qBall: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.quantum.teal, position: "absolute", bottom: 8, right: 12 },

  freely: { color: colors.voice.warm, fontSize: 13, fontStyle: "italic", fontFamily: "Georgia", marginTop: 12, letterSpacing: 1 },

  taglineCircle: {
    width: 160, height: 160, borderRadius: 80, borderWidth: 1.5,
    backgroundColor: colors.voice.gold, alignItems: "center", justifyContent: "center", marginTop: 36,
    shadowColor: colors.voice.gold, shadowOffset: { width: 0, height: 0 }, shadowRadius: 20,
  },
  taglineText: { color: colors.signal.white, fontSize: 14, textAlign: "center", lineHeight: 22, fontWeight: "600", letterSpacing: 0.3 },

  cta: {
    backgroundColor: colors.voice.gold, paddingHorizontal: 32, paddingVertical: 13,
    borderRadius: radius.lg, marginTop: 48,
    shadowColor: colors.voice.gold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8,
  },
  ctaLabel: { color: colors.depth.void, fontSize: 15, fontWeight: "600", letterSpacing: 0.5 },
  ctaSub: { color: colors.signal.steel, fontSize: 10, marginTop: 10 },

  bottom: { position: "absolute", bottom: 44 },
  bottomText: { color: colors.signal.steel, fontSize: 9, letterSpacing: 0.5 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" },
  modalBox: {
    width: 300, backgroundColor: colors.depth.card, borderRadius: radius.lg,
    padding: 28, borderWidth: 1, borderColor: colors.border.subtle,
  },
  modalTitle: { color: colors.signal.white, fontSize: 20, fontWeight: "600", fontFamily: "Georgia", marginBottom: 8 },
  modalSub: { color: colors.signal.steel, fontSize: 12, marginBottom: 20, lineHeight: 18 },
  nameInput: {
    backgroundColor: colors.depth.elevated, borderWidth: 1, borderColor: colors.border.subtle,
    borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14,
    color: colors.signal.white, fontSize: 16, marginBottom: 20,
  },
  modalButtons: { flexDirection: "row", gap: 12 },
  modalCancel: { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border.subtle, alignItems: "center" },
  modalCancelText: { color: colors.signal.steel, fontSize: 14 },
  modalConfirm: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.voice.gold, alignItems: "center" },
  modalConfirmText: { color: colors.depth.void, fontSize: 14, fontWeight: "600" },
  modalDisabled: { opacity: 0.3 },
});
