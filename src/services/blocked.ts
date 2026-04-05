/**
 * SPEAQ Blocked Users Service
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "speaq_blocked";

let blockedIds: string[] = [];

export async function loadBlocked(): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (data) blockedIds = JSON.parse(data);
  } catch (e) {}
}

export function isBlocked(speaqId: string): boolean {
  return blockedIds.includes(speaqId);
}

export async function blockUser(speaqId: string): Promise<void> {
  if (!blockedIds.includes(speaqId)) {
    blockedIds.push(speaqId);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(blockedIds));
  }
}

export async function unblockUser(speaqId: string): Promise<void> {
  blockedIds = blockedIds.filter((id) => id !== speaqId);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(blockedIds));
}

export function getBlockedUsers(): string[] {
  return [...blockedIds];
}
