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
  generateKyberKeyPair, saveKyberKeyPair, loadKyberKeyPair, isLegacyKyberKey,
  getOrCreateRatchet, initRatchetFromKeyExchange,
  ratchetEncrypt,
  KyberKeyPair,
  getOrCreateSigningKeys, signData, verifySignature,
  saveContactSigningKey, loadContactSigningKey,
  SigningKeyPair,
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
let signingKeys: SigningKeyPair | null = null;

async function ensureSigningKeys(): Promise<SigningKeyPair> {
  if (signingKeys) return signingKeys;
  signingKeys = await getOrCreateSigningKeys();
  return signingKeys;
}

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
  // Generate Kyber keypair for quantum key exchange
  kyberKeys = generateKyberKeyPair();
  await saveKyberKeyPair(kyberKeys);

  // E1-N: generate ML-DSA-65 signing keypair so KEY_EXCHANGE can be signed.
  await ensureSigningKeys();

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

      // Load Kyber keypair. D1 audit fix: detect legacy (homemade ring-LWE) keys
      // and regenerate with FIPS 203 ML-KEM-768. Existing ratchet states retain
      // their sharedSecret so old conversations remain readable; only NEW key
      // exchanges with contacts use the upgraded keys.
      kyberKeys = await loadKyberKeyPair();
      if (kyberKeys && isLegacyKyberKey(kyberKeys.publicKey)) {
        console.warn("[SPEAQ] Legacy Kyber keys detected - regenerating with FIPS 203 ML-KEM-768");
        kyberKeys = generateKyberKeyPair();
        await saveKyberKeyPair(kyberKeys);
      }
      if (!kyberKeys && identity) {
        // Migration: existing identity without Kyber keys -- generate now (FIPS 203)
        kyberKeys = generateKyberKeyPair();
        await saveKyberKeyPair(kyberKeys);
      }

      // E1-N: lazy-init signing keys for existing identities (audit hardening 2026-04-26)
      await ensureSigningKeys();

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
        handleKeyExchange(msg).catch((e) => console.error("[SPEAQ] handleKeyExchange failed:", e));
        return;
      }

      // Handle KEY_EXCHANGE_RESPONSE (Kyber ciphertext from encapsulation)
      if (msg.type === "KEY_EXCHANGE_RESPONSE" && msg.from && msg.kyberCiphertext) {
        handleKeyExchangeResponse(msg).catch((e) => console.error("[SPEAQ] handleKeyExchangeResponse failed:", e));
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
 * E1-N audit hardening (2026-04-26): verify a peer's signature on the data they
 * are claiming, AND check the signing key has not changed since first contact.
 * Fail-closed: missing fields, bad signature, or key-rotation all REJECT.
 *
 * Returns true if the message can be trusted; false (and logs) otherwise.
 */
async function verifyAndPinSigningKey(
  contactId: string,
  signedData: string,
  sig: string | undefined,
  signPub: string | undefined,
): Promise<boolean> {
  if (!sig || !signPub) {
    console.warn("[SPEAQ] KEY_EXCHANGE REJECTED from", contactId, "- missing signature (fail-closed)");
    return false;
  }
  if (!verifySignature(signedData, sig, signPub)) {
    console.warn("[SPEAQ] KEY_EXCHANGE signature INVALID from", contactId);
    return false;
  }
  const knownKey = await loadContactSigningKey(contactId);
  if (knownKey && knownKey !== signPub) {
    console.warn("[SPEAQ] KEY_EXCHANGE REJECTED from", contactId, "- signing key changed since first contact (possible MITM)");
    return false;
  }
  if (!knownKey) {
    // TOFU: trust on first use, pin from now on.
    await saveContactSigningKey(contactId, signPub);
  }
  return true;
}

/**
 * Handle incoming Kyber public key from a contact.
 * E1-N hardening: requires valid signature on kyberPublicKey + key-change rejection.
 * Performs encapsulation and sends back the ciphertext (also signed).
 */
async function handleKeyExchange(msg: any) {
  if (!identity) return;

  // E1-N: verify the sender's signature on their kyberPublicKey before trusting it.
  if (!(await verifyAndPinSigningKey(msg.from, msg.kyberPublicKey, msg.sig, msg.signPub))) {
    return;
  }

  // Store their public key
  await saveContactPublicKey(msg.from, msg.kyberPublicKey);

  // Perform Kyber encapsulation to establish shared secret
  const { state, kyberCiphertext } = await getOrCreateRatchet(
    identity.speaqId, msg.from, msg.kyberPublicKey
  );

  // Send ciphertext back so they can decapsulate.
  // E1-N: sign the ciphertext so the peer can verify it came from us.
  if (kyberCiphertext && ws && connected) {
    const keys = await ensureSigningKeys();
    ws.send(JSON.stringify({
      type: "KEY_EXCHANGE_RESPONSE",
      to: msg.from,
      kyberCiphertext,
      sig: signData(kyberCiphertext, keys.privateKey),
      signPub: keys.publicKey,
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
 * E1-N hardening: requires valid signature on kyberCiphertext + pinned-key check.
 */
async function handleKeyExchangeResponse(msg: any) {
  if (!identity) return;

  if (!(await verifyAndPinSigningKey(msg.from, msg.kyberCiphertext, msg.sig, msg.signPub))) {
    return;
  }

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
 * Initiate key exchange with a contact.
 * E1-N: signs our Kyber publicKey so the peer can verify it came from us
 * and detect tampering / MITM via key-replacement at the relay layer.
 */
export async function initiateKeyExchange(toSpeaqId: string): Promise<void> {
  if (!ws || !connected || !identity || !kyberKeys) return;
  const keys = await ensureSigningKeys();

  ws.send(JSON.stringify({
    type: "KEY_EXCHANGE",
    to: toSpeaqId,
    from: identity.speaqId,
    kyberPublicKey: kyberKeys.publicKey,
    sig: signData(kyberKeys.publicKey, keys.privateKey),
    signPub: keys.publicKey,
  }));
}

// Track which contacts already received our photo this session (max 3 per contact)
const photoSentThisSession = new Map<string, number>();

/**
 * Send a message to a contact
 * NOW: uses Double Ratchet encryption with forward secrecy
 */
export async function sendMessage(toSpeaqId: string, text: string): Promise<void> {
  if (!ws || !connected || !identity) return;

  // Include profile photo with first 3 messages per session to each contact
  let photo: string | undefined;
  const sentCount = photoSentThisSession.get(toSpeaqId) || 0;
  if (sentCount < 3) {
    try {
      const storedPhoto = await AsyncStorage.getItem("speaq_profile_photo");
      if (storedPhoto) {
        photo = storedPhoto;
        photoSentThisSession.set(toSpeaqId, sentCount + 1);
      }
    } catch (e) {}
  }

  // Include sender identity INSIDE the encrypted blob (sealed sender)
  // The relay never sees who sent the message
  const payload: any = {
    type: "message",
    text,
    from: identity.displayName,
    senderId: identity.speaqId,
    timestamp: Date.now(),
  };
  if (photo) payload.photo = photo;
  const plaintext = JSON.stringify(payload);

  // Try ratchet encryption first (quantum-grade)
  const contactPubKey = await loadContactPublicKey(toSpeaqId);
  const { state, kyberCiphertext } = await getOrCreateRatchet(
    identity.speaqId, toSpeaqId, contactPubKey
  );

  // If this is the first message and we got a kyberCiphertext,
  // send key exchange first. E1-N: sign the ciphertext.
  if (kyberCiphertext) {
    const keys = await ensureSigningKeys();
    ws.send(JSON.stringify({
      type: "KEY_EXCHANGE_RESPONSE",
      to: toSpeaqId,
      kyberCiphertext,
      sig: signData(kyberCiphertext, keys.privateKey),
      signPub: keys.publicKey,
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
 * Send a QC payment to a contact (encrypted via ratchet)
 */
export async function sendQCPayment(toSpeaqId: string, amount: number): Promise<void> {
  if (!ws || !connected || !identity) return;

  // Load profile photo for payment messages
  let photo: string | undefined;
  try {
    const storedPhoto = await AsyncStorage.getItem("speaq_profile_photo");
    if (storedPhoto) photo = storedPhoto;
  } catch (e) {}

  const payload: any = {
    type: "message",
    qc: true,
    amount,
    from: identity.displayName,
    senderId: identity.speaqId,
    fromName: identity.displayName,
    text: `[Payment: ${amount.toFixed(4)} QC]`,
    timestamp: Date.now(),
  };
  if (photo) payload.photo = photo;
  const plaintext = JSON.stringify(payload);

  const contactPubKey = await loadContactPublicKey(toSpeaqId);
  const { state, kyberCiphertext } = await getOrCreateRatchet(
    identity.speaqId, toSpeaqId, contactPubKey
  );

  if (kyberCiphertext) {
    const keys = await ensureSigningKeys();
    ws.send(JSON.stringify({
      type: "KEY_EXCHANGE_RESPONSE",
      to: toSpeaqId,
      kyberCiphertext,
      sig: signData(kyberCiphertext, keys.privateKey),
      signPub: keys.publicKey,
    }));
  }

  const ratchetMsg = await ratchetEncrypt(state, plaintext, toSpeaqId);

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

/**
 * Apple Guideline 1.2 - send a server-side BLOCK so the relay drops
 * future SENDs from `targetSpeaqId` to me. Best-effort: if WS is not
 * open the local AsyncStorage block list still applies as a safety net.
 */
export function sendBlock(targetSpeaqId: string): void {
  if (!ws || !connected) return;
  try {
    ws.send(JSON.stringify({ type: "BLOCK", targetSpeaqId }));
  } catch (e) {
    console.warn("[block] WS BLOCK send failed:", (e as Error).message);
  }
}

/**
 * Apple Guideline 1.2 - inverse of sendBlock.
 */
export function sendUnblock(targetSpeaqId: string): void {
  if (!ws || !connected) return;
  try {
    ws.send(JSON.stringify({ type: "UNBLOCK", targetSpeaqId }));
  } catch (e) {
    console.warn("[block] WS UNBLOCK send failed:", (e as Error).message);
  }
}
