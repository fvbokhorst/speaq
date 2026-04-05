/**
 * SPEAQ Crypto Service (React Native)
 * AES-256 encryption for all messages
 * Uses crypto-js (pure JS, no native dependencies)
 */

import CryptoJS from "crypto-js";

const contactKeys = new Map<string, string>();

/**
 * Derive encryption key for a contact pair
 * Both sides derive the same key from sorted SPEAQ IDs
 * In production: replaced by Kyber key exchange + HKDF
 */
export function getContactKey(myId: string, contactId: string): string {
  const pairId = [myId, contactId].sort().join(":");
  if (contactKeys.has(pairId)) return contactKeys.get(pairId)!;

  const key = CryptoJS.SHA256(pairId + ":speaq-quantum-v1").toString();
  contactKeys.set(pairId, key);
  return key;
}

/**
 * Encrypt a message with AES-256
 */
export function encryptMessage(key: string, plaintext: string): string {
  const encrypted = CryptoJS.AES.encrypt(plaintext, key).toString();
  return encrypted;
}

/**
 * Decrypt a message with AES-256
 */
export function decryptMessage(key: string, ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, key);
  return bytes.toString(CryptoJS.enc.Utf8);
}

/**
 * Generate a cryptographically random SPEAQ ID
 */
export function generateSecureId(): string {
  return CryptoJS.lib.WordArray.random(8).toString(CryptoJS.enc.Hex);
}

/**
 * Hash content (for Witness Mode)
 */
export function sha256(content: string): string {
  return CryptoJS.SHA256(content).toString();
}
