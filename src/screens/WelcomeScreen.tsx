import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated, TextInput, Modal, Keyboard, ActivityIndicator } from "react-native";
import { spacing, radius } from "../theme/brand";
import { useThemedStyles, useTheme, ThemeColors } from "../theme/ThemeContext";
import Logo from "../components/Logo";

interface Props {
  onCreateIdentity: (name: string) => void;
}

export default function WelcomeScreen({ onCreateIdentity }: Props) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [showNameModal, setShowNameModal] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const glowAnim = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  // Close modal + dismiss keyboard before handing off to the parent -- so
  // on iPad the subsequent phase transition isn't blocked by the Modal
  // still being presented (iPadOS 26.5 regression: Alert presented while a
  // RN Modal is visible can render beneath the modal overlay).
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    Keyboard.dismiss();
    setShowNameModal(false);
    // Yield a frame so the modal unmount happens before the parent's
    // async work (which may show its own UI).
    setTimeout(() => onCreateIdentity(trimmed), 0);
  };

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

        <Logo glowAnim={glowAnim} />

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
        <Text style={styles.bottomText}>Verified Encryption  -  Your Data, Your Control</Text>
      </View>

      {/* Name input modal - appears after tapping Create Your Identity.
          presentationStyle="overFullScreen" + statusBarTranslucent makes
          iPad and iPhone render identically; default "fullScreen" opens
          as a sheet on iPad which broke the flow for reviewers. */}
      <Modal
        visible={showNameModal}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => !submitting && setShowNameModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Your Identity</Text>
            <Text style={styles.modalSub}>Choose a display name. This is how others will see you.</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={c.signal.steel}
              autoFocus
              returnKeyType="done"
              editable={!submitting}
              onSubmitEditing={submit}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => !submitting && setShowNameModal(false)}
                disabled={submitting}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, (!name.trim() || submitting) && styles.modalDisabled]}
                onPress={submit}
                disabled={!name.trim() || submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={c.depth.void} />
                ) : (
                  <Text style={styles.modalConfirmText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.depth.void, alignItems: "center", justifyContent: "center" },
  content: { alignItems: "center" },

  freely: { color: c.voice.warm, fontSize: 13, fontStyle: "italic", fontFamily: "Georgia", marginTop: 12, letterSpacing: 1 },

  taglineCircle: {
    width: 160, height: 160, borderRadius: 80, borderWidth: 1.5,
    backgroundColor: c.voice.gold, alignItems: "center", justifyContent: "center", marginTop: 36,
    shadowColor: c.voice.gold, shadowOffset: { width: 0, height: 0 }, shadowRadius: 20,
  },
  taglineText: { color: c.signal.white, fontSize: 14, textAlign: "center", lineHeight: 22, fontWeight: "600", letterSpacing: 0.3 },

  cta: {
    backgroundColor: c.voice.gold, paddingHorizontal: 32, paddingVertical: 13,
    borderRadius: radius.lg, marginTop: 48,
    shadowColor: c.voice.gold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8,
  },
  ctaLabel: { color: c.depth.void, fontSize: 15, fontWeight: "600", letterSpacing: 0.5 },
  ctaSub: { color: c.signal.steel, fontSize: 10, marginTop: 10 },

  bottom: { position: "absolute", bottom: 44 },
  bottomText: { color: c.signal.steel, fontSize: 9, letterSpacing: 0.5 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" },
  modalBox: {
    width: 300, backgroundColor: c.depth.card, borderRadius: radius.lg,
    padding: 28, borderWidth: 1, borderColor: c.border.subtle,
  },
  modalTitle: { color: c.signal.white, fontSize: 20, fontWeight: "600", fontFamily: "Georgia", marginBottom: 8 },
  modalSub: { color: c.signal.steel, fontSize: 12, marginBottom: 20, lineHeight: 18 },
  nameInput: {
    backgroundColor: c.depth.elevated, borderWidth: 1, borderColor: c.border.subtle,
    borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14,
    color: c.signal.white, fontSize: 16, marginBottom: 20,
  },
  modalButtons: { flexDirection: "row", gap: 12 },
  modalCancel: { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: c.border.subtle, alignItems: "center" },
  modalCancelText: { color: c.signal.steel, fontSize: 14 },
  modalConfirm: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: c.voice.gold, alignItems: "center" },
  modalConfirmText: { color: c.depth.void, fontSize: 14, fontWeight: "600" },
  modalDisabled: { opacity: 0.3 },
});
