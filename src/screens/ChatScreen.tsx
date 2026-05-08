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
  Modal, ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { launchImageLibrary } from "react-native-image-picker";
import DocumentPicker from "react-native-document-picker";
import RNFS from "react-native-fs";
import { useThemedStyles, useTheme, ThemeColors } from "../theme/ThemeContext";
import { sendMessage, sendQCPayment, onMessage, getIdentity, sendBlock } from "../services/speaq";
import {
  decryptMessage, getContactKey,
  getOrCreateRatchet, ratchetDecrypt,
  loadRatchetState, RatchetState,
  computeSafetyNumber,
} from "../services/crypto";
import {
  loadMessages, saveMessages, cleanExpiredMessages, StoredMessage,
  getDisappearTimer, setDisappearTimer, getExpiresAt,
  DISAPPEAR_OPTIONS, DisappearTimer,
} from "../services/messages";
import { walletService } from "../services/wallet";
import { isBlocked, blockUser } from "../services/blocked";
import { postAbuseReport, type AbuseReason } from "../services/abuse-report";
import { containsObjectionableContent, type SafetyLang } from "../services/keyword-filter";
import { getContactPhoto } from "../services/profile";
import { playMessageReceived, playMessageSent } from "../services/sound";
import { t, getLanguage } from "../services/i18n";

interface Props {
  contactId: string;
  contactName: string;
  onBack: () => void;
  onCall: (video: boolean) => void;
}

export default function ChatScreen({ contactId, contactName, onBack, onCall }: Props) {
  const { colors: c } = useTheme();
  const st = useThemedStyles(makeStyles);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [disappearTimer, setDisappearTimerState] = useState<DisappearTimer>("off");

  // Apple Guideline 1.2 - Report message dialog state
  const [reportDialog, setReportDialog] = useState<{ messageId: string; messageText: string } | null>(null);
  const [reportReason, setReportReason] = useState<AbuseReason>("harassment");
  const [reportComment, setReportComment] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [revealedFlagged, setRevealedFlagged] = useState<Record<string, boolean>>({});
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

            // Sealed-sender pre-decrypt: speaq.ts:handleSealedReceive already ran
            // ratchetDecrypt and attached the plaintext on msg.plaintext to avoid
            // double-advancing the ratchet counter. Use it directly when present.
            if (typeof msg.plaintext === "string") {
              try {
                data = JSON.parse(msg.plaintext);
              } catch {
                data = null;
              }
            }

            // Try ratchet decryption first (quantum-grade, forward secrecy).
            // PWA peers serialise ratchet envelopes with short field names
            // ({mn, ct}); native uses {messageNumber, ciphertext}. Normalise so
            // either shape decrypts. Pairs with PWA fix from speaq-web@12b1496.
            // Also try ratchet-decrypt when protocol marker is missing -- some
            // older PWA clients omit it; we fall back to legacy only if the
            // blob is not a parseable ratchet envelope.
            if (!data && msg.blob) {
              try {
                const parsed = JSON.parse(msg.blob);
                const messageNumber = parsed.messageNumber ?? parsed.mn;
                const ciphertext = parsed.ciphertext ?? parsed.ct;
                if (typeof messageNumber === "number" && typeof ciphertext === "string") {
                  const ratchetMsg = { messageNumber, ciphertext };
                  const { state } = await getOrCreateRatchet(myId, contactId);
                  const decrypted = await ratchetDecrypt(state, ratchetMsg, contactId);
                  console.log("[SPEAQ-DBG] ratchet decrypt OK len=", decrypted.length, "preview=", decrypted.substring(0, 80));
                  try {
                    data = JSON.parse(decrypted);
                  } catch {
                    // PWA may send the message text as a plain string instead
                    // of a JSON envelope. Wrap it so the rest of the pipeline
                    // treats it as a normal text message.
                    console.log("[SPEAQ-DBG] decrypted is not JSON, treating as plain text");
                    data = { type: "message", text: decrypted };
                  }
                }
              } catch (ratchetErr) {
                console.warn("[ChatScreen] Ratchet decrypt failed, trying legacy:", ratchetErr);
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
            // F3: accept payloads where data.type === "message" OR data.qc is set.
            // Older PWA builds did not include type:"message" in QC-payloads;
            // accepting either form ensures cross-platform interop (defense in
            // depth alongside the PWA-side fixes 5bb73cd + 7aba06a that now
            // include type:"message"). See SPEAQ_F1-F5_Implementation_2026-05-08.md.
            if (data.type === "message" || data.qc) {
              // Save sender's contact photo if included (fallback to contactId)
              const photoSenderId = data.senderId || contactId;
              if (data.photo && photoSenderId) {
                AsyncStorage.getItem("speaq_contact_photos").then((stored) => {
                  const photos = stored ? JSON.parse(stored) : {};
                  photos[photoSenderId] = data.photo;
                  AsyncStorage.setItem("speaq_contact_photos", JSON.stringify(photos));
                });
              }
              Vibration.vibrate(100);
              playMessageReceived();
              // Wallet update for QC payments is now handled at app-level by
              // walletReceiveListener (see App.tsx). ChatScreen renders the
              // payment-bubble below but does NOT credit the wallet itself,
              // to avoid double-credit when both handlers fire.
              // Cross-platform attachment detection mirrors PWA conventions
              // at speaq-web/page.tsx:3083 (photo) and 3108 (file). The text
              // payload contains base64 data URL wrapped in [img]...[/img] or
              // [file:name]...[/file] markers. Extract into fileUri so the
              // existing image-bubble + file-row renderers can show them.
              let attachedImageDataUrl: string | undefined;
              let attachedFileName: string | undefined;
              if (typeof data.text === "string") {
                const imgMatch = data.text.match(/^\[img\]([\s\S]+)\[\/img\]$/);
                if (imgMatch) {
                  attachedImageDataUrl = imgMatch[1];
                } else {
                  const fileMatch = data.text.match(/^\[file:([^\]]+)\]([\s\S]+)\[\/file\]$/);
                  if (fileMatch) {
                    attachedFileName = fileMatch[1];
                    attachedImageDataUrl = fileMatch[2];
                  }
                }
              }
              const flagged = data.text && !attachedImageDataUrl
                ? containsObjectionableContent(data.text, getLanguage() as SafetyLang)
                : false;
              const messageType: StoredMessage["type"] =
                attachedImageDataUrl && !attachedFileName ? "image" :
                attachedFileName ? "file" :
                (data.qc || data.paymentAmount) ? "payment" : "text";
              const newMsg: StoredMessage = {
                id: Date.now().toString(),
                text: attachedFileName || (attachedImageDataUrl ? "[Photo]" : data.text),
                sent: false,
                type: messageType,
                amount: data.amount || data.paymentAmount,
                fileName: attachedFileName,
                fileUri: attachedImageDataUrl,
                timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
                flagged,
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
      // quality 0.5 + maxWidth/Height 1280 caps payload size. Mirrors PWA's
      // compressImage default (1280px / quality 0.75) reasonably closely.
      const result = await launchImageLibrary({
        mediaType: "mixed",
        selectionLimit: 1,
        quality: 0.5,
        maxWidth: 1280,
        maxHeight: 1280,
        includeBase64: false,
      });
      if (!result.assets || !result.assets[0]) return;
      const asset = result.assets[0];
      const name = asset.fileName || "photo";
      if (!asset.uri) return;
      // Cap 10MB raw to mirror PWA chat photo limit at speaq-web/page.tsx:3072.
      // Cross-platform interop requires the wire format to match: PWA packs
      // photos as text "[img]<dataUrl>[/img]", so we do the same and the
      // receiver-side parser (see ChatScreen receive at line ~175) extracts
      // the dataUrl into fileUri for the existing image-bubble renderer.
      const fileSize = asset.fileSize || 0;
      if (fileSize > 10 * 1024 * 1024) {
        Alert.alert(t("fileTooLarge") || "File too large", "Maximum 10 MB.");
        return;
      }
      const base64 = await RNFS.readFile(asset.uri, "base64");
      const mime = asset.type || "image/jpeg";
      const dataUrl = `data:${mime};base64,${base64}`;
      setMessages((prev) => [...prev, {
        id: Date.now().toString(), text: name, sent: true, type: "image",
        fileName: name, fileUri: dataUrl, timestamp: now(),
      }]);
      sendMessage(contactId, `[img]${dataUrl}[/img]`);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      console.error("[ChatScreen] handlePickImage failed:", e);
      Alert.alert("Photo error", "Could not send photo.");
    }
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
    } else {
      // Apple Guideline 1.2 - incoming messages get Report + Block options
      options.push({ text: t("safetyReportMessage"), onPress: () => {
        setReportReason("harassment");
        setReportComment("");
        setReportDialog({ messageId: item.id, messageText: item.text });
      }});
      options.push({ text: t("safetyBlockUser"), style: "destructive", onPress: () => {
        handleBlockUser(item.id, item.text);
      }});
    }
    options.push({ text: t("cancel"), style: "cancel" });
    Alert.alert(t("message"), item.text.substring(0, 50), options);
  }

  // Block: store locally, tell relay (BLOCK), and auto-file an abuse
  // report (Apple 24-hour SLA). messageId/messageText are passed from
  // the long-press handler so moderators see what triggered the block.
  async function handleBlockUser(triggerMsgId?: string, triggerMsgText?: string) {
    if (triggerMsgId && triggerMsgText) {
      // Direct block from a specific message - skip the confirm dialog
      // because the user already chose Block from the action sheet.
      await doBlock(triggerMsgId, triggerMsgText);
      return;
    }
    Alert.alert(t("blockUser"), t("blockUserMsg").replace("%s", contactName), [
      { text: t("cancel"), style: "cancel" },
      { text: t("block"), style: "destructive", onPress: () => doBlock() },
    ]);
  }

  async function doBlock(triggerMsgId?: string, triggerMsgText?: string) {
    await blockUser(contactId);
    sendBlock(contactId);
    const me = getIdentity();
    if (me) {
      await postAbuseReport({
        reporterSpeaqId: me.speaqId,
        reportedSpeaqId: contactId,
        reason: "harassment",
        source: "app-block",
        messageContent: triggerMsgText,
        messageId: triggerMsgId,
        language: "en",
      });
    }
    Alert.alert(t("blocked"), t("blockedMsg").replace("%s", contactName));
  }

  async function submitReportDialog() {
    if (!reportDialog || reportSubmitting) return;
    setReportSubmitting(true);
    const me = getIdentity();
    if (!me) {
      setReportSubmitting(false);
      return;
    }
    const ok = await postAbuseReport({
      reporterSpeaqId: me.speaqId,
      reportedSpeaqId: contactId,
      reason: reportReason,
      source: "app-report",
      comment: reportComment.trim() || undefined,
      messageContent: reportDialog.messageText,
      messageId: reportDialog.messageId,
      language: "en",
    });
    setReportSubmitting(false);
    setReportDialog(null);
    setReportComment("");
    Alert.alert(
      ok ? t("safetyReportSent") : t("safetyReportFailed"),
      ok ? t("safetyReportThanks") : t("safetyReportTryAgain"),
    );
  }

  function handleHeaderLongPress() {
    Alert.alert(contactName, contactId, [
      { text: "Safety number", onPress: handleShowSafetyNumber },
      { text: t("disappearingMessages"), onPress: handleSetDisappear },
      { text: t("blockUser"), style: "destructive", onPress: handleBlockUser },
      { text: t("cancel"), style: "cancel" },
    ]);
  }

  // Safety number: SHA-256 over (sortedIds + ":" + ratchet.rootKey) presented as
  // 8 groups of 4 hex chars. Both peers see the same number when their channel
  // is mutually authenticated. Verify in person or via voice to detect MITM.
  async function handleShowSafetyNumber() {
    const me = getIdentity();
    if (!me) return;
    const sn = await computeSafetyNumber(me.speaqId, contactId);
    if (!sn) {
      Alert.alert(
        "Safety number not yet available",
        "Send a message to establish the secure channel, then try again."
      );
      return;
    }
    Alert.alert(
      "Safety number",
      `${sn}\n\nCompare this number with your contact in person or via a separate voice call. If it matches on both ends the channel is mutually authenticated.`,
      [{ text: "OK", style: "default" }]
    );
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
          <View style={[st.bubble, item.sent ? st.sent : st.received, item.deleted && st.deletedBubble, !!item.flagged && !item.sent && !revealedFlagged[item.id] && st.flaggedBubble]}>
            {item.deleted ? (
              <Text style={st.deletedText}>{item.text}</Text>
            ) : !!item.flagged && !item.sent && !revealedFlagged[item.id] ? (
              <View style={{ paddingVertical: 4 }}>
                <Text style={st.flaggedNotice}>{t("safetyFlaggedNotice")}</Text>
                <TouchableOpacity onPress={() => setRevealedFlagged((prev) => ({ ...prev, [item.id]: true }))}>
                  <Text style={st.flaggedReveal}>{t("safetyReveal")}</Text>
                </TouchableOpacity>
                <View style={st.bubbleFooter}>
                  <Text style={[st.bubbleTime, st.receivedTime]}>{item.timestamp}</Text>
                </View>
              </View>
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
          AES-256-GCM + lattice key exchange (custom) + Double Ratchet
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
          placeholderTextColor={c.signal.steel}
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

      {/* Apple Guideline 1.2 - Report Message dialog */}
      <Modal
        visible={!!reportDialog}
        transparent
        animationType="fade"
        onRequestClose={() => !reportSubmitting && setReportDialog(null)}
      >
        <View style={st.reportOverlay}>
          <View style={st.reportCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={st.reportTitle}>{t("safetyReportTitle")}</Text>
              <Text style={st.reportSubtitle}>{t("safetyReportSubtitle")}</Text>

              <Text style={st.reportSectionLabel}>{t("safetyReportReason")}</Text>
              {(["spam", "harassment", "threat", "csam", "illegal", "impersonation", "other"] as AbuseReason[]).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[st.reportReasonRow, reportReason === r && st.reportReasonRowActive]}
                  onPress={() => setReportReason(r)}
                  activeOpacity={0.7}
                >
                  <View style={[st.reportRadio, reportReason === r && st.reportRadioActive]} />
                  <Text style={st.reportReasonText}>{t(`safetyReason_${r}`)}</Text>
                </TouchableOpacity>
              ))}

              <Text style={st.reportSectionLabel}>{t("safetyReportComment")}</Text>
              <TextInput
                value={reportComment}
                onChangeText={(v) => setReportComment(v.slice(0, 500))}
                placeholder={t("safetyReportCommentPlaceholder")}
                placeholderTextColor={c.signal.steel}
                multiline
                numberOfLines={3}
                style={st.reportComment}
              />
            </ScrollView>

            <View style={st.reportActions}>
              <TouchableOpacity
                style={[st.reportBtn, st.reportBtnSecondary]}
                onPress={() => !reportSubmitting && setReportDialog(null)}
                disabled={reportSubmitting}
              >
                <Text style={st.reportBtnSecondaryText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.reportBtn, st.reportBtnPrimary, reportSubmitting && { opacity: 0.6 }]}
                onPress={submitReportDialog}
                disabled={reportSubmitting}
              >
                <Text style={st.reportBtnPrimaryText}>
                  {reportSubmitting ? t("safetyReportSending") : t("safetyReportSubmit")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.depth.surface },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: c.depth.void, borderBottomWidth: 1, borderBottomColor: c.border.subtle,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginRight: 8 },
  backText: { color: c.voice.gold, fontSize: 20, fontWeight: "600" },
  headerPhoto: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: c.quantum.teal },
  headerAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: c.depth.elevated,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.quantum.teal,
  },
  headerAvatarText: { color: c.quantum.teal, fontSize: 14, fontWeight: "600" },
  headerInfo: { flex: 1, marginLeft: 12 },
  headerName: { color: c.signal.white, fontSize: 16, fontWeight: "600" },
  headerStatus: { color: c.quantum.teal, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginTop: 1 },
  encBanner: { backgroundColor: c.depth.card, paddingVertical: 4, alignItems: "center" },
  encText: { color: c.signal.steel, fontSize: 9, letterSpacing: 0.5 },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 8 },

  // Date separator
  dateSep: { flexDirection: "row", alignItems: "center", marginVertical: 8 },
  dateLine: { flex: 1, height: 1, backgroundColor: c.border.subtle },
  dateText: { color: c.signal.steel, fontSize: 11, marginHorizontal: 12 },

  // Bubbles
  bubble: { maxWidth: "80%", padding: 12, borderRadius: 16 },
  sent: { alignSelf: "flex-end", backgroundColor: c.voice.deep, borderBottomRightRadius: 4 },
  received: { alignSelf: "flex-start", backgroundColor: c.depth.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: c.border.subtle },
  deletedBubble: { opacity: 0.5 },
  deletedText: { color: c.signal.steel, fontSize: 13, fontStyle: "italic" },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  sentText: { color: c.voice.light },
  receivedText: { color: c.signal.white },
  bubbleFooter: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 4 },
  readReceipt: { fontSize: 9, color: c.quantum.teal, fontWeight: "600" },
  bubbleTime: { fontSize: 9 },
  sentTime: { color: c.voice.warm },
  receivedTime: { color: c.signal.steel },

  // Voice bubble
  voiceBubble: { flexDirection: "row", alignItems: "center", gap: 8 },
  voiceIcon: { color: c.voice.gold, fontSize: 16, fontWeight: "600" },
  voiceWave: { flexDirection: "row", alignItems: "center", gap: 2 },
  voiceBar: { width: 3, height: 10, borderRadius: 1.5, backgroundColor: c.voice.gold },

  // Location bubble
  locationBubble: { flexDirection: "row", alignItems: "center", gap: 8 },
  locationIcon: { color: c.quantum.teal, fontSize: 16, fontWeight: "600" },

  // Payment bubble
  paymentBubble: { alignItems: "center", paddingVertical: 4 },
  paymentIcon: { color: c.voice.gold, fontSize: 24, fontWeight: "700", fontFamily: "Georgia" },
  paymentAmount: { color: c.voice.gold, fontSize: 18, fontWeight: "600", marginTop: 4 },

  // Input
  inputRow: {
    flexDirection: "row", alignItems: "flex-end", padding: 12, paddingBottom: 28,
    backgroundColor: c.depth.void, borderTopWidth: 1, borderTopColor: c.border.subtle, gap: 8,
  },
  input: {
    flex: 1, backgroundColor: c.depth.card, borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 12, color: c.signal.white,
    fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: c.border.subtle,
  },
  callBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.depth.elevated, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  callBtnText: { color: c.voice.gold, fontSize: 14, fontWeight: "600" },
  attachBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.depth.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border.subtle },
  attachIcon: { color: c.voice.gold, fontSize: 22, fontWeight: "400" },
  timerBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.depth.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border.subtle, alignSelf: "center" },
  timerBtnActive: { borderColor: c.quantum.teal, backgroundColor: "rgba(45,212,191,0.1)" },
  timerIcon: { color: c.signal.steel, fontSize: 14, fontWeight: "600" },
  timerIconActive: { color: c.quantum.teal },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.depth.elevated, alignItems: "center", justifyContent: "center" },
  sendActive: { backgroundColor: c.voice.gold },
  sendIcon: { color: c.signal.white, fontSize: 18, fontWeight: "600" },
  msgImage: { width: 200, height: 150, borderRadius: 12, marginBottom: 4 },
  fileRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  fileIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: c.depth.elevated, alignItems: "center", justifyContent: "center", marginRight: 8, borderWidth: 1, borderColor: c.border.subtle },
  fileIconText: { color: c.voice.gold, fontSize: 14, fontWeight: "600" },
  fileName: { fontSize: 13, flex: 1 },

  // Apple Guideline 1.2 - flagged content blur + reveal
  flaggedBubble: { borderWidth: 1, borderColor: "rgba(226, 75, 74, 0.5)" },
  flaggedNotice: { color: c.signal.steel, fontSize: 12, lineHeight: 18, marginBottom: 8 },
  flaggedReveal: { color: c.voice.gold, fontSize: 13, fontWeight: "600", textDecorationLine: "underline" },

  // Apple Guideline 1.2 - Report message dialog
  reportOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
  reportCard: { width: "100%", maxWidth: 420, maxHeight: "85%", backgroundColor: c.depth.elevated, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: c.border.subtle },
  reportTitle: { color: c.signal.white, fontSize: 18, fontWeight: "700", marginBottom: 6 },
  reportSubtitle: { color: c.signal.steel, fontSize: 12, lineHeight: 18, marginBottom: 16 },
  reportSectionLabel: { color: c.signal.white, fontSize: 12, fontWeight: "600", marginBottom: 8, marginTop: 4 },
  reportReasonRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.depth.surface, marginBottom: 6, borderWidth: 1, borderColor: "transparent" },
  reportReasonRowActive: { backgroundColor: "rgba(212, 168, 78, 0.15)", borderColor: c.voice.gold },
  reportRadio: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: c.signal.steel, marginRight: 10 },
  reportRadioActive: { borderColor: c.voice.gold, backgroundColor: c.voice.gold },
  reportReasonText: { color: c.signal.white, fontSize: 13, flex: 1 },
  reportComment: { color: c.signal.white, fontSize: 13, backgroundColor: c.depth.surface, borderRadius: 10, padding: 10, minHeight: 60, textAlignVertical: "top", marginBottom: 12 },
  reportActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  reportBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  reportBtnSecondary: { backgroundColor: c.depth.surface },
  reportBtnSecondaryText: { color: c.signal.white, fontSize: 14, fontWeight: "600" },
  reportBtnPrimary: { backgroundColor: c.voice.gold },
  reportBtnPrimaryText: { color: c.depth.void, fontSize: 14, fontWeight: "600" },
});
