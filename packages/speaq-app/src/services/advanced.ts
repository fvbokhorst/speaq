/**
 * SPEAQ Advanced Features
 * Ghost Groups, Witness Mode, Dead Man's Switch
 * Phase 5
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { relay } from "./relay";

// --- Ghost Groups ---
// Groups with no member list visible. Stealth invites only.
// Members can't see who else is in the group.

export interface GhostGroup {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  members: string[]; // SPEAQ IDs - only visible to creator
  isCreator: boolean;
}

// --- Witness Mode ---
// One-button evidence capture: timestamp + GPS + content hash
// Stored locally, optionally shared. Proof that something existed at a point in time.

export interface WitnessRecord {
  id: string;
  timestamp: number;
  contentHash: string; // SHA-256 of the content
  type: "text" | "photo" | "audio";
  content: string; // text or file URI
  location?: { lat: number; lng: number };
  shared: boolean;
}

// --- Dead Man's Switch ---
// If you don't check in within the configured interval,
// pre-configured messages are automatically sent to chosen contacts.

export interface DeadManSwitch {
  id: string;
  enabled: boolean;
  intervalHours: number; // Check-in interval
  lastCheckIn: number;
  recipients: { speaqId: string; name: string }[];
  message: string;
}

const STORAGE_KEYS = {
  ghostGroups: "speaq_ghost_groups",
  witnessRecords: "speaq_witness_records",
  deadManSwitch: "speaq_dead_man_switch",
};

class AdvancedService {
  private ghostGroups: GhostGroup[] = [];
  private witnessRecords: WitnessRecord[] = [];
  private deadManSwitch: DeadManSwitch | null = null;
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const [gg, wr, dms] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.ghostGroups),
        AsyncStorage.getItem(STORAGE_KEYS.witnessRecords),
        AsyncStorage.getItem(STORAGE_KEYS.deadManSwitch),
      ]);
      if (gg) this.ghostGroups = JSON.parse(gg);
      if (wr) this.witnessRecords = JSON.parse(wr);
      if (dms) this.deadManSwitch = JSON.parse(dms);
      this.loaded = true;
    } catch (e) {
      console.error("Advanced load error:", e);
    }
  }

  // --- Ghost Groups ---

  getGhostGroups(): GhostGroup[] {
    return [...this.ghostGroups];
  }

  createGhostGroup(name: string, description: string): GhostGroup {
    const group: GhostGroup = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      name,
      description,
      createdAt: Date.now(),
      members: [],
      isCreator: true,
    };
    this.ghostGroups.push(group);
    this.saveGhostGroups();
    return group;
  }

  addMemberToGhost(groupId: string, speaqId: string): boolean {
    const group = this.ghostGroups.find((g) => g.id === groupId);
    if (!group || !group.isCreator) return false;
    if (group.members.includes(speaqId)) return false;
    group.members.push(speaqId);
    this.saveGhostGroups();
    return true;
  }

  sendGhostMessage(groupId: string, text: string): void {
    const group = this.ghostGroups.find((g) => g.id === groupId);
    if (!group) return;
    // Send to all members individually - they don't know about each other
    for (const memberId of group.members) {
      const ws = (relay as any).ws;
      if (ws) {
        const blob = btoa(JSON.stringify({ type: "ghost", groupId, text }));
        ws.send(JSON.stringify({ type: "SEND", to: memberId, blob }));
      }
    }
  }

  deleteGhostGroup(groupId: string): void {
    this.ghostGroups = this.ghostGroups.filter((g) => g.id !== groupId);
    this.saveGhostGroups();
  }

  private async saveGhostGroups(): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.ghostGroups, JSON.stringify(this.ghostGroups));
  }

  // --- Witness Mode ---

  getWitnessRecords(): WitnessRecord[] {
    return [...this.witnessRecords].reverse();
  }

  async createWitness(type: WitnessRecord["type"], content: string): Promise<WitnessRecord> {
    // Generate SHA-256 hash of content
    const encoder = new TextEncoder();
    const data = encoder.encode(content + Date.now().toString());
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const contentHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const record: WitnessRecord = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      timestamp: Date.now(),
      contentHash,
      type,
      content,
      shared: false,
    };

    this.witnessRecords.push(record);
    await AsyncStorage.setItem(STORAGE_KEYS.witnessRecords, JSON.stringify(this.witnessRecords));
    return record;
  }

  async deleteWitness(id: string): Promise<void> {
    this.witnessRecords = this.witnessRecords.filter((r) => r.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.witnessRecords, JSON.stringify(this.witnessRecords));
  }

  // --- Dead Man's Switch ---

  getDeadManSwitch(): DeadManSwitch | null {
    return this.deadManSwitch;
  }

  async configureDeadManSwitch(
    intervalHours: number,
    recipients: { speaqId: string; name: string }[],
    message: string
  ): Promise<DeadManSwitch> {
    this.deadManSwitch = {
      id: Date.now().toString(36),
      enabled: true,
      intervalHours,
      lastCheckIn: Date.now(),
      recipients,
      message,
    };
    await AsyncStorage.setItem(STORAGE_KEYS.deadManSwitch, JSON.stringify(this.deadManSwitch));
    return this.deadManSwitch;
  }

  async checkIn(): Promise<void> {
    if (!this.deadManSwitch) return;
    this.deadManSwitch.lastCheckIn = Date.now();
    await AsyncStorage.setItem(STORAGE_KEYS.deadManSwitch, JSON.stringify(this.deadManSwitch));
  }

  async disableDeadManSwitch(): Promise<void> {
    if (!this.deadManSwitch) return;
    this.deadManSwitch.enabled = false;
    await AsyncStorage.setItem(STORAGE_KEYS.deadManSwitch, JSON.stringify(this.deadManSwitch));
  }

  isOverdue(): boolean {
    if (!this.deadManSwitch || !this.deadManSwitch.enabled) return false;
    const elapsed = Date.now() - this.deadManSwitch.lastCheckIn;
    return elapsed > this.deadManSwitch.intervalHours * 60 * 60 * 1000;
  }

  // Trigger: sends the pre-configured message to all recipients
  triggerDeadManSwitch(): void {
    if (!this.deadManSwitch) return;
    const ws = (relay as any).ws;
    if (!ws) return;

    for (const recipient of this.deadManSwitch.recipients) {
      const blob = btoa(JSON.stringify({
        type: "message",
        text: this.deadManSwitch.message,
        deadManSwitch: true,
      }));
      ws.send(JSON.stringify({ type: "SEND", to: recipient.speaqId, blob }));
    }
  }
}

export const advancedService = new AdvancedService();
