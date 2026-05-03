import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated, TextInput, Modal, Keyboard, ActivityIndicator } from "react-native";
import { spacing, radius } from "../theme/brand";
import { useThemedStyles, useTheme, ThemeColors } from "../theme/ThemeContext";
import Logo from "../components/Logo";

interface Props {
  onCreateIdentity: (name: string) => Promise<void> | void;
}

// Multi-phase status messages shown while identity is being generated.
// Rotated every ~2.5 seconds so the user always sees the screen is alive.
// Order matches the actual work in src/services/speaq.ts createIdentity():
//   1. ensureKeystoreSalt + generateKyberKeyPair (FIPS 203 ML-KEM-768)
//   2. ensureSigningKeys (FIPS 204 ML-DSA-65)
//   3. generateDID + AsyncStorage encrypted save
//   4. connectRelay + initial WebSocket handshake
const STATUS_MESSAGES = [
  "Creating sovereign identity",
  "Generating quantum-secure keys (Kyber-768)",
  "Generating signature keys (ML-DSA-65)",
  "Sealing identity to device",
  "Connecting to SPEAQ network",
  "Almost ready",
];

const SOFT_WARNING_AFTER_MS = 15000; // soft hint
const HARD_TIMEOUT_MS = 60000;        // give up + retry

export default function WelcomeScreen({ onCreateIdentity }: Props) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [showNameModal, setShowNameModal] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [statusIndex, setStatusIndex] = useState(0);
  const [showSoftWarning, setShowSoftWarning] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const glowAnim = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  // Rotate phase messages while creating, until success or timeout.
  // Reviewer / user always sees text changing - clear "app is working" signal.
  useEffect(() => {
    if (!creating || timedOut) return;
    const startedAt = Date.now();
    const rotator = setInterval(() => {
      setStatusIndex((i) => (i + 1) % STATUS_MESSAGES.length);
    }, 2500);
    const softWarn = setTimeout(() => setShowSoftWarning(true), SOFT_WARNING_AFTER_MS);
    const hardLimit = setTimeout(() => {
      // Stop the rotator and surface a retry option. Apple reviewers explicitly
      // need an explicit error state if work doesn't finish in reasonable time
      // ("App loaded indefinitely" is the rejection reason for 1.0 build 5).
      void startedAt;
      setTimedOut(true);
    }, HARD_TIMEOUT_MS);
    return () => {
      clearInterval(rotator);
      clearTimeout(softWarn);
      clearTimeout(hardLimit);
    };
  }, [creating, timedOut]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1500, useNativeDriver: false }),
      ])
    ).start();
    Animated.timing(fadeIn, { toValue: 1, duration: 800, delay: 200, useNativeDriver: true }).start();
  }, []);

  const startCreate = (n: string) => {
    setStatusIndex(0);
    setShowSoftWarning(false);
    setTimedOut(false);
    setCreating(true);
    setShowNameModal(false);
    Keyboard.dismiss();
    // Yield a frame so the modal unmount finishes before the parent's
    // async work (which on iPad would otherwise compete with the modal).
    setTimeout(() => {
      Promise.resolve(onCreateIdentity(n)).catch((err) => {
        console.error("[WelcomeScreen] onCreateIdentity failed:", err);
        setTimedOut(true);
      });
    }, 0);
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    startCreate(trimmed);
  };

  const retry = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setCreating(false);
      setTimedOut(false);
      setShowNameModal(true);
      return;
    }
    startCreate(trimmed);
  };

  // Creating-identity full screen: replaces the welcome content while
  // post-quantum keygen runs. Reviewer always sees a phase message and a
  // spinner; after 15s a softer hint appears; after 60s a retry CTA.
  if (creating) {
    return (
      <View style={styles.container}>
        <View style={styles.creatingContent}>
          <Logo glowAnim={glowAnim} />
          <Text style={styles.creatingTitle}>{timedOut ? "Setup is taking longer than expected" : STATUS_MESSAGES[statusIndex]}</Text>
          {!timedOut && <ActivityIndicator color={c.voice.gold} size="large" style={styles.creatingSpinner} />}
          {!timedOut && (
            <Text style={styles.creatingSub}>
              {showSoftWarning
                ? "First-time setup is computational. Post-quantum keys are being generated on this device for maximum privacy. Hang on."
                : "Generating post-quantum cryptographic keys on-device. This takes a moment."}
            </Text>
          )}
          {timedOut && (
            <>
              <Text style={styles.creatingError}>
                Setup did not finish in the expected time. This can happen on slower networks or during first-time post-quantum key generation. You can try again now or check your internet connection first.
              </Text>
              <TouchableOpacity style={styles.retryButton} onPress={retry} activeOpacity={0.8}>
                <Text style={styles.retryLabel}>Try again</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        <View style={styles.bottom}>
          <Text style={styles.bottomText}>FIPS 203 ML-KEM-768  -  FIPS 204 ML-DSA-65  -  on-device</Text>
        </View>
      </View>
    );
  }

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
        onRequestClose={() => setShowNameModal(false)}
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
              onSubmitEditing={submit}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowNameModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, !name.trim() && styles.modalDisabled]}
                onPress={submit}
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

  // Creating-identity full screen
  creatingContent: { alignItems: "center", paddingHorizontal: spacing.lg, maxWidth: 360 },
  creatingTitle: {
    color: c.signal.white, fontSize: 18, fontWeight: "600", textAlign: "center",
    marginTop: 36, letterSpacing: 0.3, lineHeight: 24,
  },
  creatingSpinner: { marginTop: 28 },
  creatingSub: {
    color: c.signal.steel, fontSize: 13, textAlign: "center",
    marginTop: 24, lineHeight: 20,
  },
  creatingError: {
    color: c.voice.warm, fontSize: 13, textAlign: "center",
    marginTop: 24, lineHeight: 20,
  },
  retryButton: {
    marginTop: 24, paddingHorizontal: 32, paddingVertical: 13,
    backgroundColor: c.voice.gold, borderRadius: radius.lg,
  },
  retryLabel: { color: c.depth.void, fontSize: 15, fontWeight: "600", letterSpacing: 0.5 },

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
