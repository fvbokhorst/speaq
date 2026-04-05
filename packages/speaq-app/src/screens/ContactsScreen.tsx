/**
 * SPEAQ - Contacts Screen
 * Show your QR code + scan others to pair
 */

import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, Share } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { colors, spacing, radius } from "../theme/brand";
import { getIdentity } from "../services/speaq";

interface Contact {
  id: string;
  name: string;
}

interface Props {
  onOpenChat: (contactId: string, contactName: string) => void;
}

export default function ContactsScreen({ onOpenChat }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [newContactId, setNewContactId] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const identity = getIdentity();
  const qrData = `speaq://${identity?.speaqId || "unknown"}`;

  function addContact() {
    if (!newContactId.trim() || !newContactName.trim()) return;
    setContacts((prev) => [...prev, { id: newContactId.trim(), name: newContactName.trim() }]);
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
        <Text style={st.title}>Contacts</Text>
        <TouchableOpacity onPress={() => setShowAddModal(true)} style={st.addBtn}>
          <Text style={st.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Your QR Code */}
      <TouchableOpacity style={st.qrCard} onPress={() => setShowQRModal(true)} activeOpacity={0.8}>
        <View style={st.qrRow}>
          <View style={st.qrSmall}>
            <QRCode value={qrData} size={60} backgroundColor="transparent" color={colors.voice.gold} />
          </View>
          <View style={st.qrInfo}>
            <Text style={st.qrName}>{identity?.displayName || "You"}</Text>
            <Text style={st.qrId}>{identity?.speaqId || "No ID"}</Text>
            <Text style={st.qrHint}>Tap to enlarge or share</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Contact List */}
      {contacts.length === 0 ? (
        <View style={st.empty}>
          <Text style={st.emptyTitle}>No contacts yet</Text>
          <Text style={st.emptySub}>Tap "+ Add" to add a contact by SPEAQ ID{"\n"}or scan their QR code</Text>
        </View>
      ) : (
        contacts.map((c) => (
          <TouchableOpacity key={c.id} style={st.contactItem} onPress={() => onOpenChat(c.id, c.name)} activeOpacity={0.7}>
            <View style={st.contactAvatar}>
              <Text style={st.contactAvatarText}>{c.name.charAt(0)}</Text>
            </View>
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
  qrSmall: { marginRight: 16 },
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
