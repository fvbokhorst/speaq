/**
 * SPEAQ - Contacts Screen
 * Show your QR code + scan others to pair
 */

import React, { useState, useEffect, Suspense } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, Share, Image } from "react-native";
import QRCode from "react-native-qrcode-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Camera } from "react-native-camera-kit";
import { colors, spacing, radius } from "../theme/brand";
import { getIdentity } from "../services/speaq";
import { contactsService, Contact } from "../services/contacts";
import { t } from "../services/i18n";

interface Props {
  onOpenChat: (contactId: string, contactName: string) => void;
  onOpenGroups: () => void;
}

export default function ContactsScreen({ onOpenChat, onOpenGroups }: Props) {
  const [contacts, setContacts] = useState<Contact[]>(contactsService.getContacts());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [newContactId, setNewContactId] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [contactPhotos, setContactPhotos] = useState<Record<string, string>>({});
  const identity = getIdentity();
  const qrData = `speaq://${identity?.speaqId || "unknown"}`;

  useEffect(() => {
    AsyncStorage.getItem("speaq_profile_photo").then((uri) => { if (uri) setProfilePhoto(uri); });
    AsyncStorage.getItem("speaq_contact_photos").then((json) => { if (json) try { setContactPhotos(JSON.parse(json)); } catch {} });
  }, []);

  function addContact() {
    if (!newContactId.trim() || !newContactName.trim()) return;
    contactsService.addContact(newContactId.trim(), newContactName.trim());
    setContacts(contactsService.getContacts());
    setNewContactId("");
    setNewContactName("");
    setShowAddModal(false);
    Alert.alert("Contact Added", `${newContactName.trim()} has been added. Quantum key exchange will happen on first message.`);
  }

  function shareId() {
    Share.share({ message: `Connect with me on SPEAQ!\n\nMy SPEAQ ID: ${identity?.speaqId}\n\nDownload: thespeaq.com` });
  }

  return (
    <View style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <Text style={st.title}>{t("contacts")}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity onPress={onOpenGroups} style={[st.addBtn, { backgroundColor: colors.depth.card, borderWidth: 1, borderColor: colors.voice.gold }]}>
            <Text style={[st.addBtnText, { color: colors.voice.gold }]}>Groups</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowScanner(true)} style={[st.addBtn, { backgroundColor: colors.depth.card, borderWidth: 1, borderColor: colors.quantum.teal }]}>
            <Text style={[st.addBtnText, { color: colors.quantum.teal }]}>Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowAddModal(true)} style={st.addBtn}>
            <Text style={st.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Your QR Code */}
      <TouchableOpacity style={st.qrCard} onPress={() => setShowQRModal(true)} activeOpacity={0.8}>
        <View style={st.qrRow}>
          {profilePhoto ? (
            <Image source={{ uri: profilePhoto }} style={st.profilePhoto} />
          ) : (
            <View style={st.profilePhotoPlaceholder}>
              <Text style={st.profilePhotoInit}>{identity?.displayName?.charAt(0) || "?"}</Text>
            </View>
          )}
          <View style={st.qrInfo}>
            <Text style={st.qrName}>{identity?.displayName || "You"}</Text>
            <Text style={st.qrId}>{identity?.speaqId || "No ID"}</Text>
            <Text style={st.qrHint}>Tap to enlarge or share</Text>
          </View>
          <View style={st.qrSmall}>
            <QRCode value={qrData} size={50} backgroundColor="transparent" color={colors.voice.gold} />
          </View>
        </View>
      </TouchableOpacity>

      {/* Contact List */}
      {contacts.length === 0 ? (
        <View style={st.empty}>
          <Text style={st.emptyTitle}>{t("noContacts")}</Text>
          <Text style={st.emptySub}>Tap "+ Add" to add a contact by SPEAQ ID{"\n"}or scan their QR code</Text>
        </View>
      ) : (
        contacts.map((c) => (
          <TouchableOpacity key={c.id} style={st.contactItem} onPress={() => onOpenChat(c.id, c.name)} activeOpacity={0.7}>
            {contactPhotos[c.id] ? (
              <Image source={{ uri: contactPhotos[c.id] }} style={st.contactPhotoImg} />
            ) : (
              <View style={st.contactAvatar}>
                <Text style={st.contactAvatarText}>{c.name.charAt(0)}</Text>
              </View>
            )}
            <View style={st.contactInfo}>
              <Text style={st.contactName}>{c.name}</Text>
              <Text style={st.contactId}>{c.id}</Text>
            </View>
            <Text style={st.contactStatus}>Quantum Secured</Text>
          </TouchableOpacity>
        ))
      )}

      {/* QR Modal (enlarged) */}
      <Modal visible={showQRModal} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.qrModalBox}>
            <Text style={st.qrModalTitle}>Your SPEAQ QR Code</Text>
            <View style={st.qrBig}>
              <QRCode value={qrData} size={200} backgroundColor={colors.depth.card} color={colors.voice.gold} />
            </View>
            <Text style={st.qrModalId}>{identity?.speaqId}</Text>
            <Text style={st.qrModalSub}>Others scan this to start a quantum-encrypted chat with you</Text>
            <View style={st.qrModalBtns}>
              <TouchableOpacity style={st.qrShareBtn} onPress={shareId}>
                <Text style={st.qrShareText}>Share ID</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.qrCloseBtn} onPress={() => setShowQRModal(false)}>
                <Text style={st.qrCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* QR Scanner Modal */}
      <Modal visible={showScanner} animationType="slide">
        <View style={{ flex: 1, backgroundColor: colors.depth.void }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16 }}>
            <Text style={{ color: colors.signal.white, fontSize: 18, fontWeight: "600" }}>Scan SPEAQ QR Code</Text>
            <TouchableOpacity onPress={() => setShowScanner(false)}>
              <Text style={{ color: colors.voice.gold, fontSize: 16 }}>Close</Text>
            </TouchableOpacity>
          </View>
          <Suspense fallback={<View style={{ flex: 1 }}><Text style={{ color: colors.signal.white, textAlign: "center", marginTop: 100 }}>Loading camera...</Text></View>}>
            <Camera
              scanBarcode
              onReadCode={(event: any) => {
                const value = event.nativeEvent?.codeStringValue || "";
                const speaqId = value.startsWith("speaq://") ? value.replace("speaq://", "") : value;
                if (speaqId) {
                  setShowScanner(false);
                  setNewContactId(speaqId);
                  setShowAddModal(true);
                }
              }}
              showFrame
              frameColor={colors.voice.gold}
              laserColor={colors.quantum.teal}
            />
          </Suspense>
        </View>
      </Modal>

      {/* Add Contact Modal */}
      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.addModalBox}>
            <Text style={st.addModalTitle}>Add Contact</Text>
            <TextInput
              style={st.addInput}
              value={newContactName}
              onChangeText={setNewContactName}
              placeholder="Contact name"
              placeholderTextColor={colors.signal.steel}
              autoFocus
            />
            <TextInput
              style={st.addInput}
              value={newContactId}
              onChangeText={setNewContactId}
              placeholder="SPEAQ ID"
              placeholderTextColor={colors.signal.steel}
              autoCapitalize="none"
            />
            <View style={st.addModalBtns}>
              <TouchableOpacity style={st.addCancelBtn} onPress={() => { setShowAddModal(false); setNewContactId(""); setNewContactName(""); }}>
                <Text style={st.addCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.addConfirmBtn, (!newContactId.trim() || !newContactName.trim()) && st.addDisabled]}
                onPress={addContact} disabled={!newContactId.trim() || !newContactName.trim()}>
                <Text style={st.addConfirmText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.depth.void },
  header: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border.subtle, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  title: { color: colors.signal.white, fontSize: 28, fontWeight: "700", fontFamily: "Georgia" },
  addBtn: { backgroundColor: colors.voice.gold, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: colors.depth.void, fontSize: 13, fontWeight: "600" },

  qrCard: { margin: 16, padding: 16, backgroundColor: colors.depth.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border.subtle },
  qrRow: { flexDirection: "row", alignItems: "center" },
  qrSmall: { marginLeft: 12 },
  profilePhoto: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: colors.voice.gold, marginRight: 12 },
  profilePhotoPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.depth.elevated, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.voice.gold, marginRight: 12 },
  profilePhotoInit: { color: colors.voice.gold, fontSize: 20, fontWeight: "600" },
  contactPhotoImg: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.voice.gold, marginRight: 12 },
  qrInfo: { flex: 1 },
  qrName: { color: colors.signal.white, fontSize: 16, fontWeight: "600" },
  qrId: { color: colors.voice.gold, fontSize: 12, fontFamily: "Courier", marginTop: 2 },
  qrHint: { color: colors.signal.steel, fontSize: 10, marginTop: 4 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 100 },
  emptyTitle: { color: colors.signal.white, fontSize: 18, fontWeight: "500", marginBottom: 8 },
  emptySub: { color: colors.signal.steel, fontSize: 12, textAlign: "center", lineHeight: 18 },

  contactItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  contactAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.depth.elevated, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.quantum.teal, marginRight: 12 },
  contactAvatarText: { color: colors.quantum.teal, fontSize: 16, fontWeight: "600" },
  contactInfo: { flex: 1 },
  contactName: { color: colors.signal.white, fontSize: 15, fontWeight: "500" },
  contactId: { color: colors.signal.steel, fontSize: 10, fontFamily: "Courier", marginTop: 1 },
  contactStatus: { color: colors.quantum.teal, fontSize: 9, letterSpacing: 0.5 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center" },
  qrModalBox: { width: 300, backgroundColor: colors.depth.card, borderRadius: 20, padding: 28, alignItems: "center", borderWidth: 1, borderColor: colors.border.subtle },
  qrModalTitle: { color: colors.signal.white, fontSize: 18, fontWeight: "600", marginBottom: 20 },
  qrBig: { padding: 16, backgroundColor: colors.depth.elevated, borderRadius: 16 },
  qrModalId: { color: colors.voice.gold, fontSize: 14, fontFamily: "Courier", marginTop: 16 },
  qrModalSub: { color: colors.signal.steel, fontSize: 11, textAlign: "center", marginTop: 8, lineHeight: 16 },
  qrModalBtns: { flexDirection: "row", gap: 12, marginTop: 20, width: "100%" },
  qrShareBtn: { flex: 1, backgroundColor: colors.voice.gold, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  qrShareText: { color: colors.depth.void, fontSize: 14, fontWeight: "600" },
  qrCloseBtn: { flex: 1, borderWidth: 1, borderColor: colors.border.subtle, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  qrCloseText: { color: colors.signal.steel, fontSize: 14 },

  addModalBox: { width: 300, backgroundColor: colors.depth.card, borderRadius: 20, padding: 28, borderWidth: 1, borderColor: colors.border.subtle },
  addModalTitle: { color: colors.signal.white, fontSize: 18, fontWeight: "600", marginBottom: 16 },
  addInput: { backgroundColor: colors.depth.elevated, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: colors.signal.white, fontSize: 15, marginBottom: 12 },
  addModalBtns: { flexDirection: "row", gap: 12, marginTop: 4 },
  addCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border.subtle, alignItems: "center" },
  addCancelText: { color: colors.signal.steel, fontSize: 14 },
  addConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.voice.gold, alignItems: "center" },
  addConfirmText: { color: colors.depth.void, fontSize: 14, fontWeight: "600" },
  addDisabled: { opacity: 0.3 },
});
