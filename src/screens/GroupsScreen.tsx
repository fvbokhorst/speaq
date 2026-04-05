/**
 * SPEAQ - Groups Screen
 * Create and manage group chats
 */

import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, TextInput, Alert,
} from "react-native";
import { colors } from "../theme/brand";
import { contactsService, Contact } from "../services/contacts";
import { loadGroups, getGroups, createGroup, deleteGroup, Group } from "../services/groups";
import { getIdentity } from "../services/speaq";

interface Props {
  onOpenGroupChat: (groupId: string, groupName: string) => void;
}

export default function GroupsScreen({ onOpenGroupChat }: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Contact[]>([]);
  const contacts = contactsService.getContacts();

  useEffect(() => {
    loadGroups().then(() => setGroups(getGroups()));
  }, []);

  function handleCreate() {
    if (!groupName.trim()) return;
    const myId = getIdentity()?.speaqId || "";
    createGroup(
      groupName.trim(),
      selectedMembers.map((c) => ({ speaqId: c.id, name: c.name })),
      myId
    ).then(() => {
      setGroups(getGroups());
      setShowCreate(false);
      setGroupName("");
      setSelectedMembers([]);
    });
  }

  function toggleMember(contact: Contact) {
    if (selectedMembers.find((m) => m.id === contact.id)) {
      setSelectedMembers(selectedMembers.filter((m) => m.id !== contact.id));
    } else {
      setSelectedMembers([...selectedMembers, contact]);
    }
  }

  function handleDeleteGroup(group: Group) {
    Alert.alert("Delete Group", `Delete "${group.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        deleteGroup(group.id).then(() => setGroups(getGroups()));
      }},
    ]);
  }

  return (
    <View style={st.container}>
      <View style={st.header}>
        <Text style={st.title}>Groups</Text>
        <TouchableOpacity style={st.createBtn} onPress={() => setShowCreate(true)}>
          <Text style={st.createBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={st.list} contentContainerStyle={{ paddingBottom: 100 }}>
        {groups.length === 0 ? (
          <View style={st.empty}>
            <Text style={st.emptyTitle}>No groups yet</Text>
            <Text style={st.emptySub}>Create a group to chat with multiple people at once</Text>
          </View>
        ) : (
          groups.map((g) => (
            <TouchableOpacity key={g.id} style={st.groupRow} onPress={() => onOpenGroupChat(g.id, g.name)} onLongPress={() => handleDeleteGroup(g)}>
              <View style={st.groupIcon}>
                <Text style={st.groupIconText}>{g.name.charAt(0)}</Text>
              </View>
              <View style={st.groupInfo}>
                <Text style={st.groupName}>{g.name}</Text>
                <Text style={st.groupMembers}>{g.members.length} members</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Create Group Modal */}
      <Modal visible={showCreate} animationType="slide">
        <View style={st.createContainer}>
          <View style={st.createHeader}>
            <TouchableOpacity onPress={() => { setShowCreate(false); setGroupName(""); setSelectedMembers([]); }}>
              <Text style={st.createCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={st.createTitle}>New Group</Text>
            <TouchableOpacity onPress={handleCreate} disabled={!groupName.trim()}>
              <Text style={[st.createDone, !groupName.trim() && { opacity: 0.3 }]}>Create</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={st.nameInput}
            value={groupName}
            onChangeText={setGroupName}
            placeholder="Group name"
            placeholderTextColor={colors.signal.steel}
            autoFocus
          />

          <Text style={st.sectionLabel}>Add Members ({selectedMembers.length})</Text>

          {contacts.length === 0 ? (
            <Text style={st.emptyContacts}>Add contacts first to create a group.</Text>
          ) : (
            <ScrollView style={st.membersList}>
              {contacts.map((c) => {
                const selected = !!selectedMembers.find((m) => m.id === c.id);
                return (
                  <TouchableOpacity key={c.id} style={st.memberRow} onPress={() => toggleMember(c)}>
                    <View style={[st.memberCheck, selected && st.memberChecked]}>
                      {selected && <Text style={st.checkMark}>V</Text>}
                    </View>
                    <View style={st.memberAvatar}>
                      <Text style={st.memberInit}>{c.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.memberName}>{c.name}</Text>
                      <Text style={st.memberId}>{c.id}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.depth.void },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  title: { color: colors.signal.white, fontSize: 28, fontWeight: "700", fontFamily: "Georgia" },
  createBtn: { backgroundColor: colors.voice.gold, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  createBtnText: { color: colors.depth.void, fontSize: 13, fontWeight: "600" },
  list: { flex: 1 },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyTitle: { color: colors.signal.white, fontSize: 16, fontWeight: "500", marginBottom: 4 },
  emptySub: { color: colors.signal.steel, fontSize: 12, textAlign: "center", paddingHorizontal: 40 },
  groupRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  groupIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.depth.elevated, alignItems: "center", justifyContent: "center", marginRight: 16, borderWidth: 1, borderColor: colors.voice.gold },
  groupIconText: { color: colors.voice.gold, fontSize: 18, fontWeight: "600" },
  groupInfo: { flex: 1 },
  groupName: { color: colors.signal.white, fontSize: 16, fontWeight: "600" },
  groupMembers: { color: colors.signal.steel, fontSize: 12, marginTop: 2 },

  createContainer: { flex: 1, backgroundColor: colors.depth.void },
  createHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  createCancel: { color: colors.signal.steel, fontSize: 16 },
  createTitle: { color: colors.signal.white, fontSize: 17, fontWeight: "600" },
  createDone: { color: colors.voice.gold, fontSize: 16, fontWeight: "600" },
  nameInput: { marginHorizontal: 20, marginTop: 20, backgroundColor: colors.depth.card, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: colors.signal.white, fontSize: 16 },
  sectionLabel: { color: colors.signal.steel, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 20, marginTop: 24, marginBottom: 12 },
  emptyContacts: { color: colors.signal.steel, fontSize: 12, paddingHorizontal: 20 },
  membersList: { flex: 1, paddingHorizontal: 20 },
  memberRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  memberCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border.subtle, marginRight: 12, alignItems: "center", justifyContent: "center" },
  memberChecked: { borderColor: colors.voice.gold, backgroundColor: colors.voice.gold },
  checkMark: { color: colors.depth.void, fontSize: 14, fontWeight: "700" },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.depth.elevated, alignItems: "center", justifyContent: "center", marginRight: 12, borderWidth: 1, borderColor: colors.quantum.teal },
  memberInit: { color: colors.quantum.teal, fontSize: 14, fontWeight: "600" },
  memberName: { color: colors.signal.white, fontSize: 15, fontWeight: "500" },
  memberId: { color: colors.signal.steel, fontSize: 10, fontFamily: "Courier", marginTop: 1 },
});
