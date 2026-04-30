/**
 * SPEAQ - Advanced Features
 * Private Groups, Witness Mode, Safety Check-in
 * Accessible from Settings
 */

import React, { useState, useEffect, Suspense } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, TextInput, Alert, Dimensions,
} from "react-native";
import { Camera } from "react-native-camera-kit";
import { useThemedStyles, useTheme, ThemeColors } from "../theme/ThemeContext";
import { advancedService, GhostGroup, GhostPoll, WitnessRecord, DeadManSwitch } from "../services/advanced";
import { contactsService, Contact } from "../services/contacts";

interface Props {
  onBack: () => void;
}

export default function AdvancedScreen({ onBack }: Props) {
  const { colors: c } = useTheme();
  const st = useThemedStyles(makeStyles);
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
  const [showPollCreate, setShowPollCreate] = useState(false);
  const [showPollView, setShowPollView] = useState(false);
  const [pollGroupId, setPollGroupId] = useState<string | null>(null);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [currentPolls, setCurrentPolls] = useState<GhostPoll[]>([]);

  useEffect(() => {
    advancedService.load().then(() => {
      setGhostGroups(advancedService.getGhostGroups());
      setWitnesses(advancedService.getWitnessRecords());
      setDms(advancedService.getDeadManSwitch());
    });
  }, []);

  // --- Private Groups ---
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
      { text: "Create Poll", onPress: () => {
        setPollGroupId(group.id);
        setPollQuestion("");
        setPollOptions(["", ""]);
        setShowPollCreate(true);
      }},
      { text: "View Polls", onPress: () => {
        setPollGroupId(group.id);
        setCurrentPolls(advancedService.getGhostPolls(group.id));
        setShowPollView(true);
      }},
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

  function handleCreatePoll() {
    if (!pollGroupId || !pollQuestion.trim()) return;
    const validOptions = pollOptions.filter((o) => o.trim());
    if (validOptions.length < 2) {
      Alert.alert("Need Options", "Add at least 2 poll options.");
      return;
    }
    advancedService.createGhostPoll(pollGroupId, pollQuestion.trim(), validOptions.map((o) => o.trim()));
    setShowPollCreate(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
    Alert.alert("Poll Created", "Anonymous poll is live in the private group.");
  }

  function handleVote(poll: GhostPoll, optionIndex: number) {
    if (!pollGroupId) return;
    const success = advancedService.voteOnPoll(pollGroupId, poll.id, optionIndex);
    if (success) {
      setCurrentPolls(advancedService.getGhostPolls(pollGroupId));
    } else {
      Alert.alert("Already Voted", "You can only vote once per poll.");
    }
  }

  // --- Witness Mode ---
  function handleCreateWitness() {
    if (!witnessText.trim()) return;
    advancedService.createWitness("text", witnessText.trim());
    setWitnesses(advancedService.getWitnessRecords());
    setWitnessText("");
    setShowWitness(false);
    Alert.alert("Witness Created", "Timestamped, hashed, and signed. This record is tamper-proof.");
  }

  function handleVerifyWitness(record: WitnessRecord) {
    const valid = advancedService.verifyWitness(record);
    if (valid) {
      Alert.alert("Verified", "Signature is valid. This record has not been tampered with.");
    } else {
      Alert.alert("INVALID", "Signature does NOT match. This record may have been tampered with.");
    }
  }

  function handleShareProof(record: WitnessRecord) {
    const proof = advancedService.exportWitness(record);
    Alert.alert("Shareable Proof", JSON.stringify(proof, null, 2));
  }

  // --- Safety Check-in ---
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
    Alert.alert("Safety Check-in Active", `Check in every ${hours} hours or your safety message will be sent automatically.`);
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
      Alert.alert("Member Added", `${speaqId} added to private group via QR scan.`);
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
        {/* Private Groups */}
        <View style={st.section}>
          <View style={st.sectionHeader}>
            <View>
              <Text style={st.sectionTitle}>Private Groups</Text>
              <Text style={st.sectionDesc}>Private groups with invite-only access. Members stay anonymous.</Text>
            </View>
            <TouchableOpacity onPress={() => setShowNewGhost(true)}>
              <Text style={st.addBtn}>+ New</Text>
            </TouchableOpacity>
          </View>
          {ghostGroups.length === 0 ? (
            <Text style={st.emptyText}>No private groups yet. Create one for secure group communication.</Text>
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
            witnesses.slice(0, 5).map((w) => {
              const isValid = advancedService.verifyWitness(w);
              return (
                <View key={w.id} style={st.itemCard}>
                  <View style={st.witnessIcon}>
                    <Text style={st.witnessIconText}>{isValid ? "V" : "!"}</Text>
                  </View>
                  <View style={st.itemInfo}>
                    <Text style={st.itemName} numberOfLines={1}>{w.content}</Text>
                    <Text style={st.itemMeta}>{formatDate(w.timestamp)}</Text>
                    <Text style={st.hashText} numberOfLines={1}>SHA-256: {w.contentHash.substring(0, 24)}...</Text>
                    {w.location && <Text style={st.hashText}>GPS: {w.location.lat.toFixed(4)}, {w.location.lng.toFixed(4)}</Text>}
                    <Text style={[st.hashText, { color: isValid ? "#22C55E" : c.signal.red }]}>
                      {isValid ? "Signature valid" : "SIGNATURE INVALID"}
                    </Text>
                    <View style={st.witnessActions}>
                      <TouchableOpacity onPress={() => handleVerifyWitness(w)}>
                        <Text style={st.witnessActionBtn}>Verify</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleShareProof(w)}>
                        <Text style={st.witnessActionBtn}>Share Proof</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Safety Check-in */}
        <View style={st.section}>
          <View style={st.sectionHeader}>
            <View>
              <Text style={st.sectionTitle}>Safety Check-in</Text>
              <Text style={st.sectionDesc}>Sends a safety message if you don't check in on time.</Text>
            </View>
          </View>
          {!dms || !dms.enabled ? (
            <TouchableOpacity style={st.dmsSetup} onPress={() => setShowDmsConfig(true)}>
              <Text style={st.dmsSetupText}>Configure Check-in</Text>
              <Text style={st.dmsSetupSub}>Set a check-in interval and safety message</Text>
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

      {/* New Private Group Modal */}
      <Modal visible={showNewGhost} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>New Private Group</Text>
            <TextInput style={st.input} value={ghostName} onChangeText={setGhostName}
              placeholder="Group name" placeholderTextColor={c.signal.steel} autoFocus />
            <TextInput style={st.input} value={ghostDesc} onChangeText={setGhostDesc}
              placeholder="Description (optional)" placeholderTextColor={c.signal.steel} />
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
              placeholder="What are you witnessing?" placeholderTextColor={c.signal.steel}
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
        <View style={{ flex: 1, backgroundColor: c.depth.void }}>
          <View style={st.scannerHeader}>
            <Text style={st.scannerTitle}>Scan SPEAQ QR Code</Text>
            <TouchableOpacity onPress={() => setShowQRScanner(false)}>
              <Text style={st.scannerClose}>Close</Text>
            </TouchableOpacity>
          </View>
          <Suspense fallback={<View style={{ flex: 1 }}><Text style={{ color: c.signal.white, textAlign: "center", marginTop: 100 }}>Loading camera...</Text></View>}>
          <Camera
            scanBarcode
            onReadCode={handleQRScan}
            showFrame
            frameColor={c.voice.gold}
            laserColor={c.quantum.teal}
          />
          </Suspense>
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
            <Text style={st.modalTitle}>Safety Check-in</Text>
            <Text style={st.modalSub}>Set a check-in interval. If you don't check in on time, your safety message is sent automatically.</Text>
            <TextInput style={st.input} value={dmsHours} onChangeText={setDmsHours}
              placeholder="Check-in interval (hours)" placeholderTextColor={c.signal.steel}
              keyboardType="number-pad" />
            <TextInput style={st.input} value={dmsRecipient} onChangeText={setDmsRecipient}
              placeholder="Recipient SPEAQ ID" placeholderTextColor={c.signal.steel}
              autoCapitalize="none" />
            <TextInput style={[st.input, { height: 80, textAlignVertical: "top" }]}
              value={dmsMessage} onChangeText={setDmsMessage}
              placeholder="Safety message" placeholderTextColor={c.signal.steel}
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

      {/* Create Poll Modal */}
      <Modal visible={showPollCreate} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>Create Anonymous Poll</Text>
            <Text style={st.modalSub}>No voter identity is recorded. Results are anonymous.</Text>
            <TextInput style={st.input} value={pollQuestion} onChangeText={setPollQuestion}
              placeholder="Question" placeholderTextColor={c.signal.steel} autoFocus />
            {pollOptions.map((opt, i) => (
              <TextInput key={i} style={st.input} value={opt}
                onChangeText={(val) => { const updated = [...pollOptions]; updated[i] = val; setPollOptions(updated); }}
                placeholder={`Option ${i + 1}`} placeholderTextColor={c.signal.steel} />
            ))}
            <TouchableOpacity onPress={() => setPollOptions([...pollOptions, ""])}>
              <Text style={st.addBtn}>+ Add Option</Text>
            </TouchableOpacity>
            <View style={[st.modalBtns, { marginTop: 12 }]}>
              <TouchableOpacity style={st.cancelBtn} onPress={() => setShowPollCreate(false)}>
                <Text style={st.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.confirmBtn} onPress={handleCreatePoll}>
                <Text style={st.confirmText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* View Polls Modal */}
      <Modal visible={showPollView} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>Polls</Text>
            {currentPolls.length === 0 ? (
              <Text style={st.emptyText}>No polls yet. Create one from the group menu.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 400 }}>
                {currentPolls.map((poll) => (
                  <View key={poll.id} style={st.pollCard}>
                    <Text style={st.pollQuestion}>{poll.question}</Text>
                    <Text style={st.pollMeta}>{poll.totalVoters} vote{poll.totalVoters !== 1 ? "s" : ""} -- {formatDate(poll.createdAt)}</Text>
                    {poll.options.map((opt, i) => {
                      const pct = poll.totalVoters > 0 ? Math.round((poll.votes[i] / poll.totalVoters) * 100) : 0;
                      return (
                        <TouchableOpacity key={i} style={st.pollOption} onPress={() => handleVote(poll, i)}>
                          <View style={[st.pollBar, { width: `${pct}%` }]} />
                          <Text style={st.pollOptText}>{opt}</Text>
                          <Text style={st.pollOptCount}>{poll.votes[i]} ({pct}%)</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={[st.cancelBtn, { marginTop: 12 }]} onPress={() => setShowPollView(false)}>
              <Text style={st.cancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.depth.void },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 60, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: c.border.subtle },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginRight: 8 },
  backText: { color: c.voice.gold, fontSize: 20, fontWeight: "600" },
  title: { color: c.signal.white, fontSize: 24, fontWeight: "700", fontFamily: "Georgia" },
  scroll: { flex: 1 },

  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  sectionTitle: { color: c.signal.white, fontSize: 18, fontWeight: "600" },
  sectionDesc: { color: c.signal.steel, fontSize: 11, marginTop: 2, maxWidth: 240 },
  addBtn: { color: c.voice.gold, fontSize: 13, fontWeight: "600" },

  emptyText: { color: c.signal.steel, fontSize: 12, paddingVertical: 12 },

  itemCard: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: c.depth.card, borderRadius: 12, borderWidth: 1, borderColor: c.border.subtle, marginBottom: 8 },
  ghostIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(212,168,83,0.15)", alignItems: "center", justifyContent: "center", marginRight: 12 },
  ghostIconText: { color: c.voice.gold, fontSize: 16, fontWeight: "600" },
  witnessIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(45,212,191,0.15)", alignItems: "center", justifyContent: "center", marginRight: 12 },
  witnessIconText: { color: c.quantum.teal, fontSize: 16, fontWeight: "600" },
  itemInfo: { flex: 1 },
  itemName: { color: c.signal.white, fontSize: 14, fontWeight: "500" },
  itemMeta: { color: c.signal.steel, fontSize: 11, marginTop: 2 },
  hashText: { color: c.quantum.teal, fontSize: 9, fontFamily: "Courier", marginTop: 2 },

  dmsSetup: { padding: 20, backgroundColor: c.depth.card, borderRadius: 12, borderWidth: 1, borderColor: c.border.subtle, alignItems: "center" },
  dmsSetupText: { color: c.voice.gold, fontSize: 15, fontWeight: "600" },
  dmsSetupSub: { color: c.signal.steel, fontSize: 11, marginTop: 4 },

  dmsActive: { padding: 16, backgroundColor: c.depth.card, borderRadius: 12, borderWidth: 1, borderColor: c.border.subtle },
  dmsStatus: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  dmsDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  dmsDotGreen: { backgroundColor: "#22C55E" },
  dmsDotRed: { backgroundColor: c.signal.red },
  dmsStatusText: { color: c.signal.white, fontSize: 14, fontWeight: "600" },
  dmsInfo: { color: c.signal.steel, fontSize: 12, marginTop: 2 },
  dmsActions: { flexDirection: "row", gap: 12, marginTop: 12 },
  checkInBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: "#22C55E", alignItems: "center" },
  checkInText: { color: c.signal.white, fontSize: 14, fontWeight: "600" },
  disableBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: c.signal.red, alignItems: "center" },
  disableText: { color: c.signal.red, fontSize: 14 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center" },
  modalBox: { width: 300, backgroundColor: c.depth.card, borderRadius: 20, padding: 28, borderWidth: 1, borderColor: c.border.subtle },
  modalTitle: { color: c.signal.white, fontSize: 18, fontWeight: "600", marginBottom: 8 },
  modalSub: { color: c.signal.steel, fontSize: 11, marginBottom: 16, lineHeight: 16 },
  input: { backgroundColor: c.depth.elevated, borderWidth: 1, borderColor: c.border.subtle, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: c.signal.white, fontSize: 15, marginBottom: 12 },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border.subtle, alignItems: "center" },
  cancelText: { color: c.signal.steel, fontSize: 14 },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: c.voice.gold, alignItems: "center" },
  confirmText: { color: c.depth.void, fontSize: 14, fontWeight: "600" },
  scannerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16, backgroundColor: c.depth.void },
  scannerTitle: { color: c.signal.white, fontSize: 18, fontWeight: "600" },
  scannerClose: { color: c.voice.gold, fontSize: 16, fontWeight: "500" },
  contactPickRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border.subtle },
  contactPickAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.depth.elevated, alignItems: "center", justifyContent: "center", marginRight: 12, borderWidth: 1, borderColor: c.quantum.teal },
  contactPickInit: { color: c.quantum.teal, fontSize: 14, fontWeight: "600" },
  contactPickName: { color: c.signal.white, fontSize: 14, fontWeight: "500" },
  contactPickId: { color: c.signal.steel, fontSize: 10, fontFamily: "Courier", marginTop: 1 },
  witnessActions: { flexDirection: "row", gap: 12, marginTop: 6 },
  witnessActionBtn: { color: c.voice.gold, fontSize: 11, fontWeight: "600" },
  pollCard: { padding: 12, backgroundColor: c.depth.elevated, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: c.border.subtle },
  pollQuestion: { color: c.signal.white, fontSize: 14, fontWeight: "600", marginBottom: 4 },
  pollMeta: { color: c.signal.steel, fontSize: 10, marginBottom: 8 },
  pollOption: { position: "relative", flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: c.border.subtle, marginBottom: 4, overflow: "hidden" },
  pollBar: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "rgba(212,168,83,0.15)", borderRadius: 8 } as any,
  pollOptText: { color: c.signal.white, fontSize: 13, zIndex: 1 },
  pollOptCount: { color: c.signal.steel, fontSize: 11, zIndex: 1 },
});
