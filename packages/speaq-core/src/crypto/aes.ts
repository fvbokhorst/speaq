/**
 * SPEAQ Core - AES-256-GCM Encryption
 * Quantum-resistant symmetric encryption with authenticated data
 */

import crypto from "crypto";

export interface EncryptedMessage {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  aad: Buffer;
}

/**
 * Encrypt plaintext with AES-256-GCM
 * @param key - 32-byte encryption key
 * @param plaintext - data to encrypt
 * @param aad - associated authenticated data (verified but not encrypted)
 */
export function encrypt(
  key: Buffer,
  plaintext: Buffer,
  aad: Buffer = Buffer.from("speaq-v1")
): EncryptedMessage {
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return { ciphertext, iv, authTag, aad };
}

/**
 * Decrypt AES-256-GCM ciphertext
 * @param key - 32-byte encryption key
 * @param encrypted - encrypted message with iv, authTag, aad
 */
export function decrypt(key: Buffer, encrypted: EncryptedMessage): Buffer {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, encrypted.iv);
  decipher.setAuthTag(encrypted.authTag);
  decipher.setAAD(encrypted.aad);

  return Buffer.concat([
    decipher.update(encrypted.ciphertext),
    decipher.final(),
  ]);
}
