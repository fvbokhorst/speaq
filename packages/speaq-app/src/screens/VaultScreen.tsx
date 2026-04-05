/**
 * SPEAQ - Quantum Vault Screen
 * Encrypted file storage with plausible deniability
 * Two layers: normal (visible) + hidden (secret PIN)
 */

import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, TextInput, Alert, Image,
} from "react-native";
import { launchImageLibrary } from "react-native-image-picker";
import DocumentPicker from "react-native-document-picker";
import { colors } from "../theme/brand";
import {
  initVault, getVaultFiles, addToVault, removeFromVault,
  hasHiddenLayer, setupHiddenPin, unlockHidden, switchToNormal,
  getCurrentLayer, addDecoyNote, VaultFile,
} from "../services/vault";

interface Props {
  onBack: () => void;
}

export default function VaultScreen({ onBack }: Props) {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [layer, setLayer] = useState(getCurrentLayer());
  const [showSetupHidden, setShowSetupHidden] = useState(false);
  const [showUnlockHidden, setShowUnlockHidden] = useState(false);
  const [hiddenPin, setHiddenPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinStep, setPinStep] = useState<"create" | "confirm">("create");

  useEffect(() => {
    initVault().then(() => loadFiles());
  }, []);

  async function loadFiles() {
    const f = await getVaultFiles();
    setFiles(f);
  }

  async function handleAddPhoto() {
    try {
      const result = await launchImageLibrary({ mediaType: "photo", selectionLimit: 1, quality: 0.7 });
      if (result.assets && result.assets[0]?.uri) {
        const asset = result.assets[0];
        await addToVault(asset.fileName || "photo.jpg", asset.uri!, "photo");
        loadFiles();
      }
    } catch (e) {}
  }

  async function handleAddDocument() {
    try {
      const result = await DocumentPicker.pick({ type: [DocumentPicker.types.allFiles] });
      if (result[0]) {
        await addToVault(result[0].name || "document", result[0].uri, "document");
        loadFiles();
      }
    } catch (e) {
      if (!DocumentPicker.isCancel(e)) console.error(e);
    }
  }

  async function handleAddNote() {
    Alert.prompt("Add Note", "Write a secure note:", [
      { text: "Cancel", style: "cancel" },
      { text: "Save", onPress: async (text) => {
        if (text && text.trim()) {
          if (getCurrentLayer() === "hidden") {
            await addToVault("note.txt", "", "note");
          } else {
            await addDecoyNote(text.trim());
          }
          loadFiles();
        }
      }},
    ], "plain-text");
  }

  function handleAdd() {
    Alert.alert("Add to Vault", "What would you like to store securely?", [
      { text: "Photo", onPress: handleAddPhoto },
      { text: "Document", onPress: handleAddDocument },
      { text: "Note", onPress: handleAddNote },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function handleDelete(file: VaultFile) {
    Alert.alert("Delete", `Remove "${file.name}" from vault?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        await removeFromVault(file.id);
        loadFiles();
      }},
    ]);
  }

  function handleSetupHidden() {
    if (pinStep === "create") {
      if (hiddenPin.length < 4) {
        Alert.alert("Too short", "PIN must be at least 4 digits.");
        return;
      }
      setPinStep("confirm");
      setConfirmPin("");
    } else {
      if (confirmPin !== hiddenPin) {
        Alert.alert("Mismatch", "PINs don't match. Try again.");
        setHiddenPin("");
        setConfirmPin("");
        setPinStep("create");
        return;
      }
      setupHiddenPin(hiddenPin);
      setShowSetupHidden(false);
      setHiddenPin("");
      setConfirmPin("");
      setPinStep("create");
      Alert.alert("Hidden Vault Active", "Enter your secret PIN anytime to access the hidden layer. No one can prove it exists.");
    }
  }

  function handleUnlockHidden() {
    if (unlockHidden(hiddenPin)) {
      setLayer("hidden");
      setShowUnlockHidden(false);
      setHiddenPin("");
      loadFiles();
    } else {
      Alert.alert("Wrong PIN");
      setHiddenPin("");
    }
  }

  function handleSwitchToNormal() {
    switchToNormal();
    setLayer("normal");
    loadFiles();
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const typeIcons: Record<string, string> = { photo: "P", document: "D", note: "N", video: "V" };

  return (
    <View style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={onBack} style={st.backBtn}>
          <Text style={st.backText}>{"<"}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>Quantum Vault</Text>
          <Text style={st.layerBadge}>{layer === "hidden" ? "HIDDEN LAYER" : "STANDARD"}</Text>
        </View>
        <TouchableOpacity style={st.addBtn} onPress={handleAdd}>
          <Text style={st.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Layer controls */}
      <View style={st.layerRow}>
        {layer === "normal" ? (
          <>
            {hasHiddenLayer() ? (
              <TouchableOpacity style={st.layerBtn} onPress={() => setShowUnlockHidden(true)}>
                <Text style={st.layerBtnText}>Unlock Hidden</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={st.layerBtn} onPress={() => setShowSetupHidden(true)}>
                <Text style={st.layerBtnText}>Setup Hidden Vault</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <TouchableOpacity style={st.layerBtnRed} onPress={handleSwitchToNormal}>
            <Text style={st.layerBtnText}>Exit Hidden Layer</Text>
          </TouchableOpacity>
        )}
      </View>

      {layer === "hidden" && (
        <View style={st.warningBanner}>
          <Text style={st.warningText}>Hidden layer active. Files here are invisible in normal mode.</Text>
        </View>
      )}

      {/* Files */}
      <ScrollView style={st.scroll} contentContainerStyle={{ paddingBottom: 100 }}>
        {files.length === 0 ? (
          <View style={st.empty}>
            <Text style={st.emptyTitle}>{layer === "hidden" ? "Hidden vault is empty" : "Vault is empty"}</Text>
            <Text style={st.emptySub}>Tap "+ Add" to store files securely</Text>
          </View>
        ) : (
          files.map((file) => (
            <TouchableOpacity key={file.id} style={st.fileRow} onLongPress={() => handleDelete(file)}>
              {file.type === "photo" && file.uri ? (
                <Image source={{ uri: file.uri }} style={st.fileThumb} />
              ) : (
                <View style={st.fileIcon}>
                  <Text style={st.fileIconText}>{typeIcons[file.type] || "F"}</Text>
                </View>
              )}
              <View style={st.fileInfo}>
                <Text style={st.fileName} numberOfLines={1}>{file.name}</Text>
                <Text style={st.fileMeta}>{formatSize(file.size)} -- {formatDate(file.addedAt)}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Setup Hidden PIN Modal */}
      <Modal visible={showSetupHidden} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>{pinStep === "create" ? "Create Hidden PIN" : "Confirm Hidden PIN"}</Text>
            <Text style={st.modalSub}>
              {pinStep === "create"
                ? "This PIN unlocks a hidden vault layer. No one can prove it exists."
                : "Enter the same PIN again to confirm."}
            </Text>
            <TextInput
              style={st.pinInput}
              value={pinStep === "create" ? hiddenPin : confirmPin}
              onChangeText={pinStep === "create" ? setHiddenPin : setConfirmPin}
              placeholder="Enter PIN"
              placeholderTextColor={colors.signal.steel}
              keyboardType="number-pad"
              secureTextEntry
              autoFocus
            />
            <View style={st.modalBtns}>
              <TouchableOpacity style={st.cancelBtn} onPress={() => { setShowSetupHidden(false); setHiddenPin(""); setConfirmPin(""); setPinStep("create"); }}>
                <Text style={st.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.confirmBtn} onPress={handleSetupHidden}>
                <Text style={st.confirmText}>{pinStep === "create" ? "Next" : "Activate"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Unlock Hidden Modal */}
      <Modal visible={showUnlockHidden} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>Hidden Vault</Text>
            <TextInput
              style={st.pinInput}
              value={hiddenPin}
              onChangeText={setHiddenPin}
              placeholder="Enter hidden PIN"
              placeholderTextColor={colors.signal.steel}
              keyboardType="number-pad"
              secureTextEntry
              autoFocus
            />
            <View style={st.modalBtns}>
              <TouchableOpacity style={st.cancelBtn} onPress={() => { setShowUnlockHidden(false); setHiddenPin(""); }}>
                <Text style={st.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.confirmBtn} onPress={handleUnlockHidden}>
                <Text style={st.confirmText}>Unlock</Text>
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
  title: { color: colors.signal.white, fontSize: 22, fontWeight: "700", fontFamily: "Georgia" },
  layerBadge: { color: colors.quantum.teal, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 },
  addBtn: { backgroundColor: colors.voice.gold, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: colors.depth.void, fontSize: 13, fontWeight: "600" },

  layerRow: { paddingHorizontal: 16, paddingVertical: 12 },
  layerBtn: { backgroundColor: colors.depth.card, borderWidth: 1, borderColor: colors.quantum.teal, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  layerBtnRed: { backgroundColor: colors.depth.card, borderWidth: 1, borderColor: colors.signal.red, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  layerBtnText: { color: colors.signal.white, fontSize: 14, fontWeight: "500" },

  warningBanner: { backgroundColor: "rgba(45,212,191,0.1)", paddingVertical: 8, paddingHorizontal: 16 },
  warningText: { color: colors.quantum.teal, fontSize: 11, textAlign: "center" },

  scroll: { flex: 1, paddingHorizontal: 16 },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyTitle: { color: colors.signal.white, fontSize: 16, fontWeight: "500", marginBottom: 4 },
  emptySub: { color: colors.signal.steel, fontSize: 12 },

  fileRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  fileThumb: { width: 48, height: 48, borderRadius: 8, marginRight: 14 },
  fileIcon: { width: 48, height: 48, borderRadius: 8, backgroundColor: colors.depth.card, alignItems: "center", justifyContent: "center", marginRight: 14, borderWidth: 1, borderColor: colors.border.subtle },
  fileIconText: { color: colors.voice.gold, fontSize: 18, fontWeight: "600" },
  fileInfo: { flex: 1 },
  fileName: { color: colors.signal.white, fontSize: 15, fontWeight: "500" },
  fileMeta: { color: colors.signal.steel, fontSize: 11, marginTop: 2 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center" },
  modalBox: { width: 300, backgroundColor: colors.depth.card, borderRadius: 20, padding: 28, borderWidth: 1, borderColor: colors.border.subtle },
  modalTitle: { color: colors.signal.white, fontSize: 18, fontWeight: "600", marginBottom: 8 },
  modalSub: { color: colors.signal.steel, fontSize: 12, lineHeight: 18, marginBottom: 16 },
  pinInput: { backgroundColor: colors.depth.elevated, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, color: colors.signal.white, fontSize: 20, textAlign: "center", letterSpacing: 8, marginBottom: 16 },
  modalBtns: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border.subtle, alignItems: "center" },
  cancelText: { color: colors.signal.steel, fontSize: 14 },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.voice.gold, alignItems: "center" },
  confirmText: { color: colors.depth.void, fontSize: 14, fontWeight: "600" },
});
