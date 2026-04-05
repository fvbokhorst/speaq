/**
 * SPEAQ - Advanced Features
 * Ghost Groups, Witness Mode, Dead Man's Switch
 * Accessible from Settings
 */

import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, TextInput, Alert, Dimensions,
} from "react-native";
import { CameraScreen } from "react-native-camera-kit";
import { colors } from "../theme/brand";
import { advancedService, GhostGroup, WitnessRecord, DeadManSwitch } from "../services/advanced";
import { contactsService, Contact } from "../services/contacts";

interface Props {
  onBack: () => void;
}

export default function AdvancedScreen({ onBack }: Props) {
  const [ghostGroups, setGhostGroups] = useState<GhostGroup[]>([]);
  const [witnesses, setWitnesses] = useState<WitnessRecord[]>([]);
  const [dms, setDms] = useState<DeadManSwitch | null>(null);
  const [showNewGhost, setShowNewGhost] = useState(false);
  const [showWitness, setShowWitness] = useState(false);
  const [showDmsConfig, setShowDmsConfig] = useState(false);
  const [ghostName, setGhostName] = useState("");
  const [ghostDesc, setGhostDesc] = useState("");
  const [witnessText, setWitnessText] = useState("");
  const [dmsHours, setDmsHours] = useState("24");
  const [dmsMessage, setDmsMessage] = useState("");
  const [dmsRecipient, setDmsRecipient] = useState("");
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [pickerGroupId, setPickerGroupId] = useState<string | null>(null);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);

  useEffect(() => {
    advancedService.load().then(() => {
      setGhostGroups(advancedService.getGhostGroups());
      setWitnesses(advancedService.getWitnessRecords());
      setDms(advancedService.getDeadManSwitch());
    });
  }, []);

  // --- Ghost Groups ---
  function handleCreateGhost() {
    if (!ghostName.trim()) return;
    advancedService.createGhostGroup(ghostName.trim(), ghostDesc.trim());
    setGhostGroups(advancedService.getGhostGroups());
    setGhostName("");
    setGhostDesc("");
    setShowNewGhost(false);
  }

  function handleGhostAction(group: GhostGroup) {
    Alert.alert(group.name, `${group.members.length} members`, [
      { text: "Add from Contacts", onPress: () => {
        setAllContacts(contactsService.getContacts());
        setPickerGroupId(group.id);
        setShowContactPicker(true);
      }},
      { text: "Scan QR Code", onPress: () => {
        setPickerGroupId(group.id);
        setShowQRScanner(true);
      }},
      { text: "Send Message", onPress: () => {
        Alert.prompt("Ghost Message", "Message to all members:", [
          { text: "Cancel", style: "cancel" },
          { text: "Send", onPress: (val) => {
            if (val) advancedService.sendGhostMessage(group.id, val);
          }},
        ]);
      }},
      { text: "Delete", style: "destructive", onPress: () => {
        advancedService.deleteGhostGroup(group.id);
        setGhostGroups(advancedService.getGhostGroups());
      }},
      { text: "Cancel", style: "cancel" },
    ]);
  }

  // --- Witness Mode ---
  async function handleCreateWitness() {
    if (!witnessText.trim()) return;
    await advancedService.createWitness("text", witnessText.trim());
    setWitnesses(advancedService.getWitnessRecords());
    setWitnessText("");
    setShowWitness(false);
    Alert.alert("Witness Created", "Timestamped and hashed. This record is tamper-proof.");
  }

  // --- Dead Man's Switch ---
  async function handleConfigureDms() {
    const hours = parseInt(dmsHours) || 24;
    if (!dmsMessage.trim() || !dmsRecipient.trim()) return;
    await advancedService.configureDeadManSwitch(
      hours,
      [{ speaqId: dmsRecipient.trim(), name: dmsRecipient.trim() }],
      dmsMessage.trim()
    );
    setDms(advancedService.getDeadManSwitch());
    setShowDmsConfig(false);
    Alert.alert("Switch Active", `Check in every ${hours} hours or your message will be sent automatically.`);
  }

  async function handleCheckIn() {
    await advancedService.checkIn();
    setDms(advancedService.getDeadManSwitch());
    Alert.alert("Checked In", "Timer reset.");
  }

  async function handleDisableDms() {
    await advancedService.disableDeadManSwitch();
    setDms(advancedService.getDeadManSwitch());
  }

  function handleQRScan(event: any) {
    const value = event.nativeEvent?.codeStringValue || "";
    // Parse speaq:// URI to get SPEAQ ID
    const speaqId = value.startsWith("speaq://") ? value.replace("speaq://", "") : value;
    if (speaqId && pickerGroupId) {
      advancedService.addMemberToGhost(pickerGroupId, speaqId);
      setGhostGroups(advancedService.getGhostGroups());
      setShowQRScanner(false);
      setPickerGroupId(null);
      Alert.alert("Member Added", `${speaqId} added to ghost group via QR scan.`);
    }
  }

  function handlePickContact(contact: Contact) {
    if (pickerGroupId) {
      advancedService.addMemberToGhost(pickerGroupId, contact.id);
      setGhostGroups(advancedService.getGhostGroups());
    }
    setShowContactPicker(false);
    setPickerGroupId(null);
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  }

  return (
    <View style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={onBack} style={st.backBtn}>
          <Text style={st.backText}>{"<"}</Text>
        </TouchableOpacity>
        <Text style={st.title}>Advanced</Text>
      </View>

      <ScrollView style={st.scroll}>
        {/* Ghost Groups */}
        <View style={st.section}>
          <View style={st.sectionHeader}>
            <View>
              <Text style={st.sectionTitle}>Ghost Groups</Text>
              <Text style={st.sectionDesc}>Invisible groups. No member list. Stealth invites only.</Text>
            </View>
            <TouchableOpacity onPress={() => setShowNewGhost(true)}>
              <Text style={st.addBtn}>+ New</Text>
            </TouchableOpacity>
          </View>
          {ghostGroups.length === 0 ? (
            <Text style={st.emptyText}>No ghost groups. Create one to communicate invisibly.</Text>
          ) : (
            ghostGroups.map((g) => (
              <TouchableOpacity key={g.id} style={st.itemCard} onPress={() => handleGhostAction(g)}>
                <View style={st.ghostIcon}><Text style={st.ghostIconText}>G</Text></View>
                <View style={st.itemInfo}>
                  <Text style={st.itemName}>{g.name}</Text>
                  <Text style={st.itemMeta}>{g.members.length} members</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Witness Mode */}
        <View style={st.section}>
          <View style={st.sectionHeader}>
            <View>
              <Text style={st.sectionTitle}>Witness Mode</Text>
              <Text style={st.sectionDesc}>One-tap evidence. Timestamped, hashed, tamper-proof.</Text>
            </View>
            <TouchableOpacity onPress={() => setShowWitness(true)}>
              <Text style={st.addBtn}>+ Record</Text>
            </TouchableOpacity>
          </View>
          {witnesses.length === 0 ? (
            <Text style={st.emptyText}>No witness records. Tap "Record" to create tamper-proof evidence.</Text>
          ) : (
            witnesses.slice(0, 5).map((w) => (
              <View key={w.id} style={st.itemCard}>
                <View style={st.witnessIcon}><Text style={st.witnessIconText}>W</Text></View>
                <View style={st.itemInfo}>
                  <Text style={st.itemName} numberOfLines={1}>{w.content}</Text>
                  <Text style={st.itemMeta}>{formatDate(w.timestamp)}</Text>
                  <Text style={st.hashText} numberOfLines={1}>SHA-256: {w.contentHash.substring(0, 24)}...</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Dead Man's Switch */}
        <View style={st.section}>
          <View style={st.sectionHeader}>
            <View>
              <Text style={st.sectionTitle}>Dead Man's Switch</Text>
              <Text style={st.sectionDesc}>Auto-sends a message if you don't check in on time.</Text>
            </View>
          </View>
          {!dms || !dms.enabled ? (
            <TouchableOpacity style={st.dmsSetup} onPress={() => setShowDmsConfig(true)}>
              <Text style={st.dmsSetupText}>Configure Switch</Text>
              <Text style={st.dmsSetupSub}>Set a check-in interval and emergency message</Text>
            </TouchableOpacity>
          ) : (
            <View style={st.dmsActive}>
              <View style={st.dmsStatus}>
                <View style={[st.dmsDot, advancedService.isOverdue() ? st.dmsDotRed : st.dmsDotGreen]} />
                <Text style={st.dmsStatusText}>
                  {advancedService.isOverdue() ? "OVERDUE" : "Active"}
                </Text>
              </View>
              <Text style={st.dmsInfo}>Interval: {dms.intervalHours}h</Text>
              <Text style={st.dmsInfo}>Last check-in: {formatDate(dms.lastCheckIn)}</Text>
              <Text style={st.dmsInfo}>Recipients: {dms.recipients.length}</Text>
              <View style={st.dmsActions}>
                <TouchableOpacity style={st.checkInBtn} onPress={handleCheckIn}>
                  <Text style={st.checkInText}>Check In</Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.disableBtn} onPress={handleDisableDms}>
                  <Text style={st.disableText}>Disable</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* New Ghost Group Modal */}
      <Modal visible={showNewGhost} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>New Ghost Group</Text>
            <TextInput style={st.input} value={ghostName} onChangeText={setGhostName}
              placeholder="Group name" placeholderTextColor={colors.signal.steel} autoFocus />
            <TextInput style={st.input} value={ghostDesc} onChangeText={setGhostDesc}
              placeholder="Description (optional)" placeholderTextColor={colors.signal.steel} />
            <View style={st.modalBtns}>
              <TouchableOpacity style={st.cancelBtn} onPress={() => setShowNewGhost(false)}>
                <Text style={st.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.confirmBtn} onPress={handleCreateGhost}>
                <Text style={st.confirmText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Witness Modal */}
      <Modal visible={showWitness} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>Witness Record</Text>
            <Text style={st.modalSub}>Type what you want to record. It will be timestamped and cryptographically hashed.</Text>
            <TextInput style={[st.input, { height: 100, textAlignVertical: "top" }]}
              value={witnessText} onChangeText={setWitnessText}
              placeholder="What are you witnessing?" placeholderTextColor={colors.signal.steel}
              multiline autoFocus />
            <View style={st.modalBtns}>
              <TouchableOpacity style={st.cancelBtn} onPress={() => setShowWitness(false)}>
                <Text style={st.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.confirmBtn} onPress={handleCreateWitness}>
                <Text style={st.confirmText}>Record</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* QR Scanner Modal */}
      <Modal visible={showQRScanner} animationType="slide">
        <View style={{ flex: 1, backgroundColor: colors.depth.void }}>
          <View style={st.scannerHeader}>
            <Text style={st.scannerTitle}>Scan SPEAQ QR Code</Text>
            <TouchableOpacity onPress={() => setShowQRScanner(false)}>
              <Text style={st.scannerClose}>Close</Text>
            </TouchableOpacity>
          </View>
          <CameraScreen
            scanBarcode
            onReadCode={handleQRScan}
            showFrame
            frameColor={colors.voice.gold}
            laserColor={colors.quantum.teal}
          />
        </View>
      </Modal>

      {/* Contact Picker Modal */}
      <Modal visible={showContactPicker} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>Select Contact</Text>
            {allContacts.length === 0 ? (
              <Text style={st.emptyText}>No contacts yet. Add contacts first.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 300 }}>
                {allContacts.map((c) => (
                  <TouchableOpacity key={c.id} style={st.contactPickRow} onPress={() => handlePickContact(c)}>
                    <View style={st.contactPickAvatar}>
                      <Text style={st.contactPickInit}>{c.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.contactPickName}>{c.name}</Text>
                      <Text style={st.contactPickId}>{c.id}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={[st.cancelBtn, { marginTop: 12 }]} onPress={() => setShowContactPicker(false)}>
              <Text style={st.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* DMS Config Modal */}
      <Modal visible={showDmsConfig} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>Dead Man's Switch</Text>
            <Text style={st.modalSub}>If you don't check in within the interval, your message is sent automatically.</Text>
            <TextInput style={st.input} value={dmsHours} onChangeText={setDmsHours}
              placeholder="Check-in interval (hours)" placeholderTextColor={colors.signal.steel}
              keyboardType="number-pad" />
            <TextInput style={st.input} value={dmsRecipient} onChangeText={setDmsRecipient}
              placeholder="Recipient SPEAQ ID" placeholderTextColor={colors.signal.steel}
              autoCapitalize="none" />
            <TextInput style={[st.input, { height: 80, textAlignVertical: "top" }]}
              value={dmsMessage} onChangeText={setDmsMessage}
              placeholder="Emergency message" placeholderTextColor={colors.signal.steel}
              multiline />
            <View style={st.modalBtns}>
              <TouchableOpacity style={st.cancelBtn} onPress={() => setShowDmsConfig(false)}>
                <Text style={st.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.confirmBtn} onPress={handleConfigureDms}>
                <Text style={st.confirmText}>Activate</Text>
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
  header: { flexDirection: "row", alignItems: "center", paddingTop: 60, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginRight: 8 },
  backText: { color: colors.voice.gold, fontSize: 20, fontWeight: "600" },
  title: { color: colors.signal.white, fontSize: 24, fontWeight: "700", fontFamily: "Georgia" },
  scroll: { flex: 1 },

  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  sectionTitle: { color: colors.signal.white, fontSize: 18, fontWeight: "600" },
  sectionDesc: { color: colors.signal.steel, fontSize: 11, marginTop: 2, maxWidth: 240 },
  addBtn: { color: colors.voice.gold, fontSize: 13, fontWeight: "600" },

  emptyText: { color: colors.signal.steel, fontSize: 12, paddingVertical: 12 },

  itemCard: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: colors.depth.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border.subtle, marginBottom: 8 },
  ghostIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(212,168,83,0.15)", alignItems: "center", justifyContent: "center", marginRight: 12 },
  ghostIconText: { color: colors.voice.gold, fontSize: 16, fontWeight: "600" },
  witnessIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(45,212,191,0.15)", alignItems: "center", justifyContent: "center", marginRight: 12 },
  witnessIconText: { color: colors.quantum.teal, fontSize: 16, fontWeight: "600" },
  itemInfo: { flex: 1 },
  itemName: { color: colors.signal.white, fontSize: 14, fontWeight: "500" },
  itemMeta: { color: colors.signal.steel, fontSize: 11, marginTop: 2 },
  hashText: { color: colors.quantum.teal, fontSize: 9, fontFamily: "Courier", marginTop: 2 },

  dmsSetup: { padding: 20, backgroundColor: colors.depth.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border.subtle, alignItems: "center" },
  dmsSetupText: { color: colors.voice.gold, fontSize: 15, fontWeight: "600" },
  dmsSetupSub: { color: colors.signal.steel, fontSize: 11, marginTop: 4 },

  dmsActive: { padding: 16, backgroundColor: colors.depth.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border.subtle },
  dmsStatus: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  dmsDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  dmsDotGreen: { backgroundColor: "#22C55E" },
  dmsDotRed: { backgroundColor: colors.signal.red },
  dmsStatusText: { color: colors.signal.white, fontSize: 14, fontWeight: "600" },
  dmsInfo: { color: colors.signal.steel, fontSize: 12, marginTop: 2 },
  dmsActions: { flexDirection: "row", gap: 12, marginTop: 12 },
  checkInBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: "#22C55E", alignItems: "center" },
  checkInText: { color: colors.signal.white, fontSize: 14, fontWeight: "600" },
  disableBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.signal.red, alignItems: "center" },
  disableText: { color: colors.signal.red, fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center" },
  modalBox: { width: 300, backgroundColor: colors.depth.card, borderRadius: 20, padding: 28, borderWidth: 1, borderColor: colors.border.subtle },
  modalTitle: { color: colors.signal.white, fontSize: 18, fontWeight: "600", marginBottom: 8 },
  modalSub: { color: colors.signal.steel, fontSize: 11, marginBottom: 16, lineHeight: 16 },
  input: { backgroundColor: colors.depth.elevated, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: colors.signal.white, fontSize: 15, marginBottom: 12 },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border.subtle, alignItems: "center" },
  cancelText: { color: colors.signal.steel, fontSize: 14 },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.voice.gold, alignItems: "center" },
  confirmText: { color: colors.depth.void, fontSize: 14, fontWeight: "600" },
  scannerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16, backgroundColor: colors.depth.void },
  scannerTitle: { color: colors.signal.white, fontSize: 18, fontWeight: "600" },
  scannerClose: { color: colors.voice.gold, fontSize: 16, fontWeight: "500" },
  contactPickRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  contactPickAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.depth.elevated, alignItems: "center", justifyContent: "center", marginRight: 12, borderWidth: 1, borderColor: colors.quantum.teal },
  contactPickInit: { color: colors.quantum.teal, fontSize: 14, fontWeight: "600" },
  contactPickName: { color: colors.signal.white, fontSize: 14, fontWeight: "500" },
  contactPickId: { color: colors.signal.steel, fontSize: 10, fontFamily: "Courier", marginTop: 1 },
});
