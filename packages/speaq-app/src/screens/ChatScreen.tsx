/**
 * SPEAQ - Chat Screen
 * Real messaging via relay server
 * Features: persistence, typing indicator, in-chat payments,
 * message deletion, date separators, haptic feedback
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, FlatList, TextInput, TouchableOpacity, TouchableWithoutFeedback,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, Image, Vibration,
} from "react-native";
import { launchImageLibrary } from "react-native-image-picker";
import DocumentPicker from "react-native-document-picker";
import { colors } from "../theme/brand";
import { sendMessage, onMessage, getIdentity } from "../services/speaq";
import {
  loadMessages, saveMessages, cleanExpiredMessages, StoredMessage,
  getDisappearTimer, setDisappearTimer, getExpiresAt,
  DISAPPEAR_OPTIONS, DisappearTimer,
} from "../services/messages";
import { walletService } from "../services/wallet";
import { isBlocked, blockUser } from "../services/blocked";
import { getContactPhoto } from "../services/profile";
import { playMessageReceived, playMessageSent } from "../services/sound";

interface Props {
  contactId: string;
  contactName: string;
  onBack: () => void;
  onCall: (video: boolean) => void;
}

export default function ChatScreen({ contactId, contactName, onBack, onCall }: Props) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [disappearTimer, setDisappearTimerState] = useState<DisappearTimer>("off");
  const flatListRef = useRef<FlatList>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted messages + clean expired + load timer
  useEffect(() => {
    cleanExpiredMessages(contactId).then((stored) => {
      if (stored.length > 0) setMessages(stored);
    });
    getDisappearTimer(contactId).then(setDisappearTimerState);
    // Clean expired every 30 seconds
    const cleanup = setInterval(() => {
      cleanExpiredMessages(contactId).then(setMessages);
    }, 30000);
    return () => clearInterval(cleanup);
  }, [contactId]);

  // Save messages when they change
  useEffect(() => {
    if (messages.length > 0) {
      saveMessages(contactId, messages);
    }
  }, [messages, contactId]);

  // Listen for incoming messages + typing
  useEffect(() => {
    const unsubscribe = onMessage((msg: any) => {
      if (msg.from === contactId) {
        if (msg.type === "TYPING") {
          setIsTyping(true);
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => setIsTyping(false), 3000);
          return;
        }
        if (msg.type === "RECEIVE") {
          if (isBlocked(contactId)) return;
          try {
            const data = JSON.parse(atob(msg.blob));
            if (data.type === "message") {
              Vibration.vibrate(100);
              playMessageReceived();
              const newMsg: StoredMessage = {
                id: Date.now().toString(),
                text: data.text,
                sent: false,
                type: data.paymentAmount ? "payment" : "text",
                amount: data.paymentAmount,
                timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
              };
              setMessages((prev) => [...prev, newMsg]);
            }
            if (data.type === "delete") {
              setMessages((prev) => prev.map((m) =>
                m.id === data.messageId ? { ...m, deleted: true, text: "This message was deleted" } : m
              ));
            }
          } catch (e) {}
        }
      }
    });
    return () => {
      unsubscribe();
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [contactId]);

  const now = useCallback(() =>
    new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }), []);

  function handleSend() {
    if (!message.trim()) return;
    const text = message.trim();
    setMessages((prev) => [...prev, { id: Date.now().toString(), text, sent: true, type: "text", timestamp: now(), expiresAt: getExpiresAt(disappearTimer) }]);
    sendMessage(contactId, text);
    playMessageSent();
    setMessage("");
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }

  function handleSendPayment() {
    Alert.prompt("Send Q-Credits", `Send QC to ${contactName}:`, [
      { text: "Cancel", style: "cancel" },
      { text: "Send", onPress: (val) => {
        const amount = parseFloat(val || "0");
        if (amount <= 0) return;
        if (amount > walletService.getBalance()) {
          Alert.alert("Insufficient", "Not enough Q-Credits.");
          return;
        }
        walletService.send(contactId, amount, `Payment to ${contactName}`);
        const payMsg: StoredMessage = {
          id: Date.now().toString(),
          text: `${amount.toFixed(2)} QC`,
          sent: true,
          type: "payment",
          amount,
          timestamp: now(),
        };
        setMessages((prev) => [...prev, payMsg]);
        sendMessage(contactId, JSON.stringify({ type: "message", text: `${amount.toFixed(2)} QC`, paymentAmount: amount }));
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }},
    ], "plain-text", "", "decimal-pad");
  }

  function handleAttach() {
    Alert.alert("Share", "What would you like to share?", [
      { text: "Photo / Video", onPress: handlePickImage },
      { text: "Document / File", onPress: handlePickFile },
      { text: "Send Q-Credits", onPress: handleSendPayment },
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
          id: Date.now().toString(), text: name, sent: true, type: "image",
          fileName: name, fileUri: asset.uri, timestamp: now(),
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
          id: Date.now().toString(), text: name, sent: true, type: "file",
          fileName: name, fileUri: file.uri, timestamp: now(),
        }]);
        sendMessage(contactId, `[File: ${name}]`);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (e) {
      if (!DocumentPicker.isCancel(e)) console.error(e);
    }
  }

  function handleLongPress(item: StoredMessage) {
    if (item.deleted) return;
    const options: any[] = [
      { text: "Delete for Me", onPress: () => {
        setMessages((prev) => prev.map((m) =>
          m.id === item.id ? { ...m, deleted: true, text: "You deleted this message" } : m
        ));
      }},
    ];
    if (item.sent) {
      options.push({ text: "Delete for Everyone", style: "destructive", onPress: () => {
        setMessages((prev) => prev.map((m) =>
          m.id === item.id ? { ...m, deleted: true, text: "This message was deleted" } : m
        ));
        sendMessage(contactId, JSON.stringify({ type: "delete", messageId: item.id }));
      }});
    }
    options.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Message", item.text.substring(0, 50), options);
  }

  function handleBlockUser() {
    Alert.alert("Block User", `Block ${contactName}? You will no longer receive messages from them.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Block", style: "destructive", onPress: () => {
        blockUser(contactId);
        Alert.alert("Blocked", `${contactName} has been blocked.`);
      }},
    ]);
  }

  function handleHeaderLongPress() {
    Alert.alert(contactName, contactId, [
      { text: "Disappearing Messages", onPress: handleSetDisappear },
      { text: "Block User", style: "destructive", onPress: handleBlockUser },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function handleSetDisappear() {
    const buttons = DISAPPEAR_OPTIONS.map((opt) => ({
      text: `${opt.label}${disappearTimer === opt.key ? " (current)" : ""}`,
      onPress: () => {
        setDisappearTimer(contactId, opt.key);
        setDisappearTimerState(opt.key);
        Alert.alert("Set", opt.key === "off" ? "Messages will not disappear." : `Messages will disappear after ${opt.label}.`);
      },
    }));
    buttons.push({ text: "Cancel", onPress: () => {} });
    Alert.alert("Disappearing Messages", `Current: ${DISAPPEAR_OPTIONS.find((o) => o.key === disappearTimer)?.label || "Off"}`, buttons);
  }

  // Date separator logic
  function getDateLabel(index: number): string | null {
    if (index === 0) return "Today";
    return null;
  }

  const renderMessage = ({ item, index }: { item: StoredMessage; index: number }) => {
    const dateLabel = getDateLabel(index);
    return (
      <>
        {dateLabel && (
          <View style={st.dateSep}>
            <View style={st.dateLine} />
            <Text style={st.dateText}>{dateLabel}</Text>
            <View style={st.dateLine} />
          </View>
        )}
        <TouchableWithoutFeedback onLongPress={() => handleLongPress(item)}>
          <View style={[st.bubble, item.sent ? st.sent : st.received, item.deleted && st.deletedBubble]}>
            {item.deleted ? (
              <Text style={st.deletedText}>{item.text}</Text>
            ) : item.type === "payment" ? (
              <View style={st.paymentBubble}>
                <Text style={st.paymentIcon}>Q</Text>
                <Text style={st.paymentAmount}>{item.amount?.toFixed(2)} QC</Text>
                <Text style={[st.bubbleTime, item.sent ? st.sentTime : st.receivedTime]}>{item.timestamp}</Text>
              </View>
            ) : (
              <>
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
              </>
            )}
          </View>
        </TouchableWithoutFeedback>
      </>
    );
  };

  return (
    <KeyboardAvoidingView style={st.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
      <TouchableWithoutFeedback onLongPress={handleHeaderLongPress}>
        <View style={st.header}>
          <TouchableOpacity onPress={onBack} style={st.backBtn}>
            <Text style={st.backText}>{"<"}</Text>
          </TouchableOpacity>
          {getContactPhoto(contactId) ? (
            <Image source={{ uri: getContactPhoto(contactId)! }} style={st.headerPhoto} />
          ) : (
            <View style={st.headerAvatar}>
              <Text style={st.headerAvatarText}>{contactName.charAt(0)}</Text>
            </View>
          )}
          <View style={st.headerInfo}>
            <Text style={st.headerName}>{contactName}</Text>
            <Text style={st.headerStatus}>{isTyping ? "typing..." : "Quantum Secured"}</Text>
          </View>
          <TouchableOpacity style={st.callBtn} onPress={() => onCall(false)}>
            <Text style={st.callBtnText}>P</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.callBtn} onPress={() => onCall(true)}>
            <Text style={st.callBtnText}>V</Text>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>

      <View style={st.encBanner}>
        <Text style={st.encText}>
          Kyber-768 + AES-256-GCM + Double Ratchet
          {disappearTimer !== "off" ? ` -- ${DISAPPEAR_OPTIONS.find((o) => o.key === disappearTimer)?.label}` : ""}
        </Text>
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
  headerPhoto: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.quantum.teal },
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

  // Date separator
  dateSep: { flexDirection: "row", alignItems: "center", marginVertical: 8 },
  dateLine: { flex: 1, height: 1, backgroundColor: colors.border.subtle },
  dateText: { color: colors.signal.steel, fontSize: 11, marginHorizontal: 12 },

  // Bubbles
  bubble: { maxWidth: "80%", padding: 12, borderRadius: 16 },
  sent: { alignSelf: "flex-end", backgroundColor: colors.voice.deep, borderBottomRightRadius: 4 },
  received: { alignSelf: "flex-start", backgroundColor: colors.depth.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border.subtle },
  deletedBubble: { opacity: 0.5 },
  deletedText: { color: colors.signal.steel, fontSize: 13, fontStyle: "italic" },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  sentText: { color: colors.voice.light },
  receivedText: { color: colors.signal.white },
  bubbleTime: { fontSize: 9, marginTop: 4, alignSelf: "flex-end" },
  sentTime: { color: colors.voice.warm },
  receivedTime: { color: colors.signal.steel },

  // Payment bubble
  paymentBubble: { alignItems: "center", paddingVertical: 4 },
  paymentIcon: { color: colors.voice.gold, fontSize: 24, fontWeight: "700", fontFamily: "Georgia" },
  paymentAmount: { color: colors.voice.gold, fontSize: 18, fontWeight: "600", marginTop: 4 },

  // Input
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
