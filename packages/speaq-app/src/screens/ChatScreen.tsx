/**
 * SPEAQ - Chat Screen
 * Real messaging via relay server
 */

import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, Image,
} from "react-native";
import { launchImageLibrary } from "react-native-image-picker";
import DocumentPicker from "react-native-document-picker";
import { colors, spacing, radius } from "../theme/brand";
import { sendMessage, onMessage, getIdentity } from "../services/speaq";

interface Message {
  id: string;
  text: string;
  sent: boolean;
  timestamp: string;
  type: "text" | "image" | "file";
  fileName?: string;
  fileUri?: string;
}

interface Props {
  contactId: string;
  contactName: string;
  onBack: () => void;
  onCall: (video: boolean) => void;
}

export default function ChatScreen({ contactId, contactName, onBack, onCall }: Props) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const unsubscribe = onMessage((msg: any) => {
      if (msg.type === "RECEIVE" && msg.from === contactId) {
        try {
          const data = JSON.parse(atob(msg.blob));
          if (data.type === "message") {
            setMessages((prev) => [...prev, {
              id: Date.now().toString(),
              text: data.text,
              sent: false,
              timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
            }]);
          }
        } catch (e) {}
      }
    });
    return unsubscribe;
  }, [contactId]);

  function handleSend() {
    if (!message.trim()) return;
    const text = message.trim();

    setMessages((prev) => [...prev, {
      id: Date.now().toString(),
      text,
      sent: true,
      type: "text",
      timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
    }]);

    sendMessage(contactId, text);
    setMessage("");
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }

  function handleAttach() {
    Alert.alert("Share", "What would you like to share?", [
      { text: "Photo / Video", onPress: handlePickImage },
      { text: "Document / File", onPress: handlePickFile },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function handlePickImage() {
    try {
      const result = await launchImageLibrary({ mediaType: "mixed", selectionLimit: 1 });
      if (result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const name = asset.fileName || "photo";
        setMessages((prev) => [...prev, {
          id: Date.now().toString(),
          text: name,
          sent: true,
          type: "image",
          fileName: name,
          fileUri: asset.uri,
          timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
        }]);
        sendMessage(contactId, `[File: ${name}]`);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (e) {}
  }

  async function handlePickFile() {
    try {
      const result = await DocumentPicker.pick({ type: [DocumentPicker.types.allFiles] });
      if (result[0]) {
        const file = result[0];
        const name = file.name || "document";
        setMessages((prev) => [...prev, {
          id: Date.now().toString(),
          text: name,
          sent: true,
          type: "file",
          fileName: name,
          fileUri: file.uri,
          timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
        }]);
        sendMessage(contactId, `[File: ${name}]`);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (e) {
      if (!DocumentPicker.isCancel(e)) console.error(e);
    }
  }

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[st.bubble, item.sent ? st.sent : st.received]}>
      {item.type === "image" && item.fileUri ? (
        <Image source={{ uri: item.fileUri }} style={st.msgImage} resizeMode="cover" />
      ) : item.type === "file" ? (
        <View style={st.fileRow}>
          <View style={st.fileIcon}><Text style={st.fileIconText}>F</Text></View>
          <Text style={[st.fileName, item.sent ? st.sentText : st.receivedText]} numberOfLines={1}>{item.fileName || item.text}</Text>
        </View>
      ) : null}
      {item.type === "text" && (
        <Text style={[st.bubbleText, item.sent ? st.sentText : st.receivedText]}>{item.text}</Text>
      )}
      <Text style={[st.bubbleTime, item.sent ? st.sentTime : st.receivedTime]}>{item.timestamp}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView style={st.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
      <View style={st.header}>
        <TouchableOpacity onPress={onBack} style={st.backBtn}>
          <Text style={st.backText}>{"<"}</Text>
        </TouchableOpacity>
        <View style={st.headerAvatar}>
          <Text style={st.headerAvatarText}>{contactName.charAt(0)}</Text>
        </View>
        <View style={st.headerInfo}>
          <Text style={st.headerName}>{contactName}</Text>
          <Text style={st.headerStatus}>Quantum Secured</Text>
        </View>
        <TouchableOpacity style={st.callBtn} onPress={() => onCall(false)}>
          <Text style={st.callBtnText}>P</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.callBtn} onPress={() => onCall(true)}>
          <Text style={st.callBtnText}>V</Text>
        </TouchableOpacity>
      </View>

      <View style={st.encBanner}>
        <Text style={st.encText}>Kyber-768 + AES-256-GCM + Double Ratchet</Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        style={st.list}
        contentContainerStyle={st.listContent}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      <View style={st.inputRow}>
        <TouchableOpacity style={st.attachBtn} onPress={handleAttach}>
          <Text style={st.attachIcon}>+</Text>
        </TouchableOpacity>
        <TextInput
          style={st.input}
          value={message}
          onChangeText={setMessage}
          placeholder="SPEAQ Freely..."
          placeholderTextColor={colors.signal.steel}
          multiline
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[st.sendBtn, message.trim() ? st.sendActive : {}]}
          onPress={handleSend}
          disabled={!message.trim()}
        >
          <Text style={st.sendIcon}>{">"}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.depth.surface },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: colors.depth.void, borderBottomWidth: 1, borderBottomColor: colors.border.subtle,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginRight: 8 },
  backText: { color: colors.voice.gold, fontSize: 20, fontWeight: "600" },
  headerAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.depth.elevated,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.quantum.teal,
  },
  headerAvatarText: { color: colors.quantum.teal, fontSize: 14, fontWeight: "600" },
  headerInfo: { flex: 1, marginLeft: 12 },
  headerName: { color: colors.signal.white, fontSize: 16, fontWeight: "600" },
  headerStatus: { color: colors.quantum.teal, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginTop: 1 },
  encBanner: { backgroundColor: colors.depth.card, paddingVertical: 4, alignItems: "center" },
  encText: { color: colors.signal.steel, fontSize: 9, letterSpacing: 0.5 },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 8 },
  bubble: { maxWidth: "80%", padding: 12, borderRadius: 16 },
  sent: { alignSelf: "flex-end", backgroundColor: colors.voice.deep, borderBottomRightRadius: 4 },
  received: { alignSelf: "flex-start", backgroundColor: colors.depth.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border.subtle },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  sentText: { color: colors.voice.light },
  receivedText: { color: colors.signal.white },
  bubbleTime: { fontSize: 9, marginTop: 4, alignSelf: "flex-end" },
  sentTime: { color: colors.voice.warm },
  receivedTime: { color: colors.signal.steel },
  inputRow: {
    flexDirection: "row", alignItems: "flex-end", padding: 12, paddingBottom: 28,
    backgroundColor: colors.depth.void, borderTopWidth: 1, borderTopColor: colors.border.subtle, gap: 8,
  },
  input: {
    flex: 1, backgroundColor: colors.depth.card, borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 12, color: colors.signal.white,
    fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: colors.border.subtle,
  },
  callBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.depth.elevated, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  callBtnText: { color: colors.voice.gold, fontSize: 14, fontWeight: "600" },
  attachBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.depth.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border.subtle },
  attachIcon: { color: colors.voice.gold, fontSize: 22, fontWeight: "400" },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.depth.elevated, alignItems: "center", justifyContent: "center" },
  sendActive: { backgroundColor: colors.voice.gold },
  sendIcon: { color: colors.signal.white, fontSize: 18, fontWeight: "600" },
  msgImage: { width: 200, height: 150, borderRadius: 12, marginBottom: 4 },
  fileRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  fileIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.depth.elevated, alignItems: "center", justifyContent: "center", marginRight: 8, borderWidth: 1, borderColor: colors.border.subtle },
  fileIconText: { color: colors.voice.gold, fontSize: 14, fontWeight: "600" },
  fileName: { fontSize: 13, flex: 1 },
});
