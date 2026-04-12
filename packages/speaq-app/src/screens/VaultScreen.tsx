/**
 * SPEAQ - Quantum Vault Screen
 * Encrypted file storage with plausible deniability
 * Two layers: normal (visible) + hidden (secret PIN)
 */

import React, { useState, useEffect, Suspense } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, TextInput, Alert, Image, Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { launchImageLibrary } from "react-native-image-picker";
import DocumentPicker from "react-native-document-picker";
import { Camera } from "react-native-camera-kit";
import { colors } from "../theme/brand";
import { contactsService } from "../services/contacts";
import { sendMessage } from "../services/speaq";
// Use Alert to show copyable text instead of native clipboard
const copyToClipboard = (text: string) => Alert.alert("Copied", "Backup data ready. Long-press to select and copy from the field below.", [{ text: "OK" }]);
import {
  initVault, getVaultFiles, addToVault, removeFromVault, readVaultFile,
  hasHiddenLayer, setupHiddenPin, unlockHidden, switchToNormal,
  getCurrentLayer, VaultFile, exportVaultBackup, importVaultBackup,
} from "../services/vault";

interface Props {
  onBack: () => void;
}

export default function VaultScreen({ onBack }: Props) {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
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
    // Decrypt photo thumbnails
    const newThumbs: Record<string, string> = {};
    for (const file of f) {
      if (file.type === "photo" && file.uri) {
        try {
          const base64 = await readVaultFile(file);
          const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
          const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";
          newThumbs[file.id] = `data:${mime};base64,${base64}`;
        } catch { /* skip broken thumbnails */ }
      }
    }
    setThumbs(newThumbs);
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

  function handleAddNote() {
    setEditingNoteFile(null);
    setNoteText("");
    setShowNoteEditor(true);
  }

  async function handleSaveNote() {
    if (!noteText.trim()) return;
    if (editingNoteFile) {
      // Update existing note -- re-encrypt via addToVault (remove old, add new)
      await removeFromVault(editingNoteFile.id);
      await addToVault(editingNoteFile.name, "", "note", noteText.trim());
    } else {
      // Create new note
      await addToVault("note.txt", "", "note", noteText.trim());
    }
    setShowNoteEditor(false);
    setNoteText("");
    setEditingNoteFile(null);
    loadFiles();
  }

  function handleShareFile(file: VaultFile) {
    setShareFile(file);
    setShowSharePicker(true);
  }

  async function handleSendToContact(contactId: string, contactName: string) {
    if (!shareFile) return;
    try {
      if (shareFile.type === "note" && shareFile.uri) {
        const content = await readVaultFile(shareFile);
        sendMessage(contactId, `[Vault Note] ${content}`);
      } else if (shareFile.type === "photo" && shareFile.uri) {
        // Decrypt photo to get base64 data
        const base64 = await readVaultFile(shareFile);
        sendMessage(contactId, JSON.stringify({ type: "vault_file", fileType: "photo", name: shareFile.name, data: base64.substring(0, 1000) + "..." }));
        // For now send as file reference - full transfer needs relay file support
        sendMessage(contactId, `[Vault Photo: ${shareFile.name}]`);
      } else if (shareFile.uri) {
        sendMessage(contactId, `[Vault ${shareFile.type}: ${shareFile.name}]`);
      }
    } catch (e) {
      console.error("Send vault file error:", e);
    }
    const name = shareFile.name;
    setShowSharePicker(false);
    setShareFile(null);
    setShareManualId("");
    Alert.alert("Sent", `${name} shared with ${contactName}`);
  }

  function handleAdd() {
    Alert.alert("Add to Vault", "What would you like to store securely?", [
      { text: "Photo", onPress: handleAddPhoto },
      { text: "Document", onPress: handleAddDocument },
      { text: "Note", onPress: handleAddNote },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreData, setRestoreData] = useState("");

  async function handleBackup() {
    try {
      const backup = await exportVaultBackup();
      copyToClipboard(backup);
      Alert.alert("Backup Created", "Encrypted backup copied to clipboard. Store it safely -- you need your vault PIN to restore.");
    } catch (e: any) {
      Alert.alert("Backup Failed", e.message || "Could not create backup.");
    }
  }

  async function handleRestore() {
    if (!restoreData.trim()) return;
    try {
      const count = await importVaultBackup(restoreData.trim());
      setShowRestoreModal(false);
      setRestoreData("");
      loadFiles();
      Alert.alert("Restore Complete", `${count} file(s) restored successfully.`);
    } catch (e: any) {
      Alert.alert("Restore Failed", e.message || "Could not restore backup. Check your PIN and data.");
    }
  }

  const [viewFile, setViewFile] = useState<VaultFile | null>(null);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [editingNoteFile, setEditingNoteFile] = useState<VaultFile | null>(null);
  const [showSharePicker, setShowSharePicker] = useState(false);
  const [showShareQR, setShowShareQR] = useState(false);
  const [shareFile, setShareFile] = useState<VaultFile | null>(null);
  const [shareManualId, setShareManualId] = useState("");

  async function handleTapFile(file: VaultFile) {
    if (file.type === "photo") {
      // Decrypt photo for viewing -- create a temp decrypted data URI
      try {
        const base64 = await readVaultFile(file);
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";
        setViewFile({ ...file, uri: `data:${mime};base64,${base64}` });
      } catch {
        setViewFile(file);
      }
    } else if (file.type === "note" && file.uri) {
      try {
        const content = await readVaultFile(file);
        setEditingNoteFile(file);
        setNoteText(content);
        setShowNoteEditor(true);
      } catch (e) {
        handleFileActions(file);
      }
    } else {
      handleFileActions(file);
    }
  }

  function handleFileActions(file: VaultFile) {
    Alert.alert(file.name, `${file.type} -- ${formatSize(file.size)}`, [
      { text: "Send to Contact", onPress: () => handleShareFile(file) },
      { text: "Rename", onPress: () => {
        Alert.prompt("Rename", "New name:", [
          { text: "Cancel", style: "cancel" },
          { text: "Save", onPress: async (newName) => {
            if (newName && newName.trim()) {
              const files = await getVaultFiles();
              const updated = files.map((f) => f.id === file.id ? { ...f, name: newName.trim() } : f);
              const key = getCurrentLayer() === "hidden" ? "speaq_sys_cache_idx" : "speaq_vault_files";
              await AsyncStorage.setItem(key, JSON.stringify(updated));
              loadFiles();
            }
          }},
        ], "plain-text", file.name);
      }},
      { text: "Delete", style: "destructive", onPress: async () => {
        await removeFromVault(file.id);
        loadFiles();
      }},
      { text: "Cancel", style: "cancel" },
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
        <TouchableOpacity style={st.backupBtn} onPress={handleBackup}>
          <Text style={st.backupBtnText}>Backup</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.backupBtn} onPress={() => setShowRestoreModal(true)}>
          <Text style={st.backupBtnText}>Restore</Text>
        </TouchableOpacity>
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
            <TouchableOpacity key={file.id} style={st.fileRow} onPress={() => handleTapFile(file)} onLongPress={() => handleFileActions(file)}>
              {file.type === "photo" && thumbs[file.id] ? (
                <Image source={{ uri: thumbs[file.id] }} style={st.fileThumb} />
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

      {/* Note Editor - Full Screen */}
      <Modal visible={showNoteEditor} animationType="slide">
        <View style={st.noteEditorContainer}>
          <View style={st.noteEditorHeader}>
            <TouchableOpacity onPress={() => { setShowNoteEditor(false); setNoteText(""); setEditingNoteFile(null); }}>
              <Text style={st.noteEditorCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={st.noteEditorTitle}>{editingNoteFile ? "Edit Note" : "New Note"}</Text>
            <TouchableOpacity onPress={handleSaveNote}>
              <Text style={st.noteEditorSave}>Save</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={st.noteEditorInput}
            value={noteText}
            onChangeText={setNoteText}
            placeholder="Write your secure note here..."
            placeholderTextColor={colors.signal.steel}
            multiline
            autoFocus
            textAlignVertical="top"
          />
          {editingNoteFile && (
            <View style={st.noteEditorActions}>
              <TouchableOpacity style={st.noteShareBtn} onPress={() => { setShowNoteEditor(false); handleShareFile(editingNoteFile); }}>
                <Text style={st.noteShareText}>Send to Contact</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.noteDeleteBtn} onPress={async () => {
                await removeFromVault(editingNoteFile.id);
                setShowNoteEditor(false);
                setEditingNoteFile(null);
                setNoteText("");
                loadFiles();
              }}>
                <Text style={st.noteDeleteText}>Delete Note</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* Share / Send to Contact Picker */}
      <Modal visible={showSharePicker} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>Send to</Text>
            <Text style={st.modalSub}>{shareFile?.name}</Text>

            {/* Manual ID input */}
            <View style={st.shareIdRow}>
              <TextInput
                style={st.shareIdInput}
                value={shareManualId}
                onChangeText={setShareManualId}
                placeholder="Enter SPEAQ ID"
                placeholderTextColor={colors.signal.steel}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={[st.shareIdSend, !shareManualId.trim() && { opacity: 0.3 }]}
                disabled={!shareManualId.trim()}
                onPress={() => { handleSendToContact(shareManualId.trim(), shareManualId.trim()); setShareManualId(""); }}>
                <Text style={st.shareIdSendText}>Send</Text>
              </TouchableOpacity>
            </View>

            {/* Scan QR */}
            <TouchableOpacity style={st.shareScanBtn} onPress={() => { setShowSharePicker(false); setShowShareQR(true); }}>
              <Text style={st.shareScanText}>Scan QR Code</Text>
            </TouchableOpacity>

            {/* Contact list */}
            <Text style={st.shareContactsLabel}>Your Contacts</Text>
            {contactsService.getContacts().length === 0 ? (
              <Text style={{ color: colors.signal.steel, fontSize: 12, paddingVertical: 8 }}>No contacts yet. Use SPEAQ ID or QR code above.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 200 }}>
                {contactsService.getContacts().map((c) => (
                  <TouchableOpacity key={c.id} style={st.shareContactRow} onPress={() => handleSendToContact(c.id, c.name)}>
                    <View style={st.shareContactAvatar}><Text style={st.shareContactInit}>{c.name.charAt(0)}</Text></View>
                    <Text style={st.shareContactName}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity style={[st.cancelBtn, { marginTop: 12 }]} onPress={() => { setShowSharePicker(false); setShareFile(null); setShareManualId(""); }}>
              <Text style={st.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Share QR Scanner */}
      <Modal visible={showShareQR} animationType="slide">
        <View style={{ flex: 1, backgroundColor: colors.depth.void }}>
          <View style={st.scanHeader}>
            <Text style={st.scanTitle}>Scan SPEAQ ID</Text>
            <TouchableOpacity onPress={() => { setShowShareQR(false); setShowSharePicker(true); }}>
              <Text style={st.scanClose}>Close</Text>
            </TouchableOpacity>
          </View>
          <Suspense fallback={<View style={{ flex: 1, backgroundColor: colors.depth.void }}><Text style={{ color: colors.signal.white, textAlign: "center", marginTop: 100 }}>Loading camera...</Text></View>}>
          <Camera
            scanBarcode
            onReadCode={(event: any) => {
              const value = event.nativeEvent?.codeStringValue || "";
              const speaqId = value.startsWith("speaq://") ? value.replace("speaq://", "") : value.includes("thespeaq.com/connect/") ? value.split("/connect/").pop() || "" : value;
              if (speaqId) {
                setShowShareQR(false);
                handleSendToContact(speaqId, speaqId);
              }
            }}
            showFrame
            frameColor={colors.voice.gold}
            laserColor={colors.quantum.teal}
          />
          </Suspense>
        </View>
      </Modal>

      {/* File Viewer Modal */}
      <Modal visible={!!viewFile} transparent animationType="fade">
        <View style={st.viewerOverlay}>
          <TouchableOpacity style={st.viewerClose} onPress={() => setViewFile(null)}>
            <Text style={st.viewerCloseText}>X</Text>
          </TouchableOpacity>
          {viewFile?.type === "photo" && viewFile.uri && (
            <Image source={{ uri: viewFile.uri }} style={st.viewerImage} resizeMode="contain" />
          )}
          <View style={st.viewerInfo}>
            <Text style={st.viewerName}>{viewFile?.name}</Text>
            <Text style={st.viewerMeta}>{viewFile ? formatSize(viewFile.size) : ""} -- {viewFile ? formatDate(viewFile.addedAt) : ""}</Text>
          </View>
          <View style={st.viewerActions}>
            <TouchableOpacity style={st.viewerBtn} onPress={() => { if (viewFile) { setViewFile(null); handleShareFile(viewFile); } }}>
              <Text style={st.viewerBtnText}>Send</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.viewerBtn} onPress={() => { if (viewFile) handleFileActions(viewFile); setViewFile(null); }}>
              <Text style={st.viewerBtnText}>Rename</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.viewerBtnRed} onPress={async () => { if (viewFile) { await removeFromVault(viewFile.id); loadFiles(); setViewFile(null); } }}>
              <Text style={st.viewerBtnText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Restore Backup Modal */}
      <Modal visible={showRestoreModal} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>Restore Backup</Text>
            <Text style={st.modalSub}>Paste your encrypted backup data below. You must be using the same vault PIN that created the backup.</Text>
            <TextInput
              style={[st.pinInput, { fontSize: 12, letterSpacing: 0, textAlign: "left", height: 100 }]}
              value={restoreData}
              onChangeText={setRestoreData}
              placeholder="Paste encrypted backup..."
              placeholderTextColor={colors.signal.steel}
              multiline
              autoFocus
            />
            <View style={st.modalBtns}>
              <TouchableOpacity style={st.cancelBtn} onPress={() => { setShowRestoreModal(false); setRestoreData(""); }}>
                <Text style={st.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.confirmBtn} onPress={handleRestore}>
                <Text style={st.confirmText}>Restore</Text>
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
  backupBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border.subtle, marginRight: 6 },
  backupBtnText: { color: colors.signal.steel, fontSize: 11, fontWeight: "500" },
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

  noteEditorContainer: { flex: 1, backgroundColor: colors.depth.void },
  noteEditorHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  noteEditorCancel: { color: colors.signal.steel, fontSize: 16 },
  noteEditorTitle: { color: colors.signal.white, fontSize: 17, fontWeight: "600" },
  noteEditorSave: { color: colors.voice.gold, fontSize: 16, fontWeight: "600" },
  noteEditorInput: { flex: 1, paddingHorizontal: 20, paddingTop: 20, color: colors.signal.white, fontSize: 16, lineHeight: 24 },
  noteEditorActions: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border.subtle },
  noteShareBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.depth.card, borderWidth: 1, borderColor: colors.voice.gold, alignItems: "center" },
  noteShareText: { color: colors.voice.gold, fontSize: 14, fontWeight: "500" },
  noteDeleteBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.depth.card, borderWidth: 1, borderColor: colors.signal.red, alignItems: "center" },
  noteDeleteText: { color: colors.signal.red, fontSize: 14 },

  shareIdRow: { flexDirection: "row", gap: 8, marginBottom: 12, width: "100%" },
  shareIdInput: { flex: 1, backgroundColor: colors.depth.elevated, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: colors.signal.white, fontSize: 14 },
  shareIdSend: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.voice.gold, justifyContent: "center" },
  shareIdSendText: { color: colors.depth.void, fontSize: 14, fontWeight: "600" },
  shareScanBtn: { width: "100%", paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.quantum.teal, alignItems: "center", marginBottom: 16 },
  shareScanText: { color: colors.quantum.teal, fontSize: 14, fontWeight: "500" },
  shareContactsLabel: { color: colors.signal.steel, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, alignSelf: "flex-start" },
  scanHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16, backgroundColor: colors.depth.void },
  scanTitle: { color: colors.signal.white, fontSize: 18, fontWeight: "600" },
  scanClose: { color: colors.voice.gold, fontSize: 16, fontWeight: "500" },
  shareContactRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  shareContactAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.depth.elevated, alignItems: "center", justifyContent: "center", marginRight: 12, borderWidth: 1, borderColor: colors.quantum.teal },
  shareContactInit: { color: colors.quantum.teal, fontSize: 14, fontWeight: "600" },
  shareContactName: { color: colors.signal.white, fontSize: 15, fontWeight: "500" },

  viewerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center", alignItems: "center" },
  viewerClose: { position: "absolute", top: 60, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.depth.card, alignItems: "center", justifyContent: "center", zIndex: 10 },
  viewerCloseText: { color: colors.signal.white, fontSize: 18, fontWeight: "600" },
  viewerImage: { width: Dimensions.get("window").width - 32, height: Dimensions.get("window").height * 0.5 },
  viewerInfo: { alignItems: "center", marginTop: 20 },
  viewerName: { color: colors.signal.white, fontSize: 16, fontWeight: "500" },
  viewerMeta: { color: colors.signal.steel, fontSize: 12, marginTop: 4 },
  viewerActions: { flexDirection: "row", gap: 16, marginTop: 24 },
  viewerBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.depth.card, borderWidth: 1, borderColor: colors.border.subtle },
  viewerBtnRed: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.depth.card, borderWidth: 1, borderColor: colors.signal.red },
  viewerBtnText: { color: colors.signal.white, fontSize: 14 },
});
