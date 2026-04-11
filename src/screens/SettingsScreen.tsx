/**
 * SPEAQ - Settings Screen
 * Profile, privacy, data deletion, about
 */

import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Modal, Image } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../theme/brand";
import { getIdentity, getKyberPublicKey } from "../services/speaq";
import { pickProfilePhoto } from "../services/profile";
import { getLanguage, setLanguage, LANGUAGES, Language, t } from "../services/i18n";
import { exportIdentity, loadCredentials, verifyCredential, VerifiableCredential } from "../services/identity-manager";

const PRIVACY_POLICY_EN = `SPEAQ Privacy Policy
Last updated: April 2026

1. What SPEAQ Collects
SPEAQ collects NO personal data on its servers. All data stays on your device.
- Your SPEAQ ID is generated locally and never linked to your real identity
- Messages are end-to-end encrypted; the relay server sees only encrypted blobs
- No email, phone number, or real name is required
- No cookies are used (SPEAQ is a native app)
- No analytics or tracking is implemented

2. Data Storage
All data is stored locally on your device:
- Identity (SPEAQ ID, display name)
- PIN (encrypted)
- Messages (encrypted)
- Contacts
- Wallet (Q-Credits balance, transaction history)
- No data is stored on SPEAQ servers except temporarily queued encrypted messages (max 7 days, then auto-deleted)

3. Relay Server (Zero Knowledge)
The SPEAQ relay server operates on a zero-knowledge principle:
- It sees ONLY encrypted blobs
- It cannot read messages, identify senders/receivers, or determine message content
- It does not log IP addresses of users
- It does not store wallet balances or transaction details
- Offline messages are auto-deleted after 7 days

4. Your Rights (GDPR)
Under the EU General Data Protection Regulation, you have the right to:
- Access: View all your data (it is all on your device)
- Deletion: Delete all data via Settings > Delete All Data
- Portability: Your data is stored locally and can be exported
- Rectification: Edit your profile in the app
- Restriction: You control what you share

5. Data Deletion
To delete all your data:
1. Open SPEAQ > Settings > Delete All Data
2. This permanently removes your identity, messages, contacts, wallet, and PIN
3. This action cannot be undone
4. No server-side data needs deletion (zero-knowledge architecture)

6. Children
SPEAQ is not intended for use by children under 16.

7. Changes
We may update this policy. Changes will be reflected in the app.

8. Contact
For privacy inquiries: privacy@thespeaq.com
Plexaris Technology Consulting
The Netherlands`;

const PRIVACY_POLICY_NL = `SPEAQ Privacybeleid
Laatst bijgewerkt: april 2026

1. Wat SPEAQ Verzamelt
SPEAQ verzamelt GEEN persoonlijke gegevens op haar servers. Alle data blijft op je apparaat.
- Je SPEAQ ID wordt lokaal gegenereerd en nooit gekoppeld aan je echte identiteit
- Berichten zijn end-to-end versleuteld; de relay-server ziet alleen versleutelde blobs
- Geen e-mail, telefoonnummer of echte naam vereist
- Geen cookies (SPEAQ is een native app)
- Geen analytics of tracking

2. Data Opslag
Alle data wordt lokaal opgeslagen op je apparaat:
- Identiteit (SPEAQ ID, weergavenaam)
- PIN (versleuteld)
- Berichten (versleuteld)
- Contacten
- Portemonnee (Q-Credits saldo, transactiegeschiedenis)
- Geen data wordt opgeslagen op SPEAQ servers behalve tijdelijk in wachtrij geplaatste versleutelde berichten (max 7 dagen, daarna automatisch verwijderd)

3. Relay Server (Zero Knowledge)
De SPEAQ relay-server werkt op een zero-knowledge principe:
- Ziet ALLEEN versleutelde blobs
- Kan geen berichten lezen, afzenders/ontvangers identificeren of berichtinhoud bepalen
- Logt geen IP-adressen van gebruikers
- Slaat geen portemonnee-saldi of transactiedetails op
- Offline berichten worden na 7 dagen automatisch verwijderd

4. Je Rechten (AVG/GDPR)
Onder de EU Algemene Verordening Gegevensbescherming heb je het recht op:
- Inzage: Bekijk al je data (het staat allemaal op je apparaat)
- Verwijdering: Verwijder alle data via Instellingen > Alle Gegevens Wissen
- Overdraagbaarheid: Je data is lokaal opgeslagen en kan worden geexporteerd
- Rectificatie: Bewerk je profiel in de app
- Beperking: Jij bepaalt wat je deelt

5. Data Verwijdering
Om al je data te verwijderen:
1. Open SPEAQ > Instellingen > Alle Gegevens Wissen
2. Dit verwijdert permanent je identiteit, berichten, contacten, portemonnee en PIN
3. Deze actie kan niet ongedaan worden gemaakt
4. Geen server-side data hoeft verwijderd te worden (zero-knowledge architectuur)

6. Kinderen
SPEAQ is niet bedoeld voor gebruik door kinderen onder de 16 jaar.

7. Wijzigingen
We kunnen dit beleid bijwerken. Wijzigingen worden weergegeven in de app.

8. Contact
Voor privacy vragen: privacy@thespeaq.com
Plexaris Technology Consulting
Nederland`;

function getPrivacyPolicyText(): string {
  const lang = getLanguage();
  if (lang === "nl") return PRIVACY_POLICY_NL;
  return PRIVACY_POLICY_EN;
}

interface Props {
  onLogout: () => void;
  onOpenAdvanced: () => void;
  onOpenVault: () => void;
  onOpenMining: () => void;
  onOpenInfo: () => void;
  onOpenBrowser: () => void;
  onLanguageChange: () => void;
}

export default function SettingsScreen({ onLogout, onOpenAdvanced, onOpenVault, onOpenMining, onOpenInfo, onOpenBrowser, onLanguageChange }: Props) {
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportData, setExportData] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const identity = getIdentity();

  useEffect(() => {
    AsyncStorage.getItem("speaq_profile_photo").then((uri) => {
      if (uri) setPhotoUri(uri);
    });
  }, []);

  async function handleChangePhoto() {
    const uri = await pickProfilePhoto();
    if (uri) setPhotoUri(uri);
  }

  async function handleExportIdentity() {
    try {
      const data = await exportIdentity();
      setExportData(data);
      setShowExport(true);
    } catch (e: any) {
      Alert.alert("Export Failed", e.message || "Could not export identity.");
    }
  }

  async function handleVerifyIdentity() {
    try {
      const credentials = await loadCredentials();
      const pubKey = getKyberPublicKey();
      if (credentials.length === 0) {
        Alert.alert("No Credentials", "You have no verifiable credentials to verify.");
        return;
      }
      if (!pubKey) {
        Alert.alert("Error", "No public key available.");
        return;
      }
      let valid = 0;
      let invalid = 0;
      for (const cred of credentials) {
        if (verifyCredential(cred, pubKey)) valid++;
        else invalid++;
      }
      Alert.alert("Verification Complete", `${valid} valid, ${invalid} invalid out of ${credentials.length} credentials.`);
    } catch (e: any) {
      Alert.alert("Verification Failed", e.message || "Could not verify credentials.");
    }
  }

  function handleDeleteData() {
    Alert.alert(
      t("deleteAllDataTitle"),
      t("deleteAllDataMsg"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("deleteEverything"),
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.clear();
            Alert.alert(t("done"), t("allDataDeleted"), [{ text: t("ok"), onPress: onLogout }]);
          },
        },
      ]
    );
  }

  function handleResetPIN() {
    Alert.alert(
      t("resetPinTitle"),
      t("resetPinMsg"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("reset"),
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.removeItem("speaq_pin");
            onLogout();
          },
        },
      ]
    );
  }

  return (
    <View style={st.container}>
      <View style={st.header}>
        <Text style={st.title}>{t("settings")}</Text>
      </View>

      <ScrollView style={st.list}>
        {/* Profile Photo */}
        <TouchableOpacity style={st.photoSection} onPress={handleChangePhoto}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={st.profilePhoto} />
          ) : (
            <View style={st.profilePhotoPlaceholder}>
              <Text style={st.profilePhotoInit}>{identity?.displayName?.charAt(0) || "?"}</Text>
            </View>
          )}
          <Text style={st.photoHint}>{t("tapChangePhoto")}</Text>
        </TouchableOpacity>

        {/* Profile */}
        <Text style={st.sectionLabel}>{t("profile")}</Text>
        <View style={st.card}>
          <View style={st.row}>
            <Text style={st.rowLabel}>{t("name")}</Text>
            <Text style={st.rowValue}>{identity?.displayName || "Unknown"}</Text>
          </View>
          <View style={st.row}>
            <Text style={st.rowLabel}>SPEAQ ID</Text>
            <Text style={st.rowValueMono}>{identity?.speaqId || "None"}</Text>
          </View>
          {identity?.did && (
            <View style={st.row}>
              <Text style={st.rowLabel}>DID</Text>
              <Text style={[st.rowValueMono, { fontSize: 9, maxWidth: 180 }]} numberOfLines={1} ellipsizeMode="middle">{identity.did}</Text>
            </View>
          )}
          <TouchableOpacity style={st.row} onPress={handleExportIdentity}>
            <Text style={st.rowLabel}>Export Identity</Text>
            <Text style={st.rowAction}>QR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.row} onPress={handleVerifyIdentity}>
            <Text style={st.rowLabel}>Verify Identity</Text>
            <Text style={st.rowAction}>Check</Text>
          </TouchableOpacity>
        </View>

        {/* Security */}
        <Text style={st.sectionLabel}>{t("security")}</Text>
        <View style={st.card}>
          <View style={st.row}>
            <Text style={st.rowLabel}>{t("encryption")}</Text>
            <Text style={st.rowValueTeal}>Kyber-768 + AES-256-GCM</Text>
          </View>
          <View style={st.row}>
            <Text style={st.rowLabel}>{t("forwardSecrecy")}</Text>
            <Text style={st.rowValueTeal}>Double Ratchet</Text>
          </View>
          <TouchableOpacity style={st.row} onPress={handleResetPIN}>
            <Text style={st.rowLabel}>{t("resetPin")}</Text>
            <Text style={st.rowAction}>{t("reset")}</Text>
          </TouchableOpacity>
        </View>

        {/* Language */}
        <Text style={st.sectionLabel}>{t("language")}</Text>
        <View style={st.card}>
          <TouchableOpacity style={st.row} onPress={() => setShowLangPicker(!showLangPicker)}>
            <Text style={st.rowLabel}>{t("language")}</Text>
            <Text style={st.rowAction}>{LANGUAGES.find((l) => l.key === getLanguage())?.native || "English"}</Text>
          </TouchableOpacity>
          {showLangPicker && LANGUAGES.map((l) => (
            <TouchableOpacity key={l.key} style={[st.langRow, getLanguage() === l.key && st.langRowActive]}
              onPress={() => { setLanguage(l.key); onLanguageChange(); setShowLangPicker(false); }}>
              <Text style={[st.langNative, getLanguage() === l.key && st.langNativeActive]}>{l.native}</Text>
              <Text style={st.langLabel}>{l.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Advanced Features */}
        <Text style={st.sectionLabel}>{t("advanced")}</Text>
        <View style={st.card}>
          <TouchableOpacity style={st.row} onPress={onOpenMining}>
            <Text style={st.rowLabel}>Mining</Text>
            <Text style={st.rowAction}>{t("open")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.row} onPress={onOpenVault}>
            <Text style={st.rowLabel}>{t("quantumVault")}</Text>
            <Text style={st.rowAction}>{t("open")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.row} onPress={onOpenAdvanced}>
            <Text style={st.rowLabel}>{t("ghostWitness")}</Text>
            <Text style={st.rowAction}>{t("open")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.row} onPress={onOpenBrowser}>
            <Text style={st.rowLabel}>Freedom Browse</Text>
            <Text style={st.rowAction}>{t("open")}</Text>
          </TouchableOpacity>
        </View>

        {/* Privacy & Data */}
        <Text style={st.sectionLabel}>{t("privacyData")}</Text>
        <View style={st.card}>
          <TouchableOpacity style={st.row} onPress={() => setShowPrivacy(true)}>
            <Text style={st.rowLabel}>{t("privacyPolicy")}</Text>
            <Text style={st.rowAction}>{t("view")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.row} onPress={handleDeleteData}>
            <Text style={st.rowLabelRed}>{t("deleteAllData")}</Text>
            <Text style={st.rowActionRed}>{t("delete")}</Text>
          </TouchableOpacity>
        </View>

        {/* About */}
        <Text style={st.sectionLabel}>{t("about")}</Text>
        <View style={st.card}>
          <TouchableOpacity style={st.row} onPress={onOpenInfo}>
            <Text style={st.rowLabel}>{t("howSpeaqWorks")}</Text>
            <Text style={st.rowAction}>i</Text>
          </TouchableOpacity>
          <View style={st.row}>
            <Text style={st.rowLabel}>{t("version")}</Text>
            <Text style={st.rowValue}>1.1.0 (Build 109)</Text>
          </View>
          <View style={st.row}>
            <Text style={st.rowLabel}>{t("platform")}</Text>
            <Text style={st.rowValue}>SPEAQ Freely.</Text>
          </View>
          <View style={st.row}>
            <Text style={st.rowLabel}>Website</Text>
            <Text style={st.rowValueMono}>thespeaq.com</Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Privacy Policy Modal */}
      <Modal visible={showPrivacy} animationType="slide">
        <View style={st.privacyContainer}>
          <View style={st.privacyHeader}>
            <Text style={st.privacyTitle}>{t("privacyPolicy")}</Text>
            <TouchableOpacity onPress={() => setShowPrivacy(false)}>
              <Text style={st.privacyClose}>{t("close")}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={st.privacyScroll}>
            <Text style={st.privacyText}>{getPrivacyPolicyText()}</Text>
          </ScrollView>
        </View>
      </Modal>

      {/* Export Identity Modal */}
      <Modal visible={showExport} animationType="slide">
        <View style={st.privacyContainer}>
          <View style={st.privacyHeader}>
            <Text style={st.privacyTitle}>Export Identity</Text>
            <TouchableOpacity onPress={() => setShowExport(false)}>
              <Text style={st.privacyClose}>{t("close")}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={st.privacyScroll}>
            <Text style={[st.privacyText, { marginBottom: 12 }]}>
              Scan this data on your new device to transfer your identity.
              Note: private keys must be transferred separately for security.
            </Text>
            <View style={st.exportBox}>
              <Text style={st.exportData} selectable>{exportData}</Text>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.depth.void },
  header: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  title: { color: colors.signal.white, fontSize: 28, fontWeight: "700", fontFamily: "Georgia" },
  list: { flex: 1, paddingHorizontal: 16 },
  photoSection: { alignItems: "center", paddingVertical: 20 },
  profilePhoto: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: colors.voice.gold },
  profilePhotoPlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.depth.elevated, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.voice.gold },
  profilePhotoInit: { color: colors.voice.gold, fontSize: 32, fontWeight: "600" },
  photoHint: { color: colors.signal.steel, fontSize: 11, marginTop: 8 },
  sectionLabel: { color: colors.signal.steel, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginTop: 20, marginBottom: 8, paddingHorizontal: 8 },
  card: { backgroundColor: colors.depth.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border.subtle, overflow: "hidden" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  rowLabel: { color: colors.signal.white, fontSize: 14 },
  rowLabelRed: { color: colors.signal.red, fontSize: 14 },
  rowValue: { color: colors.signal.steel, fontSize: 14 },
  rowValueMono: { color: colors.voice.gold, fontSize: 12, fontFamily: "Courier" },
  rowValueTeal: { color: colors.quantum.teal, fontSize: 12 },
  rowAction: { color: colors.voice.gold, fontSize: 14, fontWeight: "500" },
  langRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border.subtle },
  langRowActive: { backgroundColor: "rgba(212,168,83,0.08)" },
  langNative: { color: colors.signal.white, fontSize: 14 },
  langNativeActive: { color: colors.voice.gold, fontWeight: "600" },
  langLabel: { color: colors.signal.steel, fontSize: 12 },
  rowActionRed: { color: colors.signal.red, fontSize: 14, fontWeight: "500" },

  privacyContainer: { flex: 1, backgroundColor: colors.depth.void },
  privacyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  privacyTitle: { color: colors.signal.white, fontSize: 20, fontWeight: "600" },
  privacyClose: { color: colors.voice.gold, fontSize: 16, fontWeight: "500" },
  privacyScroll: { flex: 1, padding: 24 },
  privacyText: { color: colors.signal.light, fontSize: 14, lineHeight: 22 },
  exportBox: { backgroundColor: colors.depth.card, borderRadius: 8, padding: 16, borderWidth: 1, borderColor: colors.border.subtle },
  exportData: { color: colors.quantum.teal, fontSize: 10, fontFamily: "Courier", lineHeight: 16 },
});
