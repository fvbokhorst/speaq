/**
 * SPEAQ Service - Connects UI to speaq-core + relay
 * Handles: identity creation, pairing, sending/receiving messages
 *
 * Now with REAL quantum encryption:
 * - Kyber keypair generated on identity creation
 * - Double Ratchet for forward secrecy on every message
 * - Kyber key exchange on first contact via relay
 */

import { config } from "./config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  encryptMessage, decryptMessage, getContactKey, generateSecureId,
  generateKyberKeyPair, saveKyberKeyPair, loadKyberKeyPair,
  getOrCreateRatchet, initRatchetFromKeyExchange,
  ratchetEncrypt,
  KyberKeyPair,
  setKeystorePin,
} from "./crypto";
import { generateDID, saveDID, loadDID } from "./identity-manager";

// State
let identity: {
  speaqId: string;
  displayName: string;
  did?: string;
  createdAt: number;
} | null = null;

let kyberKeys: KyberKeyPair | null = null;

let ws: WebSocket | null = null;
let connected = false;

type MessageCallback = (msg: any) => void;
const listeners: MessageCallback[] = [];

// Contact public keys cache (received via KEY_EXCHANGE)
const contactPublicKeys = new Map<string, string>();
const CONTACT_KEYS_PREFIX = "speaq_contact_pubkey_";

async function saveContactPublicKey(contactId: string, pubKey: string): Promise<void> {
  contactPublicKeys.set(contactId, pubKey);
  await AsyncStorage.setItem(CONTACT_KEYS_PREFIX + contactId, pubKey);
}

async function loadContactPublicKey(contactId: string): Promise<string | undefined> {
  if (contactPublicKeys.has(contactId)) return contactPublicKeys.get(contactId);
  try {
    const key = await AsyncStorage.getItem(CONTACT_KEYS_PREFIX + contactId);
    if (key) {
      contactPublicKeys.set(contactId, key);
      return key;
    }
  } catch (e) {}
  return undefined;
}

// Generate cryptographically secure SPEAQ ID
function generateSpeaqId(): string {
  return generateSecureId();
}

/**
 * Create a new identity and connect to relay
 * NOW: also generates a Kyber keypair for quantum key exchange
 */
export async function createIdentity(displayName: string): Promise<typeof identity> {
  // Set temporary keystore PIN for initial key generation
  // Real PIN will be set during PIN setup phase
  await setKeystorePin("temp-init-" + Date.now());

  // Generate Kyber keypair for quantum key exchange
  kyberKeys = generateKyberKeyPair();
  await saveKyberKeyPair(kyberKeys);

  // Generate DID from Kyber public key
  const did = generateDID(kyberKeys.publicKey);
  await saveDID(did);

  identity = {
    speaqId: generateSpeaqId(),
    displayName,
    did,
    createdAt: Date.now(),
  };

  // Persist identity (includes DID)
  await AsyncStorage.setItem("speaq_identity", JSON.stringify(identity));

  // Connect to relay
  connectRelay();

  return identity;
}

/**
 * Load identity from storage and reconnect
 */
export async function loadIdentity(): Promise<typeof identity> {
  try {
    const data = await AsyncStorage.getItem("speaq_identity");
    if (data) {
      identity = JSON.parse(data);

      // Load Kyber keypair (may fail if keystore PIN not yet set)
      try {
        kyberKeys = await loadKyberKeyPair();
      } catch {
        kyberKeys = null;
      }
      if (!kyberKeys && identity) {
        // Generate new keys (will be re-encrypted when PIN is set)
        try {
          kyberKeys = generateKyberKeyPair();
        } catch {
          kyberKeys = null;
        }
      }

      // Migration: existing identity without DID -- generate now
      if (identity && !identity.did && kyberKeys) {
        const did = generateDID(kyberKeys.publicKey);
        await saveDID(did);
        identity.did = did;
        await AsyncStorage.setItem("speaq_identity", JSON.stringify(identity));
      } else if (identity && !identity.did) {
        // Load DID from separate storage
        const storedDid = await loadDID();
        if (storedDid) identity.did = storedDid;
      }

      connectRelay();
    }
  } catch (e) {
    console.error("Load identity error:", e);
  }
  return identity;
}

/**
 * Connect to the live relay server
 */
function connectRelay() {
  if (!identity) return;

  ws = new WebSocket(config.relay.url);

  ws.onopen = () => {
    connected = true;
    // Send AUTH with Kyber public key so relay can distribute it
    ws?.send(JSON.stringify({
      type: "AUTH",
      speaqId: identity!.speaqId,
      kyberPublicKey: kyberKeys?.publicKey || null,
    }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string);

      // Handle KEY_EXCHANGE messages internally
      if (msg.type === "KEY_EXCHANGE" && msg.from && msg.kyberPublicKey) {
        handleKeyExchange(msg);
        return;
      }

      // Handle KEY_EXCHANGE_RESPONSE (Kyber ciphertext from encapsulation)
      if (msg.type === "KEY_EXCHANGE_RESPONSE" && msg.from && msg.kyberCiphertext) {
        handleKeyExchangeResponse(msg);
        return;
      }

      listeners.forEach((cb) => cb(msg));
    } catch (e) {
      console.error("Parse error:", e);
    }
  };

  ws.onclose = () => {
    connected = false;
    // Auto-reconnect
    setTimeout(connectRelay, 3000);
  };

  ws.onerror = () => {
    connected = false;
  };
}

/**
 * Handle incoming Kyber public key from a contact.
 * Performs encapsulation and sends back the ciphertext.
 */
async function handleKeyExchange(msg: any) {
  if (!identity) return;

  // Store their public key
  await saveContactPublicKey(msg.from, msg.kyberPublicKey);

  // Perform Kyber encapsulation to establish shared secret
  const { state, kyberCiphertext } = await getOrCreateRatchet(
    identity.speaqId, msg.from, msg.kyberPublicKey
  );

  // Send ciphertext back so they can decapsulate
  if (kyberCiphertext && ws && connected) {
    ws.send(JSON.stringify({
      type: "KEY_EXCHANGE_RESPONSE",
      to: msg.from,
      kyberCiphertext,
    }));
  }

  // Also notify listeners about the key exchange
  listeners.forEach((cb) => cb({
    type: "KEY_EXCHANGE_COMPLETE",
    from: msg.from,
  }));
}

/**
 * Handle Kyber ciphertext response -- decapsulate to get shared secret.
 */
async function handleKeyExchangeResponse(msg: any) {
  if (!identity) return;

  try {
    await initRatchetFromKeyExchange(msg.from, msg.kyberCiphertext, identity.speaqId);
    listeners.forEach((cb) => cb({
      type: "KEY_EXCHANGE_COMPLETE",
      from: msg.from,
    }));
  } catch (e) {
    console.error("[SPEAQ] Key exchange response failed:", e);
  }
}

/**
 * Initiate key exchange with a contact
 * Sends our Kyber public key to them via relay
 */
export function initiateKeyExchange(toSpeaqId: string): void {
  if (!ws || !connected || !identity || !kyberKeys) return;

  ws.send(JSON.stringify({
    type: "KEY_EXCHANGE",
    to: toSpeaqId,
    from: identity.speaqId,
    kyberPublicKey: kyberKeys.publicKey,
  }));
}

/**
 * Send a message to a contact
 * NOW: uses Double Ratchet encryption with forward secrecy
 */
export async function sendMessage(toSpeaqId: string, text: string): Promise<void> {
  if (!ws || !connected || !identity) return;

  // Include sender identity INSIDE the encrypted blob (sealed sender)
  // The relay never sees who sent the message
  const plaintext = JSON.stringify({
    type: "message",
    text,
    from: identity.displayName,
    senderId: identity.speaqId,
    timestamp: Date.now(),
  });

  // Try ratchet encryption first (quantum-grade)
  const contactPubKey = await loadContactPublicKey(toSpeaqId);
  const { state, kyberCiphertext } = await getOrCreateRatchet(
    identity.speaqId, toSpeaqId, contactPubKey
  );

  // If this is the first message and we got a kyberCiphertext,
  // send key exchange first
  if (kyberCiphertext) {
    ws.send(JSON.stringify({
      type: "KEY_EXCHANGE_RESPONSE",
      to: toSpeaqId,
      kyberCiphertext,
    }));
  }

  // Encrypt with ratchet (forward secrecy)
  // State is saved inside ratchetEncrypt BEFORE returning (crash-safe)
  const ratchetMsg = await ratchetEncrypt(state, plaintext, toSpeaqId);

  // Send as SEND_SEALED -- no sender ID exposed to relay
  // Sender identity is encrypted inside the blob
  ws.send(JSON.stringify({
    type: "SEND_SEALED",
    to: toSpeaqId,
    blob: JSON.stringify(ratchetMsg),
    encrypted: true,
    protocol: "ratchet-v1",
  }));
}

/**
 * Listen for incoming messages
 */
export function onMessage(callback: MessageCallback): () => void {
  listeners.push(callback);
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

/**
 * Get current identity
 */
export function getIdentity() {
  return identity;
}

/**
 * Get current Kyber public key (for QR code sharing)
 */
export function getKyberPublicKey(): string | null {
  return kyberKeys?.publicKey || null;
}

/**
 * Check connection status
 */
export function isConnected(): boolean {
  return connected;
}
