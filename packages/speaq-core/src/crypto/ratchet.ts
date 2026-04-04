/**
 * SPEAQ Core - Double Ratchet Protocol
 * PRD Section 3.2: Laag 4 - Forward Secrecy
 * PRD Section 3.3: Per bericht nieuwe key, compromised key = alleen DAT bericht
 *
 * Based on Signal's Double Ratchet Algorithm, adapted for Kyber key exchange.
 * Every message uses a unique encryption key that is deleted after use.
 */

import crypto from "crypto";
import * as aes from "./aes";

export interface RatchetHeader {
  publicKey: Uint8Array; // Current ephemeral public key
  previousChainLength: number;
  messageNumber: number;
}

export interface RatchetMessage {
  header: RatchetHeader;
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

export interface RatchetState {
  rootKey: Buffer;
  chainKeySend: Buffer | null;
  chainKeyRecv: Buffer | null;
  sendCount: number;
  recvCount: number;
  previousChainLength: number;
}

/**
 * Initialize a new ratchet state from a shared secret
 * Called after Kyber key exchange completes
 *
 * @param sharedSecret - 32-byte secret from Kyber encapsulation
 * @param isInitiator - true for Alice (sender of first message)
 */
export function initState(
  sharedSecret: Buffer,
  isInitiator: boolean
): RatchetState {
  // Derive root key and initial chain keys from shared secret
  const rootKey = crypto
    .createHmac("sha256", Buffer.from("speaq-root"))
    .update(sharedSecret)
    .digest();

  const chainKey = crypto
    .createHmac("sha256", rootKey)
    .update(Buffer.from("speaq-chain"))
    .digest();

  return {
    rootKey,
    chainKeySend: isInitiator ? chainKey : null,
    chainKeyRecv: isInitiator ? null : chainKey,
    sendCount: 0,
    recvCount: 0,
    previousChainLength: 0,
  };
}

/**
 * Advance the chain key and derive a message key
 * PRD Section 3.3: chainKey = HMAC-SHA256(chainKey, 0x01), messageKey = HMAC-SHA256(chainKey, 0x02)
 */
function advanceChain(chainKey: Buffer): {
  nextChainKey: Buffer;
  messageKey: Buffer;
} {
  const nextChainKey = crypto
    .createHmac("sha256", chainKey)
    .update(Buffer.from([0x01]))
    .digest();

  const messageKey = crypto
    .createHmac("sha256", chainKey)
    .update(Buffer.from([0x02]))
    .digest();

  return { nextChainKey, messageKey };
}

/**
 * Encrypt a message using the sending chain
 * Each call advances the ratchet - the key used is immediately discarded
 *
 * @param state - current ratchet state (MUTATED)
 * @param plaintext - message to encrypt
 * @returns encrypted message with header
 */
export function ratchetEncrypt(
  state: RatchetState,
  plaintext: Buffer
): RatchetMessage {
  if (!state.chainKeySend) {
    throw new Error("Send chain not initialized - waiting for DH ratchet step");
  }

  // Advance chain and get message key
  const { nextChainKey, messageKey } = advanceChain(state.chainKeySend);

  // Create header with current state
  const header: RatchetHeader = {
    publicKey: new Uint8Array(0), // Set by DH ratchet layer
    previousChainLength: state.previousChainLength,
    messageNumber: state.sendCount,
  };

  // Encrypt with AES-256-GCM using the message key
  const headerBytes = Buffer.from(JSON.stringify({
    pn: header.previousChainLength,
    n: header.messageNumber,
  }));

  const encrypted = aes.encrypt(messageKey, plaintext, headerBytes);

  // Update state: advance chain, increment counter, DISCARD message key
  state.chainKeySend = nextChainKey;
  state.sendCount++;
  // messageKey is NOT stored - forward secrecy

  return {
    header,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
  };
}

/**
 * Decrypt a message using the receiving chain
 * Each call advances the ratchet
 *
 * @param state - current ratchet state (MUTATED)
 * @param message - encrypted message with header
 * @returns decrypted plaintext
 */
export function ratchetDecrypt(
  state: RatchetState,
  message: RatchetMessage
): Buffer {
  if (!state.chainKeyRecv) {
    throw new Error(
      "Receive chain not initialized - waiting for DH ratchet step"
    );
  }

  // Advance receive chain to the correct position
  let chainKey = state.chainKeyRecv;
  for (let i = state.recvCount; i < message.header.messageNumber; i++) {
    const { nextChainKey } = advanceChain(chainKey);
    chainKey = nextChainKey;
  }

  // Get the message key for this specific message
  const { nextChainKey, messageKey } = advanceChain(chainKey);

  // Reconstruct AAD from header
  const headerBytes = Buffer.from(JSON.stringify({
    pn: message.header.previousChainLength,
    n: message.header.messageNumber,
  }));

  // Decrypt
  const plaintext = aes.decrypt(messageKey, {
    ciphertext: message.ciphertext,
    iv: message.iv,
    authTag: message.authTag,
    aad: headerBytes,
  });

  // Update state
  state.chainKeyRecv = nextChainKey;
  state.recvCount = message.header.messageNumber + 1;

  return plaintext;
}
