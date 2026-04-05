/**
 * SPEAQ - Settings Screen
 * Profile, privacy, data deletion, about
 */

import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Modal, Image } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../theme/brand";
import { getIdentity } from "../services/speaq";
import { pickProfilePhoto } from "../services/profile";
import { getLanguage, setLanguage, LANGUAGES, Language } from "../services/i18n";

interface Props {
  onLogout: () => void;
  onOpenAdvanced: () => void;
  onOpenVault: () => void;
}

export default function SettingsScreen({ onLogout, onOpenAdvanced, onOpenVault }: Props) {
  const [showPrivacy, setShowPrivacy] = useState(false);
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

  function handleDeleteData() {
    Alert.alert(
      "Delete All Data",
      "This will permanently delete your identity, messages, wallet, and all local data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: async () => {
            await AsyncStorage.clear();
            Alert.alert("Done", "All data deleted.", [{ text: "OK", onPress: onLogout }]);
          },
        },
      ]
    );
  }

  function handleResetPIN() {
    Alert.alert(
      "Reset PIN",
      "This will log you out. You will need to create a new identity.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
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
        <Text style={st.title}>Settings</Text>
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
          <Text style={st.photoHint}>Tap to change photo</Text>
        </TouchableOpacity>

        {/* Profile */}
        <Text style={st.sectionLabel}>Profile</Text>
        <View style={st.card}>
          <View style={st.row}>
            <Text style={st.rowLabel}>Name</Text>
            <Text style={st.rowValue}>{identity?.displayName || "Unknown"}</Text>
          </View>
          <View style={st.row}>
            <Text style={st.rowLabel}>SPEAQ ID</Text>
            <Text style={st.rowValueMono}>{identity?.speaqId || "None"}</Text>
          </View>
        </View>

        {/* Security */}
        <Text style={st.sectionLabel}>Security</Text>
        <View style={st.card}>
          <View style={st.row}>
            <Text style={st.rowLabel}>Encryption</Text>
            <Text style={st.rowValueTeal}>Kyber-768 + AES-256-GCM</Text>
          </View>
          <View style={st.row}>
            <Text style={st.rowLabel}>Forward Secrecy</Text>
            <Text style={st.rowValueTeal}>Double Ratchet</Text>
          </View>
          <TouchableOpacity style={st.row} onPress={handleResetPIN}>
            <Text style={st.rowLabel}>Reset PIN</Text>
            <Text style={st.rowAction}>Reset</Text>
          </TouchableOpacity>
        </View>

        {/* Language */}
        <Text style={st.sectionLabel}>Language</Text>
        <View style={st.card}>
          <TouchableOpacity style={st.row} onPress={() => {
            const buttons = LANGUAGES.map((l) => ({
              text: `${l.native}${getLanguage() === l.key ? " (current)" : ""}`,
              onPress: () => setLanguage(l.key),
            }));
            buttons.push({ text: "Cancel", onPress: () => {} });
            Alert.alert("Language", "Select your language", buttons);
          }}>
            <Text style={st.rowLabel}>Language</Text>
            <Text style={st.rowAction}>{LANGUAGES.find((l) => l.key === getLanguage())?.native || "English"}</Text>
          </TouchableOpacity>
        </View>

        {/* Advanced Features */}
        <Text style={st.sectionLabel}>Advanced</Text>
        <View style={st.card}>
          <TouchableOpacity style={st.row} onPress={onOpenVault}>
            <Text style={st.rowLabel}>Quantum Vault</Text>
            <Text style={st.rowAction}>Open</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.row} onPress={onOpenAdvanced}>
            <Text style={st.rowLabel}>Ghost Groups, Witness, Switch</Text>
            <Text style={st.rowAction}>Open</Text>
          </TouchableOpacity>
        </View>

        {/* Privacy & Data */}
        <Text style={st.sectionLabel}>Privacy & Data</Text>
        <View style={st.card}>
          <TouchableOpacity style={st.row} onPress={() => setShowPrivacy(true)}>
            <Text style={st.rowLabel}>Privacy Policy</Text>
            <Text style={st.rowAction}>View</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.row} onPress={handleDeleteData}>
            <Text style={st.rowLabelRed}>Delete All Data</Text>
            <Text style={st.rowActionRed}>Delete</Text>
          </TouchableOpacity>
        </View>

        {/* About */}
        <Text style={st.sectionLabel}>About</Text>
        <View style={st.card}>
          <View style={st.row}>
            <Text style={st.rowLabel}>Version</Text>
            <Text style={st.rowValue}>0.1.0 (Phase 5)</Text>
          </View>
          <View style={st.row}>
            <Text style={st.rowLabel}>Platform</Text>
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
            <Text style={st.privacyTitle}>Privacy Policy</Text>
            <TouchableOpacity onPress={() => setShowPrivacy(false)}>
              <Text style={st.privacyClose}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={st.privacyScroll}>
            <Text style={st.privacyText}>
              {`SPEAQ Privacy Policy
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
The Netherlands`}
            </Text>
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
  rowActionRed: { color: colors.signal.red, fontSize: 14, fontWeight: "500" },

  privacyContainer: { flex: 1, backgroundColor: colors.depth.void },
  privacyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  privacyTitle: { color: colors.signal.white, fontSize: 20, fontWeight: "600" },
  privacyClose: { color: colors.voice.gold, fontSize: 16, fontWeight: "500" },
  privacyScroll: { flex: 1, padding: 24 },
  privacyText: { color: colors.signal.light, fontSize: 14, lineHeight: 22 },
});
