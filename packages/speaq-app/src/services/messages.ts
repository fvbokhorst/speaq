/**
 * SPEAQ Message Persistence Service
 * Stores chat messages per contact in AsyncStorage
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// Re-export AsyncStorage usage is internal

export interface StoredMessage {
  id: string;
  text: string;
  sent: boolean;
  timestamp: string;
  type: "text" | "image" | "file" | "payment";
  fileName?: string;
  fileUri?: string;
  amount?: number;
  deleted?: boolean;
  expiresAt?: number; // timestamp when message auto-deletes
}

// Disappearing message timer options
export type DisappearTimer = "off" | "5m" | "1h" | "24h" | "7d" | "30d";

export const DISAPPEAR_OPTIONS: { key: DisappearTimer; label: string; ms: number }[] = [
  { key: "off", label: "Off", ms: 0 },
  { key: "5m", label: "5 minutes", ms: 5 * 60 * 1000 },
  { key: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
  { key: "24h", label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
];

const TIMER_PREFIX = "speaq_disappear_";

export async function getDisappearTimer(contactId: string): Promise<DisappearTimer> {
  try {
    const val = await AsyncStorage.getItem(TIMER_PREFIX + contactId);
    return (val as DisappearTimer) || "off";
  } catch (e) { return "off"; }
}

export async function setDisappearTimer(contactId: string, timer: DisappearTimer): Promise<void> {
  await AsyncStorage.setItem(TIMER_PREFIX + contactId, timer);
}

export function getExpiresAt(timer: DisappearTimer): number | undefined {
  const opt = DISAPPEAR_OPTIONS.find((o) => o.key === timer);
  if (!opt || opt.ms === 0) return undefined;
  return Date.now() + opt.ms;
}

export async function cleanExpiredMessages(contactId: string): Promise<StoredMessage[]> {
  const messages = await loadMessages(contactId);
  const now = Date.now();
  const valid = messages.filter((m) => !m.expiresAt || m.expiresAt > now);
  if (valid.length !== messages.length) {
    await saveMessages(contactId, valid);
  }
  return valid;
}

const PREFIX = "speaq_chat_";

export async function loadMessages(contactId: string): Promise<StoredMessage[]> {
  try {
    const data = await AsyncStorage.getItem(PREFIX + contactId);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

export async function saveMessages(contactId: string, messages: StoredMessage[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + contactId, JSON.stringify(messages));
  } catch (e) {
    console.error("Save messages error:", e);
  }
}

export async function deleteMessage(contactId: string, messageId: string, forEveryone: boolean): Promise<StoredMessage[]> {
  const messages = await loadMessages(contactId);
  const updated = messages.map((m) =>
    m.id === messageId ? { ...m, deleted: true, text: forEveryone ? "This message was deleted" : m.text } : m
  );
  await saveMessages(contactId, updated);
  return updated;
}

export async function searchMessages(query: string): Promise<{ contactId: string; message: StoredMessage }[]> {
  const results: { contactId: string; message: StoredMessage }[] = [];
  try {
    const keys = await AsyncStorage.getAllKeys();
    const chatKeys = keys.filter((k) => k.startsWith(PREFIX));
    for (const key of chatKeys) {
      const data = await AsyncStorage.getItem(key);
      if (!data) continue;
      const messages: StoredMessage[] = JSON.parse(data);
      const contactId = key.replace(PREFIX, "");
      for (const msg of messages) {
        if (!msg.deleted && msg.text.toLowerCase().includes(query.toLowerCase())) {
          results.push({ contactId, message: msg });
        }
      }
    }
  } catch (e) {}
  return results;
}
