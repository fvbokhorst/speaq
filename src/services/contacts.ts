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

  /** Rename an existing contact. No-op if id not found. */
  editContact(id: string, newName: string): boolean {
    const c = this.contacts.find((c) => c.id === id);
    if (!c) return false;
    c.name = newName;
    this.save();
    return true;
  }

  /**
   * Remove a contact and ALL associated cryptographic + message state for that
   * peer. Mirrors PWA contact-delete: ratchet (chain keys), pinned signing
   * pubkey (TOFU pin), Kyber public key, disappear-timer config, and stored
   * messages are wiped together with the contact-list entry.
   *
   * Identity / own keypairs are untouched.
   */
  async removeContact(id: string): Promise<void> {
    this.contacts = this.contacts.filter((c) => c.id !== id);
    await this.save();
    const keys = [
      "speaq_ratchet_" + id,
      "speaq_sign_pub_" + id,
      "speaq_contact_pubkey_" + id,
      "speaq_disappear_" + id,
      "speaq_messages_" + id,
    ];
    await Promise.all(keys.map((k) => AsyncStorage.removeItem(k).catch(() => undefined)));
  }

  private async save(): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.contacts));
  }
}

export const contactsService = new ContactsService();
