/**
 * SPEAQ Core - HKDF-SHA256 Key Derivation
 * RFC 5869 - derives encryption keys from shared secrets
 * PRD Section 3.2: Laag 2 - HKDF-SHA256
 */

import crypto from "crypto";

/**
 * HKDF Extract: HMAC-SHA256(salt, ikm) -> PRK
 */
export function extract(
  salt: Buffer,
  inputKeyMaterial: Buffer
): Buffer {
  return crypto.createHmac("sha256", salt).update(inputKeyMaterial).digest();
}

/**
 * HKDF Expand: derives output key material from PRK
 */
export function expand(
  prk: Buffer,
  info: Buffer,
  length: number = 32
): Buffer {
  const hashLen = 32; // SHA-256 output
  const n = Math.ceil(length / hashLen);
  const output = Buffer.alloc(n * hashLen);
  let prev = Buffer.alloc(0);

  for (let i = 1; i <= n; i++) {
    prev = crypto
      .createHmac("sha256", prk)
      .update(Buffer.concat([prev, info, Buffer.from([i])]))
      .digest();
    prev.copy(output, (i - 1) * hashLen);
  }

  return output.subarray(0, length);
}

/**
 * HKDF full: extract + expand in one call
 * @param ikm - input key material (e.g. Kyber shared secret)
 * @param salt - optional salt (random bytes recommended)
 * @param info - context string (e.g. "speaq-message-key")
 * @param length - output key length in bytes (default 32 for AES-256)
 */
export function deriveKey(
  ikm: Buffer,
  salt: Buffer = crypto.randomBytes(32),
  info: string = "speaq-v1",
  length: number = 32
): { key: Buffer; salt: Buffer } {
  const prk = extract(salt, ikm);
  const key = expand(prk, Buffer.from(info), length);
  return { key, salt };
}
