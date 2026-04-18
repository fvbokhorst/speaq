/**
 * SPEAQ Advanced Features
 * Private Groups, Witness Mode, Safety Check-in
 * Phase 5
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import CryptoJS from "crypto-js";
import { relay, safeWsSend } from "./relay";
import { loadKyberKeyPair } from "./crypto";

// --- Private Groups ---
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
  signature: string; // HMAC-SHA256 signature for tamper evidence
  type: "text" | "photo" | "audio";
  content: string; // text or file URI
  location?: { lat: number; lng: number };
  shared: boolean;
}

// --- Safety Check-in ---
// If you don't check in within the configured interval,
// pre-configured messages are automatically sent to chosen contacts.

// --- Ghost Polls ---
// Anonymous polling within Private Groups. No voter identity recorded.

export interface GhostPoll {
  id: string;
  groupId: string;
  question: string;
  options: string[];
  votes: number[];
  totalVoters: number;
  votedUsers: string[]; // hashed SPEAQ IDs -- can't reverse but prevents double voting
  createdAt: number;
}

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
  ghostPolls: "speaq_ghost_polls",
  witnessRecords: "speaq_witness_records",
  deadManSwitch: "speaq_dead_man_switch",
};

class AdvancedService {
  private ghostGroups: GhostGroup[] = [];
  private ghostPolls: GhostPoll[] = [];
  private witnessRecords: WitnessRecord[] = [];
  private deadManSwitch: DeadManSwitch | null = null;
  private loaded = false;
  private _checkInterval: ReturnType<typeof setInterval> | null = null;

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const [gg, gp, wr, dms] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.ghostGroups),
        AsyncStorage.getItem(STORAGE_KEYS.ghostPolls),
        AsyncStorage.getItem(STORAGE_KEYS.witnessRecords),
        AsyncStorage.getItem(STORAGE_KEYS.deadManSwitch),
      ]);
      if (gg) this.ghostGroups = JSON.parse(gg);
      if (gp) this.ghostPolls = JSON.parse(gp);
      if (wr) this.witnessRecords = JSON.parse(wr);
      if (dms) this.deadManSwitch = JSON.parse(dms);
      this.loaded = true;

      // Check immediately if Safety Check-in is overdue
      if (this.isOverdue()) {
        this.triggerDeadManSwitch();
        await this.disableDeadManSwitch();
      }

      // Start background check every 60 seconds
      this.startCheckInterval();
    } catch (e) {
      console.error("Advanced load error:", e);
    }
  }

  // --- Private Groups ---

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

  // --- Ghost Polls ---

  createGhostPoll(groupId: string, question: string, options: string[]): GhostPoll {
    if (options.length < 2) throw new Error("Poll needs at least 2 options");

    const poll: GhostPoll = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      groupId,
      question,
      options,
      votes: new Array(options.length).fill(0),
      totalVoters: 0,
      votedUsers: [],
      createdAt: Date.now(),
    };
    this.ghostPolls.push(poll);
    this.saveGhostPolls();
    return poll;
  }

  voteOnPoll(groupId: string, pollId: string, optionIndex: number, voterId?: string): boolean {
    const poll = this.ghostPolls.find((p) => p.id === pollId && p.groupId === groupId);
    if (!poll) return false;
    if (optionIndex < 0 || optionIndex >= poll.options.length) return false;

    // Hash the voter ID so we can prevent double voting without revealing identity
    const voterHash = voterId
      ? CryptoJS.SHA256(voterId + pollId).toString(CryptoJS.enc.Hex)
      : Date.now().toString(36); // Anonymous fallback

    if (poll.votedUsers.includes(voterHash)) return false; // Already voted

    poll.votes[optionIndex]++;
    poll.totalVoters++;
    poll.votedUsers.push(voterHash);
    this.saveGhostPolls();
    return true;
  }

  getGhostPolls(groupId: string): GhostPoll[] {
    return this.ghostPolls
      .filter((p) => p.groupId === groupId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  private async saveGhostPolls(): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.ghostPolls, JSON.stringify(this.ghostPolls));
  }

  // --- Witness Mode ---

  getWitnessRecords(): WitnessRecord[] {
    return [...this.witnessRecords].reverse();
  }

  createWitness(type: WitnessRecord["type"], content: string, signingKey?: string): WitnessRecord {
    // Generate SHA-256 hash of content + timestamp + nonce (RN-compatible)
    const timestamp = Date.now();
    const nonce = Math.random().toString(36).substring(2, 10);
    const contentHash = CryptoJS.SHA256(content + timestamp.toString() + nonce).toString();

    // Create HMAC-SHA256 digital signature for tamper evidence
    // Uses the signing key (Kyber-derived) or falls back to contentHash as HMAC key
    const hmacKey = signingKey || contentHash;
    const signatureData = content + contentHash + timestamp.toString();
    const signature = CryptoJS.HmacSHA256(signatureData, hmacKey).toString(CryptoJS.enc.Hex);

    const recordId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);

    const record: WitnessRecord = {
      id: recordId,
      timestamp,
      contentHash,
      signature,
      type,
      content,
      shared: false,
    };

    this.witnessRecords.push(record);
    AsyncStorage.setItem(STORAGE_KEYS.witnessRecords, JSON.stringify(this.witnessRecords));

    // Try to capture GPS location (async - updates record when available)
    try {
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const idx = this.witnessRecords.findIndex((r) => r.id === recordId);
            if (idx !== -1) {
              this.witnessRecords[idx].location = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              };
              AsyncStorage.setItem(STORAGE_KEYS.witnessRecords, JSON.stringify(this.witnessRecords));
            }
          },
          () => {
            // GPS unavailable (simulator, permissions denied) - location stays undefined
          },
          { timeout: 5000, enableHighAccuracy: false }
        );
      }
    } catch {
      // navigator.geolocation not available in this environment
    }

    return record;
  }

  async deleteWitness(id: string): Promise<void> {
    this.witnessRecords = this.witnessRecords.filter((r) => r.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.witnessRecords, JSON.stringify(this.witnessRecords));
  }

  verifyWitness(record: WitnessRecord, signingKey?: string): boolean {
    // Re-compute the HMAC-SHA256 signature and compare
    const hmacKey = signingKey || record.contentHash;
    const signatureData = record.content + record.contentHash + record.timestamp.toString();
    const expectedSig = CryptoJS.HmacSHA256(signatureData, hmacKey).toString(CryptoJS.enc.Hex);
    return expectedSig === record.signature;
  }

  exportWitness(record: WitnessRecord): object {
    // Return a shareable JSON proof (hash + signature + timestamp + content)
    return {
      contentHash: record.contentHash,
      signature: record.signature,
      timestamp: record.timestamp,
      content: record.content,
      type: record.type,
      location: record.location || null,
    };
  }

  // --- Safety Check-in ---

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
    this.startCheckInterval();
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
    this.stopCheckInterval();
  }

  private startCheckInterval(): void {
    this.stopCheckInterval();
    this._checkInterval = setInterval(async () => {
      if (this.isOverdue()) {
        this.triggerDeadManSwitch();
        await this.disableDeadManSwitch();
      }
    }, 60_000);
  }

  private stopCheckInterval(): void {
    if (this._checkInterval) {
      clearInterval(this._checkInterval);
      this._checkInterval = null;
    }
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
