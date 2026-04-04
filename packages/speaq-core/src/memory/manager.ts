/**
 * SPEAQ Core - Memory Manager
 * PORT from plexaris-agent-core/memory/manager.py
 * PRD Section 5: Ratchet state persistence, chat session state
 *
 * Encrypted key-value store for persistent state on device.
 * Backed by SQLCipher in production, in-memory for testing.
 */

import * as aes from "../crypto/aes";
import crypto from "crypto";

export interface MemoryStore {
  get(key: string): Promise<Buffer | null>;
  set(key: string, value: Buffer): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

/**
 * In-memory store (for testing and development)
 */
export class InMemoryStore implements MemoryStore {
  private data: Map<string, Buffer> = new Map();

  async get(key: string): Promise<Buffer | null> {
    return this.data.get(key) || null;
  }

  async set(key: string, value: Buffer): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.data.has(key);
  }
}

/**
 * Encrypted Memory Manager
 * Wraps any MemoryStore with AES-256-GCM encryption
 * All data encrypted at rest - even in-memory for defense in depth
 */
export class MemoryManager {
  private store: MemoryStore;
  private encryptionKey: Buffer;

  constructor(store: MemoryStore, encryptionKey?: Buffer) {
    this.store = store;
    this.encryptionKey = encryptionKey || crypto.randomBytes(32);
  }

  async save(key: string, data: unknown): Promise<void> {
    const plaintext = Buffer.from(JSON.stringify(data));
    const encrypted = aes.encrypt(this.encryptionKey, plaintext, Buffer.from(key));
    const blob = Buffer.from(
      JSON.stringify({
        c: encrypted.ciphertext.toString("base64"),
        iv: encrypted.iv.toString("base64"),
        t: encrypted.authTag.toString("base64"),
      })
    );
    await this.store.set(key, blob);
  }

  async load<T>(key: string): Promise<T | null> {
    const blob = await this.store.get(key);
    if (!blob) return null;

    const { c, iv, t } = JSON.parse(blob.toString());
    const decrypted = aes.decrypt(this.encryptionKey, {
      ciphertext: Buffer.from(c, "base64"),
      iv: Buffer.from(iv, "base64"),
      authTag: Buffer.from(t, "base64"),
      aad: Buffer.from(key),
    });

    return JSON.parse(decrypted.toString()) as T;
  }

  async delete(key: string): Promise<void> {
    await this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }
}
