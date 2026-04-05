/**
 * SPEAQ - Chat List Screen
 */

import React from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { colors, spacing, radius } from "../theme/brand";
import { getIdentity } from "../services/speaq";

interface Chat {
  id: string;
  name: string;
  lastMessage: string;
  timestamp: string;
  unread: number;
}

const DEMO_CHATS: Chat[] = [
  { id: "demo-bob", name: "Bob", lastMessage: "SPEAQ Freely.", timestamp: "23:31", unread: 2 },
  { id: "demo-charles", name: "Charles (Uganda)", lastMessage: "Platform is production ready!", timestamp: "22:45", unread: 0 },
  { id: "demo-romana", name: "Romana", lastMessage: "Feedback 17 is sent.", timestamp: "20:15", unread: 1 },
];

interface Props {
  onOpenChat: (contactId: string, contactName: string) => void;
}

export default function ChatListScreen({ onOpenChat }: Props) {
  const renderChat = ({ item }: { item: Chat }) => (
    <TouchableOpacity style={st.chatItem} activeOpacity={0.7} onPress={() => onOpenChat(item.id, item.name)}>
      <View style={st.avatar}>
        <Text style={st.avatarText}>{item.name.charAt(0)}</Text>
      </View>
      <View style={st.chatContent}>
        <View style={st.chatHeader}>
          <Text style={st.chatName}>{item.name}</Text>
          <Text style={st.chatTime}>{item.timestamp}</Text>
        </View>
        <View style={st.chatFooter}>
          <Text style={st.chatMsg} numberOfLines={1}>{item.lastMessage}</Text>
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
      <FlatList data={DEMO_CHATS} renderItem={renderChat} keyExtractor={(i) => i.id} style={st.list} contentContainerStyle={st.listPad} />
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
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.depth.elevated, alignItems: "center", justifyContent: "center", marginRight: 16, borderWidth: 1, borderColor: colors.voice.gold },
  avatarText: { color: colors.voice.gold, fontSize: 18, fontWeight: "600" },
  chatContent: { flex: 1 },
  chatHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  chatName: { color: colors.signal.white, fontSize: 16, fontWeight: "600" },
  chatTime: { color: colors.signal.steel, fontSize: 12 },
  chatFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chatMsg: { color: colors.signal.light, fontSize: 14, flex: 1, marginRight: 8 },
  badge: { backgroundColor: colors.voice.gold, borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { color: colors.depth.void, fontSize: 11, fontWeight: "700" },
  fab: { position: "absolute", bottom: 32, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.voice.gold, alignItems: "center", justifyContent: "center", shadowColor: colors.voice.gold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  fabText: { color: colors.depth.void, fontSize: 28, fontWeight: "300", marginTop: -2 },
});
