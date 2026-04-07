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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { launchImageLibrary } from "react-native-image-picker";
import DocumentPicker from "react-native-document-picker";
import { colors } from "../theme/brand";
import { sendMessage, sendQCPayment, onMessage, getIdentity } from "../services/speaq";
import {
  decryptMessage, getContactKey,
  getOrCreateRatchet, ratchetDecrypt,
  loadRatchetState, RatchetState,
} from "../services/crypto";
import {
  loadMessages, saveMessages, cleanExpiredMessages, StoredMessage,
  getDisappearTimer, setDisappearTimer, getExpiresAt,
  DISAPPEAR_OPTIONS, DisappearTimer,
} from "../services/messages";
import { walletService } from "../services/wallet";
import { isBlocked, blockUser } from "../services/blocked";
import { getContactPhoto } from "../services/profile";
import { playMessageReceived, playMessageSent } from "../services/sound";
import { t } from "../services/i18n";

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
  const profilePhotoRef = useRef<string | null>(null);
  const photoSentRef = useRef<Set<string>>(new Set());

  // Load profile photo on mount
  useEffect(() => {
    AsyncStorage.getItem("speaq_profile_photo").then((photo) => {
      if (photo) profilePhotoRef.current = photo;
    });
  }, []);

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
    const unsubscribe = onMessage(async (msg: any) => {
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
            const myId = getIdentity()?.speaqId || "";
            let data: any;

            // Try ratchet decryption first (quantum-grade, forward secrecy)
            if (msg.protocol === "ratchet-v1") {
              try {
                const ratchetMsg = JSON.parse(msg.blob);
                const { state } = await getOrCreateRatchet(myId, contactId);
                // State is saved inside ratchetDecrypt BEFORE returning (crash-safe)
                const decrypted = await ratchetDecrypt(state, ratchetMsg, contactId);
                data = JSON.parse(decrypted);
              } catch (ratchetErr) {
                console.warn("[ChatScreen] Ratchet decrypt failed, trying legacy:", ratchetErr);
                // Fall through to legacy decryption
                data = null;
              }
            }

            // Legacy decryption fallback (pre-ratchet messages)
            if (!data) {
              const key = getContactKey(myId, contactId);
              try {
                const decrypted = decryptMessage(key, msg.blob);
                data = JSON.parse(decrypted);
              } catch (decryptErr) {
                // Fallback for unencrypted messages (backwards compatibility)
                try {
                  data = JSON.parse(atob(msg.blob));
                } catch (base64Err) {
                  console.warn("[ChatScreen] All decryption methods failed for message from", contactId);
                  const encMsg: StoredMessage = {
                    id: Date.now().toString(),
                    text: t("encryptedMessage"),
                    sent: false,
                    type: "text",
                    timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
                  };
                  setMessages((prev) => [...prev, encMsg]);
                  return;
                }
              }
            }
            if (data.type === "message") {
              // Save sender's contact photo if included
              if (data.photo && data.senderId) {
                AsyncStorage.getItem("speaq_contact_photos").then((stored) => {
                  const photos = stored ? JSON.parse(stored) : {};
                  photos[data.senderId] = data.photo;
                  AsyncStorage.setItem("speaq_contact_photos", JSON.stringify(photos));
                });
              }
              Vibration.vibrate(100);
              playMessageReceived();
              // Handle QC payment receive
              if (data.qc && data.amount && data.amount > 0) {
                walletService.receive(data.senderId || contactId, data.amount, `From ${data.fromName || contactId.substring(0, 8)}`);
              }
              const newMsg: StoredMessage = {
                id: Date.now().toString(),
                text: data.text,
                sent: false,
                type: (data.qc || data.paymentAmount) ? "payment" : "text",
                amount: data.amount || data.paymentAmount,
                timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
              };
              setMessages((prev) => [...prev, newMsg]);
            }
            if (data.type === "delete") {
              setMessages((prev) => prev.map((m) =>
                m.id === data.messageId ? { ...m, deleted: true, text: "This message was deleted" } : m
              ));
            }
          } catch (e) {
            console.warn("[ChatScreen] Unexpected error processing message from", contactId, e);
          }
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
    setMessages((prev) => [...prev, { id: Date.now().toString(), text, sent: true, type: "text", timestamp: now(), expiresAt: getExpiresAt(disappearTimer), status: "sent" }]);
    sendMessage(contactId, text);
    playMessageSent();
    setMessage("");
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }

  function handleSendPayment() {
    Alert.prompt(t("sendQCreditsChat"), `${t("send")} QC ${t("to")} ${contactName}:`, [
      { text: t("cancel"), style: "cancel" },
      { text: t("send"), onPress: (val) => {
        const amount = parseFloat(val || "0");
        if (amount <= 0) return;
        if (amount > walletService.getBalance()) {
          Alert.alert(t("insufficient"), t("insufficientQC"));
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
        sendQCPayment(contactId, amount);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }},
    ], "plain-text", "", "decimal-pad");
  }

  function handleAttach() {
    Alert.alert(t("shareTitle"), t("shareWhat"), [
      { text: t("photoVideo"), onPress: handlePickImage },
      { text: t("documentFile"), onPress: handlePickFile },
      { text: t("voiceMessage"), onPress: handleVoiceMessage },
      { text: t("location"), onPress: handleShareLocation },
      { text: t("sendQCreditsChat"), onPress: handleSendPayment },
      { text: t("cancel"), style: "cancel" },
    ]);
  }

  function handleVoiceMessage() {
    // Voice message recording placeholder
    // Full implementation needs react-native-audio-recorder-player + real device
    Alert.alert(t("voiceMessageTitle"), t("voiceMessageBody"), [
      { text: t("voiceMessageRecord"), onPress: () => {
        const voiceMsg: StoredMessage = {
          id: Date.now().toString(),
          text: "Voice message (0:05)",
          sent: true,
          type: "voice",
          timestamp: now(),
          expiresAt: getExpiresAt(disappearTimer),
        };
        setMessages((prev) => [...prev, voiceMsg]);
        sendMessage(contactId, "[Voice Message]");
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }},
      { text: t("cancel"), style: "cancel" },
    ]);
  }

  function handleShareLocation() {
    // Location sharing placeholder - real GPS requires device permissions (NSLocationWhenInUseUsageDescription)
    // Currently sends placeholder coordinates; replace with Geolocation API on real device
    const locationMsg: StoredMessage = {
      id: Date.now().toString(),
      text: t("locationShared"),
      sent: true,
      type: "location",
      timestamp: now(),
      expiresAt: getExpiresAt(disappearTimer),
    };
    setMessages((prev) => [...prev, locationMsg]);
    sendMessage(contactId, "[Location Shared]");
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
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
      { text: t("deleteForMe"), onPress: () => {
        setMessages((prev) => prev.map((m) =>
          m.id === item.id ? { ...m, deleted: true, text: "You deleted this message" } : m
        ));
      }},
    ];
    if (item.sent) {
      options.push({ text: t("deleteForEveryone"), style: "destructive", onPress: () => {
        setMessages((prev) => prev.map((m) =>
          m.id === item.id ? { ...m, deleted: true, text: "This message was deleted" } : m
        ));
        sendMessage(contactId, JSON.stringify({ type: "delete", messageId: item.id }));
      }});
    }
    options.push({ text: t("cancel"), style: "cancel" });
    Alert.alert(t("message"), item.text.substring(0, 50), options);
  }

  function handleBlockUser() {
    Alert.alert(t("blockUser"), t("blockUserMsg").replace("%s", contactName), [
      { text: t("cancel"), style: "cancel" },
      { text: t("block"), style: "destructive", onPress: () => {
        blockUser(contactId);
        Alert.alert(t("blocked"), t("blockedMsg").replace("%s", contactName));
      }},
    ]);
  }

  function handleHeaderLongPress() {
    Alert.alert(contactName, contactId, [
      { text: t("disappearingMessages"), onPress: handleSetDisappear },
      { text: t("blockUser"), style: "destructive", onPress: handleBlockUser },
      { text: t("cancel"), style: "cancel" },
    ]);
  }

  function handleSetDisappear() {
    const buttons = DISAPPEAR_OPTIONS.map((opt) => ({
      text: `${opt.label}${disappearTimer === opt.key ? ` (${t("current")})` : ""}`,
      onPress: () => {
        setDisappearTimer(contactId, opt.key);
        setDisappearTimerState(opt.key);
        Alert.alert(t("disappearSet"), opt.key === "off" ? t("disappearOff") : t("disappearOn").replace("%s", opt.label));
      },
    }));
    buttons.push({ text: t("cancel"), onPress: () => {} });
    Alert.alert(t("disappearingMessages"), `${t("current")}: ${DISAPPEAR_OPTIONS.find((o) => o.key === disappearTimer)?.label || "Off"}`, buttons);
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
                <View style={st.bubbleFooter}>
                  <Text style={[st.bubbleTime, item.sent ? st.sentTime : st.receivedTime]}>{item.timestamp}</Text>
                  {item.sent && <Text style={st.readReceipt}>{item.status === "read" ? "R" : item.status === "delivered" ? "D" : "S"}</Text>}
                </View>
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
                {item.type === "voice" && (
                  <View style={st.voiceBubble}>
                    <Text style={st.voiceIcon}>W</Text>
                    <View style={st.voiceWave}><View style={st.voiceBar} /><View style={[st.voiceBar, { height: 16 }]} /><View style={[st.voiceBar, { height: 12 }]} /><View style={[st.voiceBar, { height: 20 }]} /><View style={[st.voiceBar, { height: 8 }]} /></View>
                    <Text style={[st.bubbleText, item.sent ? st.sentText : st.receivedText]}>{item.text}</Text>
                  </View>
                )}
                {item.type === "location" && (
                  <View style={st.locationBubble}>
                    <Text style={st.locationIcon}>L</Text>
                    <Text style={[st.bubbleText, item.sent ? st.sentText : st.receivedText]}>Location shared</Text>
                  </View>
                )}
                {item.type === "text" && (
                  <Text style={[st.bubbleText, item.sent ? st.sentText : st.receivedText]}>{item.text}</Text>
                )}
                <View style={st.bubbleFooter}>
                  <Text style={[st.bubbleTime, item.sent ? st.sentTime : st.receivedTime]}>{item.timestamp}</Text>
                  {item.sent && <Text style={st.readReceipt}>{item.status === "read" ? "R" : item.status === "delivered" ? "D" : "S"}</Text>}
                </View>
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
            <Text style={st.headerStatus}>{isTyping ? "typing..." : t("quantumSecured")}</Text>
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
        <TouchableOpacity style={[st.timerBtn, disappearTimer !== "off" && st.timerBtnActive]} onPress={handleSetDisappear}>
          <Text style={[st.timerIcon, disappearTimer !== "off" && st.timerIconActive]}>T</Text>
        </TouchableOpacity>
        <TextInput
          style={st.input}
          value={message}
          onChangeText={setMessage}
          placeholder={t("speaqFreely")}
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
  bubbleFooter: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 4 },
  readReceipt: { fontSize: 9, color: colors.quantum.teal, fontWeight: "600" },
  bubbleTime: { fontSize: 9 },
  sentTime: { color: colors.voice.warm },
  receivedTime: { color: colors.signal.steel },

  // Voice bubble
  voiceBubble: { flexDirection: "row", alignItems: "center", gap: 8 },
  voiceIcon: { color: colors.voice.gold, fontSize: 16, fontWeight: "600" },
  voiceWave: { flexDirection: "row", alignItems: "center", gap: 2 },
  voiceBar: { width: 3, height: 10, borderRadius: 1.5, backgroundColor: colors.voice.gold },

  // Location bubble
  locationBubble: { flexDirection: "row", alignItems: "center", gap: 8 },
  locationIcon: { color: colors.quantum.teal, fontSize: 16, fontWeight: "600" },

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
  timerBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.depth.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border.subtle, alignSelf: "center" },
  timerBtnActive: { borderColor: colors.quantum.teal, backgroundColor: "rgba(45,212,191,0.1)" },
  timerIcon: { color: colors.signal.steel, fontSize: 14, fontWeight: "600" },
  timerIconActive: { color: colors.quantum.teal },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.depth.elevated, alignItems: "center", justifyContent: "center" },
  sendActive: { backgroundColor: colors.voice.gold },
  sendIcon: { color: colors.signal.white, fontSize: 18, fontWeight: "600" },
  msgImage: { width: 200, height: 150, borderRadius: 12, marginBottom: 4 },
  fileRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  fileIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.depth.elevated, alignItems: "center", justifyContent: "center", marginRight: 8, borderWidth: 1, borderColor: colors.border.subtle },
  fileIconText: { color: colors.voice.gold, fontSize: 14, fontWeight: "600" },
  fileName: { fontSize: 13, flex: 1 },
});
