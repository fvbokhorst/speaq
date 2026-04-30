/**
 * SPEAQ - EULA Acceptance Screen
 *
 * Apple App Store Guideline 1.2 (User-Generated Content) compliance gate.
 * Shown once after onboarding, before the user creates an identity. Required
 * by Apple Review. Records acceptance timestamp in AsyncStorage as
 * `speaq_eula_v1_accepted_at`.
 *
 * Mirrors the PWA EULA gate at /app screen=eula.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  Platform,
} from "react-native";
import { useThemedStyles, useTheme, ThemeColors } from "../theme/ThemeContext";
import { t } from "../services/i18n";

interface Props {
  onAccept: () => void;
}

export default function EulaScreen({ onAccept }: Props) {
  const st = useThemedStyles(makeStyles);
  const [agreed, setAgreed] = useState(false);

  function openTerms() {
    Linking.openURL("https://thespeaq.com/terms#objectionable-content").catch(() => {});
  }

  return (
    <View style={st.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={st.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={st.logoRow}>
          <Text style={st.logoSpea}>SPEA</Text>
          <View style={st.logoQ}>
            <Text style={st.logoQText}>Q</Text>
            <View style={st.logoQDot} />
          </View>
        </View>

        <Text style={st.title}>{t("eulaTitle")}</Text>
        <Text style={st.intro}>{t("eulaIntro")}</Text>

        <View style={st.policyCard}>
          <Text style={st.policyHeading}>{t("eulaZeroToleranceTitle")}</Text>
          <View style={st.bulletRow}>
            <Text style={st.bulletDot}>{"·"}</Text>
            <Text style={st.bulletText}>{t("eulaBullet1")}</Text>
          </View>
          <View style={st.bulletRow}>
            <Text style={st.bulletDot}>{"·"}</Text>
            <Text style={st.bulletText}>{t("eulaBullet2")}</Text>
          </View>
          <View style={st.bulletRow}>
            <Text style={st.bulletDot}>{"·"}</Text>
            <Text style={st.bulletText}>{t("eulaBullet3")}</Text>
          </View>
          <View style={st.bulletRow}>
            <Text style={st.bulletDot}>{"·"}</Text>
            <Text style={st.bulletText}>{t("eulaBullet4")}</Text>
          </View>
          <View style={st.bulletRow}>
            <Text style={st.bulletDot}>{"·"}</Text>
            <Text style={st.bulletText}>{t("eulaBullet5")}</Text>
          </View>
        </View>

        <Text style={st.linkLine}>
          {t("eulaLinkLead")}{" "}
          <Text style={st.linkText} onPress={openTerms}>
            {t("eulaLinkText")}
          </Text>
          .
        </Text>

        <TouchableOpacity
          style={st.checkboxRow}
          onPress={() => setAgreed(!agreed)}
          activeOpacity={0.7}
        >
          <View style={[st.checkbox, agreed && st.checkboxChecked]}>
            {agreed && <Text style={st.checkboxMark}>{"✓"}</Text>}
          </View>
          <Text style={st.checkboxText}>{t("eulaCheckbox")}</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={st.footer}>
        <TouchableOpacity
          style={[st.continueBtn, !agreed && st.continueBtnDisabled]}
          onPress={onAccept}
          disabled={!agreed}
          activeOpacity={agreed ? 0.85 : 1}
        >
          <Text style={[st.continueText, !agreed && st.continueTextDisabled]}>
            {t("eulaContinue")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.depth.void,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 16,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  logoSpea: {
    color: c.signal.white,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  logoQ: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: c.voice.gold,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 1,
    position: "relative",
  },
  logoQText: {
    color: c.voice.gold,
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Georgia",
  },
  logoQDot: {
    position: "absolute",
    bottom: 2,
    right: 5,
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: c.quantum.teal,
  },
  title: {
    color: c.signal.white,
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 12,
    lineHeight: 30,
  },
  intro: {
    color: c.signal.steel,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  policyCard: {
    backgroundColor: c.depth.elevated,
    borderRadius: 14,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: c.depth.surface,
  },
  policyHeading: {
    color: c.voice.gold,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 12,
    lineHeight: 18,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 10,
    alignItems: "flex-start",
  },
  bulletDot: {
    color: c.voice.gold,
    fontSize: 14,
    marginRight: 8,
    width: 8,
    fontWeight: "700",
  },
  bulletText: {
    flex: 1,
    color: c.signal.steel,
    fontSize: 12,
    lineHeight: 18,
  },
  linkLine: {
    color: c.signal.steel,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  linkText: {
    color: c.voice.gold,
    textDecorationLine: "underline",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: c.signal.steel,
    marginTop: 1,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: c.voice.gold,
    borderColor: c.voice.gold,
  },
  checkboxMark: {
    color: c.depth.void,
    fontSize: 14,
    fontWeight: "700",
  },
  checkboxText: {
    flex: 1,
    color: c.signal.white,
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 32 : 20,
    borderTopWidth: 1,
    borderTopColor: c.depth.elevated,
    backgroundColor: c.depth.void,
  },
  continueBtn: {
    backgroundColor: c.voice.gold,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  continueBtnDisabled: {
    backgroundColor: c.depth.elevated,
  },
  continueText: {
    color: c.depth.void,
    fontSize: 16,
    fontWeight: "600",
  },
  continueTextDisabled: {
    color: c.signal.steel,
  },
});
