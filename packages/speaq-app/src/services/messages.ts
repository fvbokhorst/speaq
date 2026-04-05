/**
 * SPEAQ Message Persistence Service
 * Stores chat messages per contact in AsyncStorage
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

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
