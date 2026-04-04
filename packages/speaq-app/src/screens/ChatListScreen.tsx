/**
 * SPEAQ - Chat List Screen
 * Shows all conversations with last message preview
 * PRD Section 2.1: Quantum Chat
 * Brand: Depth Void bg, Voice Gold accents, Freedom White text
 */

import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { colors, fonts, spacing, radius } from "../theme/brand";

interface Chat {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: string;
  unread: number;
}

// Placeholder data
const DEMO_CHATS: Chat[] = [
  {
    id: "1",
    name: "Bob",
    lastMessage: "SPEAQ Freely. The future of communication.",
    timestamp: "23:31",
    unread: 2,
  },
  {
    id: "2",
    name: "Charles (Uganda)",
    lastMessage: "Platform is production ready!",
    timestamp: "22:45",
    unread: 0,
  },
  {
    id: "3",
    name: "Romana",
    lastMessage: "Feedback 17 is sent.",
    timestamp: "20:15",
    unread: 1,
  },
];

export default function ChatListScreen() {
  const renderChat = ({ item }: { item: Chat }) => (
    <TouchableOpacity style={styles.chatItem} activeOpacity={0.7}>
      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {item.name.charAt(0).toUpperCase()}
        </Text>
      </View>

      {/* Content */}
      <View style={styles.chatContent}>
        <View style={styles.chatHeader}>
          <Text style={styles.chatName}>{item.name}</Text>
          <Text style={styles.chatTime}>{item.timestamp}</Text>
        </View>
        <View style={styles.chatFooter}>
          <Text style={styles.chatMessage} numberOfLines={1}>
            {item.lastMessage}
          </Text>
          {item.unread > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{item.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>
          <Text style={styles.logoClari}>SPEA</Text>
          <Text style={styles.logoQ}>Q</Text>
        </Text>
        <Text style={styles.headerSub}>Quantum Encrypted</Text>
      </View>

      {/* Chat List */}
      <FlatList
        data={DEMO_CHATS}
        renderItem={renderChat}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
      />

      {/* New Chat FAB */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.8}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.depth.void,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  logo: {
    fontSize: 28,
    fontWeight: "700",
  },
  logoClari: {
    color: colors.signal.white,
  },
  logoQ: {
    color: colors.voice.gold,
  },
  headerSub: {
    fontSize: 11,
    color: colors.quantum.teal,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: spacing.sm,
  },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.depth.elevated,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
    borderWidth: 1,
    borderColor: colors.voice.gold,
  },
  avatarText: {
    color: colors.voice.gold,
    fontSize: 18,
    fontWeight: "600",
  },
  chatContent: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  chatName: {
    color: colors.signal.white,
    fontSize: 16,
    fontWeight: "600",
  },
  chatTime: {
    color: colors.signal.steel,
    fontSize: 12,
  },
  chatFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chatMessage: {
    color: colors.signal.light,
    fontSize: 14,
    flex: 1,
    marginRight: spacing.sm,
  },
  unreadBadge: {
    backgroundColor: colors.voice.gold,
    borderRadius: radius.full,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadText: {
    color: colors.depth.void,
    fontSize: 11,
    fontWeight: "700",
  },
  fab: {
    position: "absolute",
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.voice.gold,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.voice.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  fabText: {
    color: colors.depth.void,
    fontSize: 28,
    fontWeight: "300",
    marginTop: -2,
  },
});
