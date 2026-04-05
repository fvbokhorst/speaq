/**
 * SPEAQ - Chat List Screen
 * Shows real conversations from message storage
 * Unread badges, profile photos, last message preview
 */

import React, { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Image } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../theme/brand";
import { getIdentity } from "../services/speaq";
import { contactsService } from "../services/contacts";
import { getContactPhoto } from "../services/profile";

interface ChatPreview {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: string;
  unread: number;
  photoUri: string | null;
}

interface Props {
  onOpenChat: (contactId: string, contactName: string) => void;
}

export default function ChatListScreen({ onOpenChat }: Props) {
  const [chats, setChats] = useState<ChatPreview[]>([]);

  const loadChats = useCallback(async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const chatKeys = keys.filter((k) => k.startsWith("speaq_chat_"));
      const previews: ChatPreview[] = [];

      for (const key of chatKeys) {
        const contactId = key.replace("speaq_chat_", "");
        const data = await AsyncStorage.getItem(key);
        if (!data) continue;
        const messages = JSON.parse(data);
        if (messages.length === 0) continue;

        const last = messages[messages.length - 1];
        const contact = contactsService.getContacts().find((c) => c.id === contactId);
        const name = contact?.name || contactId.substring(0, 8) + "...";

        // Count unread (messages received since last read)
        const lastReadKey = `speaq_read_${contactId}`;
        const lastReadTime = parseInt((await AsyncStorage.getItem(lastReadKey)) || "0");
        const unread = messages.filter((m: any) => !m.sent && new Date(m.timestamp).getTime() > lastReadTime).length;

        previews.push({
          id: contactId,
          name,
          lastMessage: last.deleted ? "Message deleted" : last.type === "payment" ? `${last.amount?.toFixed(2)} QC` : last.text,
          timestamp: last.timestamp,
          unread,
          photoUri: getContactPhoto(contactId),
        });
      }

      // Sort by most recent first
      previews.sort((a, b) => {
        // Simple string comparison for HH:MM format works for same day
        return b.timestamp.localeCompare(a.timestamp);
      });

      setChats(previews);
    } catch (e) {}
  }, []);

  useEffect(() => {
    loadChats();
    // Refresh every 3 seconds to catch new messages
    const interval = setInterval(loadChats, 3000);
    return () => clearInterval(interval);
  }, [loadChats]);

  function handleOpenChat(contactId: string, contactName: string) {
    // Mark as read
    AsyncStorage.setItem(`speaq_read_${contactId}`, Date.now().toString());
    onOpenChat(contactId, contactName);
  }

  const renderChat = ({ item }: { item: ChatPreview }) => (
    <TouchableOpacity style={st.chatItem} activeOpacity={0.7} onPress={() => handleOpenChat(item.id, item.name)}>
      {item.photoUri ? (
        <Image source={{ uri: item.photoUri }} style={st.avatar} />
      ) : (
        <View style={st.avatarPlaceholder}>
          <Text style={st.avatarText}>{item.name.charAt(0)}</Text>
        </View>
      )}
      <View style={st.chatContent}>
        <View style={st.chatHeader}>
          <Text style={[st.chatName, item.unread > 0 && st.chatNameBold]}>{item.name}</Text>
          <Text style={[st.chatTime, item.unread > 0 && st.chatTimeUnread]}>{item.timestamp}</Text>
        </View>
        <View style={st.chatFooter}>
          <Text style={[st.chatMsg, item.unread > 0 && st.chatMsgUnread]} numberOfLines={1}>{item.lastMessage}</Text>
          {item.unread > 0 && (
            <View style={st.badge}><Text style={st.badgeText}>{item.unread}</Text></View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={st.container}>
      <View style={st.header}>
        <Text style={st.logo}><Text style={st.logoS}>SPEA</Text><Text style={st.logoQ}>Q</Text></Text>
        <Text style={st.headerSub}>Quantum Encrypted</Text>
      </View>
      {chats.length === 0 ? (
        <View style={st.empty}>
          <Text style={st.emptyTitle}>No conversations yet</Text>
          <Text style={st.emptySub}>Add a contact and start a quantum-encrypted chat</Text>
        </View>
      ) : (
        <FlatList data={chats} renderItem={renderChat} keyExtractor={(i) => i.id} style={st.list} contentContainerStyle={st.listPad} />
      )}
      <TouchableOpacity style={st.fab} activeOpacity={0.8} onPress={() => {
        const id = getIdentity();
        Alert.alert("New Chat", `Your SPEAQ ID:\n${id?.speaqId || "not created"}\n\nShare this to start a quantum-encrypted chat.`);
      }}>
        <Text style={st.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.depth.void },
  header: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  logo: { fontSize: 28, fontWeight: "700", fontFamily: "Georgia" },
  logoS: { color: colors.signal.white },
  logoQ: { color: colors.voice.gold },
  headerSub: { fontSize: 11, color: colors.quantum.teal, letterSpacing: 2, textTransform: "uppercase", marginTop: 2 },
  list: { flex: 1 },
  listPad: { paddingTop: 8 },
  chatItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 16 },
  avatarPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.depth.elevated, alignItems: "center", justifyContent: "center", marginRight: 16, borderWidth: 1, borderColor: colors.voice.gold },
  avatarText: { color: colors.voice.gold, fontSize: 18, fontWeight: "600" },
  chatContent: { flex: 1 },
  chatHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  chatName: { color: colors.signal.white, fontSize: 16, fontWeight: "500" },
  chatNameBold: { fontWeight: "700" },
  chatTime: { color: colors.signal.steel, fontSize: 12 },
  chatTimeUnread: { color: colors.voice.gold },
  chatFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chatMsg: { color: colors.signal.steel, fontSize: 14, flex: 1, marginRight: 8 },
  chatMsgUnread: { color: colors.signal.light },
  badge: { backgroundColor: colors.voice.gold, borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { color: colors.depth.void, fontSize: 11, fontWeight: "700" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 100 },
  emptyTitle: { color: colors.signal.white, fontSize: 18, fontWeight: "500", marginBottom: 8 },
  emptySub: { color: colors.signal.steel, fontSize: 12, textAlign: "center", paddingHorizontal: 40 },
  fab: { position: "absolute", bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.voice.gold, alignItems: "center", justifyContent: "center", shadowColor: colors.voice.gold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  fabText: { color: colors.depth.void, fontSize: 28, fontWeight: "300", marginTop: -2 },
});
