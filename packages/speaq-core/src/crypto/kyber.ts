/**
 * SPEAQ Core - CRYSTALS-Kyber-768 Key Exchange
 * PRD Section 3.1: Laag 5 - Quantum Key Exchange
 * PRD Section 3.4: FIPS 203, NIST Level 3
 *
 * Post-quantum key encapsulation mechanism.
 * Shor's algorithm cannot break lattice-based cryptography.
 */

import pkg from "crystals-kyber";
const { KeyGen768, Encrypt768, Decrypt768 } = pkg;

export interface KyberKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface KyberEncapsulation {
  ciphertext: Uint8Array;
  sharedSecret: Uint8Array;
}

/**
 * Generate a Kyber-768 keypair
 * Public key: 1184 bytes
 * Private key: 2400 bytes
 */
export async function generateKeyPair(): Promise<KyberKeyPair> {
  const [publicKey, privateKey] = await KeyGen768();
  return { publicKey, privateKey };
}

/**
 * Encapsulate: create shared secret using recipient's public key
 * Only the recipient can recover the shared secret using their private key
 *
 * @param publicKey - recipient's Kyber public key (1184 bytes)
 * @returns ciphertext (1088 bytes) + sharedSecret (32 bytes)
 */
export async function encapsulate(
  publicKey: Uint8Array
): Promise<KyberEncapsulation> {
  const [ciphertext, sharedSecret] = await Encrypt768(publicKey);
  return { ciphertext, sharedSecret };
}

/**
 * Decapsulate: recover shared secret using own private key
 *
 * @param ciphertext - Kyber ciphertext from encapsulate (1088 bytes)
 * @param privateKey - own Kyber private key (2400 bytes)
 * @returns sharedSecret (32 bytes) - identical to encapsulator's secret
 */
export async function decapsulate(
  ciphertext: Uint8Array,
  privateKey: Uint8Array
): Promise<Uint8Array> {
  return await Decrypt768(ciphertext, privateKey);
}
