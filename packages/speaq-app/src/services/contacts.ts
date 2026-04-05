/**
 * SPEAQ Contacts Service
 * Shared contact list across screens
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export interface Contact {
  id: string;
  name: string;
}

const STORAGE_KEY = "speaq_contacts";

class ContactsService {
  private contacts: Contact[] = [];
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) this.contacts = JSON.parse(data);
      this.loaded = true;
    } catch (e) {
      console.error("Contacts load error:", e);
    }
  }

  getContacts(): Contact[] {
    return [...this.contacts];
  }

  addContact(id: string, name: string): void {
    if (this.contacts.find((c) => c.id === id)) return;
    this.contacts.push({ id, name });
    this.save();
  }

  removeContact(id: string): void {
    this.contacts = this.contacts.filter((c) => c.id !== id);
    this.save();
  }

  private async save(): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.contacts));
  }
}

export const contactsService = new ContactsService();
