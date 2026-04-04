/**
 * SPEAQ - Chat Screen
 * Quantum-encrypted message view
 * PRD Section 2.1: Quantum Chat
 * Brand: Depth Surface bg, Voice Gold sent bubbles, Quantum Teal received
 */

import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { colors, spacing, radius } from "../theme/brand";

interface Message {
  id: string;
  text: string;
  sent: boolean;
  timestamp: string;
}

// Placeholder data
const DEMO_MESSAGES: Message[] = [
  { id: "1", text: "Hello Bob, this is quantum-encrypted!", sent: true, timestamp: "23:29" },
  { id: "2", text: "Hi Alice! SPEAQ Freely.", sent: false, timestamp: "23:30" },
  { id: "3", text: "No government can read this. No quantum computer can break it.", sent: true, timestamp: "23:31" },
  { id: "4", text: "Freedom is encrypted.", sent: false, timestamp: "23:31" },
];

export default function ChatScreen() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>(DEMO_MESSAGES);

  const sendMessage = () => {
    if (!message.trim()) return;
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        text: message.trim(),
        sent: true,
        timestamp: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
      },
    ]);
    setMessage("");
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[styles.messageBubble, item.sent ? styles.sent : styles.received]}>
      <Text style={[styles.messageText, item.sent ? styles.sentText : styles.receivedText]}>
        {item.text}
      </Text>
      <Text style={[styles.messageTime, item.sent ? styles.sentTime : styles.receivedTime]}>
        {item.timestamp}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarText}>B</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>Bob</Text>
          <Text style={styles.headerStatus}>Quantum Secured</Text>
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.headerIcon}>
            <Text style={styles.headerIconText}>📞</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon}>
            <Text style={styles.headerIconText}>📹</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Encryption Banner */}
      <View style={styles.encBanner}>
        <Text style={styles.encText}>🔒 Kyber-768 + AES-256-GCM + Double Ratchet</Text>
      </View>

      {/* Messages */}
      <FlatList
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
      />

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={message}
          onChangeText={setMessage}
          placeholder="SPEAQ Freely..."
          placeholderTextColor={colors.signal.steel}
          multiline
          onSubmitEditing={sendMessage}
          returnKeyType="send"
        />
        <TouchableOpacity
          style={[styles.sendButton, message.trim() ? styles.sendActive : {}]}
          onPress={sendMessage}
          disabled={!message.trim()}
        >
          <Text style={styles.sendText}>→</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.depth.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 56,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.depth.void,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.depth.elevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.quantum.teal,
  },
  headerAvatarText: {
    color: colors.quantum.teal,
    fontSize: 16,
    fontWeight: "600",
  },
  headerInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  headerName: {
    color: colors.signal.white,
    fontSize: 17,
    fontWeight: "600",
  },
  headerStatus: {
    color: colors.quantum.teal,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 1,
  },
  headerIcons: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.depth.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconText: {
    fontSize: 16,
  },
  encBanner: {
    backgroundColor: colors.depth.card,
    paddingVertical: spacing.xs,
    alignItems: "center",
  },
  encText: {
    color: colors.signal.steel,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  messageBubble: {
    maxWidth: "80%",
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  sent: {
    alignSelf: "flex-end",
    backgroundColor: colors.voice.deep,
    borderBottomRightRadius: radius.sm,
  },
  received: {
    alignSelf: "flex-start",
    backgroundColor: colors.depth.card,
    borderBottomLeftRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  sentText: {
    color: colors.voice.light,
  },
  receivedText: {
    color: colors.signal.white,
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  sentTime: {
    color: colors.voice.warm,
  },
  receivedTime: {
    color: colors.signal.steel,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.depth.void,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.depth.card,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.signal.white,
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.depth.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  sendActive: {
    backgroundColor: colors.voice.gold,
  },
  sendText: {
    color: colors.signal.white,
    fontSize: 20,
    fontWeight: "600",
  },
});
