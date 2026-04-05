/**
 * SPEAQ Group Chat Service
 * Regular group chats (not ghost groups)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { sendMessage } from "./speaq";

export interface Group {
  id: string;
  name: string;
  members: { speaqId: string; name: string }[];
  createdAt: number;
  createdBy: string;
}

const STORAGE_KEY = "speaq_groups";

let groups: Group[] = [];
let loaded = false;

export async function loadGroups(): Promise<void> {
  if (loaded) return;
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (data) groups = JSON.parse(data);
    loaded = true;
  } catch (e) {}
}

async function save(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

export function getGroups(): Group[] {
  return [...groups];
}

export function getGroup(id: string): Group | undefined {
  return groups.find((g) => g.id === id);
}

export async function createGroup(name: string, members: { speaqId: string; name: string }[], createdBy: string): Promise<Group> {
  const group: Group = {
    id: "grp_" + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    name,
    members,
    createdAt: Date.now(),
    createdBy,
  };
  groups.push(group);
  await save();
  return group;
}

export async function addMember(groupId: string, speaqId: string, name: string): Promise<boolean> {
  const group = groups.find((g) => g.id === groupId);
  if (!group) return false;
  if (group.members.find((m) => m.speaqId === speaqId)) return false;
  group.members.push({ speaqId, name });
  await save();
  return true;
}

export async function removeMember(groupId: string, speaqId: string): Promise<void> {
  const group = groups.find((g) => g.id === groupId);
  if (!group) return;
  group.members = group.members.filter((m) => m.speaqId !== speaqId);
  await save();
}

export async function deleteGroup(groupId: string): Promise<void> {
  groups = groups.filter((g) => g.id !== groupId);
  await save();
}

export function sendGroupMessage(group: Group, text: string): void {
  for (const member of group.members) {
    sendMessage(member.speaqId, JSON.stringify({
      type: "group_message",
      groupId: group.id,
      groupName: group.name,
      text,
    }));
  }
}
