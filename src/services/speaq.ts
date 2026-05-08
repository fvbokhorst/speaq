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
  ratchetEncrypt, ratchetDecrypt, loadRatchetState,
  KyberKeyPair,
  getOrCreateSigningKeys, signData, verifySignature,
  saveContactSigningKey, loadContactSigningKey,
  ensureKeystoreSalt,
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

// Rate-limit incoming KEY_EXCHANGE rekeys: a signed peer should not be able to
// force the local ratchet to reset more than once per minute. Without this, a
// peer (or an attacker who has somehow obtained the peer's signing key) could
// loop KEY_EXCHANGE messages and indefinitely block message delivery while the
// ratchet is rebuilt each time. 60s window is enough to cover legitimate
// reconnect / reinstall flows without enabling rapid-fire DoS.
const REKEY_MIN_INTERVAL_MS = 60_000;
const lastRekeyAt: Map<string, number> = new Map();

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
  const tStart = Date.now();
  console.warn("[TIMING] createIdentity START name=" + displayName);
  // Provision a device-bound persistent salt BEFORE any keystore-encrypted save.
  // PIN-keystore-key derivation reads this salt; setting it up-front keeps the
  // wrap-key stable across app restarts. ensureKeystoreSalt is idempotent.
  await ensureKeystoreSalt();
  console.warn("[TIMING] createIdentity ensureKeystoreSalt done after " + (Date.now() - tStart) + "ms");

  // Generate Kyber keypair for quantum key exchange
  kyberKeys = generateKyberKeyPair();
  await saveKyberKeyPair(kyberKeys);
  console.warn("[TIMING] createIdentity Kyber+save done after " + (Date.now() - tStart) + "ms");

  // E1-N: generate ML-DSA-65 signing keypair so KEY_EXCHANGE can be signed.
  await ensureSigningKeys();
  console.warn("[TIMING] createIdentity ensureSigningKeys done after " + (Date.now() - tStart) + "ms");

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
  console.warn("[TIMING] createIdentity DID+identity-save done after " + (Date.now() - tStart) + "ms");

  // Connect to relay
  connectRelay();
  console.warn("[TIMING] createIdentity TOTAL " + (Date.now() - tStart) + "ms (relay connect dispatched)");

  return identity;
}

/**
 * Load identity from storage and reconnect
 */
export async function loadIdentity(): Promise<typeof identity> {
  const tStart = Date.now();
  try {
    const data = await AsyncStorage.getItem("speaq_identity");
    console.warn("[TIMING] loadIdentity AsyncStorage.getItem identity done after " + (Date.now() - tStart) + "ms");
    if (data) {
      identity = JSON.parse(data);

      // F6 PIN-unlock latency optimisation: previously these two crypto-heavy
      // decrypts ran sequentially, accounting for ~3-5s on iPhone. They have
      // no inter-dependency (signingKeys cache lives in module scope, kyberKeys
      // load is independent), so Promise.all halves the wall-clock time.
      // D1 audit fix: detect legacy (homemade ring-LWE) keys and regenerate
      // with FIPS 203 ML-KEM-768. Existing ratchet states retain their
      // sharedSecret so old conversations remain readable; only NEW key
      // exchanges with contacts use the upgraded keys.
      const [loadedKyber] = await Promise.all([
        loadKyberKeyPair(),
        ensureSigningKeys(), // E1-N: lazy-init signing keys (audit hardening 2026-04-26)
      ]);
      kyberKeys = loadedKyber;
      console.warn("[TIMING] loadIdentity kyber+signing parallel decrypt done after " + (Date.now() - tStart) + "ms");

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
      console.warn("[TIMING] loadIdentity TOTAL " + (Date.now() - tStart) + "ms (relay connect dispatched)");
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
      console.warn("[SPEAQ-LOG] ws.onmessage type=" + msg.type + " from=" + (msg.from||"?") + " keys=" + Object.keys(msg).join(","));

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

      // Handle RECEIVE_SEALED: relay strips `from` field for sender-anonymity
      // (sealed sender mode). Enumerate stored ratchet states and try decrypt
      // on each to discover the sender. Mirrors PWA fix from speaq-web@12b1496
      // (2026-04-30). Without this, sealed messages from native peers are
      // silently dropped because ChatScreen filters on `msg.from === contactId`.
      if (msg.type === "RECEIVE_SEALED" && !msg.from && msg.blob) {
        handleSealedReceive(msg).catch((e) => console.error("[SPEAQ] handleSealedReceive failed:", e));
        return;
      }

      // Dispatch call-signaling to callService. The standalone RelayService in
      // services/relay.ts is never connected (no .connect() call site), so
      // every CALL_* message must be routed through this WebSocket. Lazy import
      // to avoid a circular module-load between speaq.ts and call.ts.
      if (msg.type === "CALL_OFFER" || msg.type === "CALL_ANSWER" ||
          msg.type === "ICE_CANDIDATE" || msg.type === "CALL_END" ||
          msg.type === "CALL_REJECT" || msg.type === "CALL_UNAVAILABLE") {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { callService } = require("./call");
          if (msg.type === "CALL_OFFER") callService.handleOffer(msg);
          else if (msg.type === "CALL_ANSWER") callService.handleAnswer(msg);
          else if (msg.type === "ICE_CANDIDATE") callService.handleIceCandidate(msg);
          else if (msg.type === "CALL_END") callService.handleEnd(msg);
          else if (msg.type === "CALL_REJECT") callService.handleReject(msg);
          else if (msg.type === "CALL_UNAVAILABLE") callService.handleUnavailable(msg);
        } catch (e) {
          console.error("[SPEAQ] CALL_* dispatch failed:", (e as Error).message);
        }
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
  const knownKey = await loadContactSigningKey(contactId);

  // Once a peer's signing key is pinned, every subsequent KEY_EXCHANGE must
  // come from that exact key AND carry a valid signature over the data they
  // are claiming. This is the strict path for already-known peers.
  if (knownKey) {
    if (!sig || !signPub) {
      console.warn("[SPEAQ] KEY_EXCHANGE REJECTED from", contactId, "- missing signature (fail-closed, pinned)");
      return false;
    }
    if (knownKey !== signPub) {
      console.warn("[SPEAQ] KEY_EXCHANGE REJECTED from", contactId, "- signing key changed since first contact (possible MITM)");
      return false;
    }
    if (!verifySignature(signedData, sig, signPub)) {
      console.warn("[SPEAQ] KEY_EXCHANGE signature INVALID from", contactId);
      return false;
    }
    return true;
  }

  // First contact (TOFU - trust on first use). PWA peers running the
  // legacy ECDSA P-256 signing path emit signatures that native's dual-
  // scheme verifySignature can validate, but older PWA builds may emit
  // signatures in formats this binary cannot parse. Per the 2026-05-01
  // PWA<->Native handover, in this specific window we accept any non-empty
  // signing key on first contact and pin it; subsequent messages are
  // strict. Without this, PWA peers cannot complete the first
  // KEY_EXCHANGE and every subsequent sealed message decrypts to the
  // "encrypted message" placeholder.
  if (!signPub) {
    console.warn("[SPEAQ] KEY_EXCHANGE REJECTED from", contactId, "- missing signing key on first contact");
    return false;
  }
  if (sig && verifySignature(signedData, sig, signPub)) {
    console.log("[SPEAQ] KEY_EXCHANGE TOFU pin (verified) from", contactId);
  } else {
    console.warn("[SPEAQ] KEY_EXCHANGE TOFU pin (signature unverified, cross-scheme) from", contactId);
  }
  await saveContactSigningKey(contactId, signPub);
  return true;
}

/**
 * Handle incoming Kyber public key from a contact.
 * E1-N hardening: requires valid signature on kyberPublicKey + key-change rejection.
 * Performs encapsulation and sends back the ciphertext (also signed).
 */
async function handleKeyExchange(msg: any) {
  if (!identity) return;
  console.warn("[SPEAQ-LOG] handleKeyExchange from=" + msg.from + " pkLen=" + (msg.kyberPublicKey?.length||0) + " sigLen=" + (msg.sig?.length||0));

  // E1-N: verify the sender's signature on their kyberPublicKey before trusting it.
  if (!(await verifyAndPinSigningKey(msg.from, msg.kyberPublicKey, msg.sig, msg.signPub))) {
    console.warn("[SPEAQ-LOG] handleKeyExchange REJECTED (signature/pinning) from=" + msg.from);
    return;
  }

  // Rate-limit rekeys per peer: drop redundant KEY_EXCHANGEs within REKEY_MIN_INTERVAL_MS.
  const now = Date.now();
  const last = lastRekeyAt.get(msg.from) || 0;
  if (now - last < REKEY_MIN_INTERVAL_MS) {
    console.warn("[SPEAQ] KEY_EXCHANGE rate-limited from", msg.from, "(rekey window not elapsed)");
    return;
  }
  lastRekeyAt.set(msg.from, now);

  // Store their public key
  await saveContactPublicKey(msg.from, msg.kyberPublicKey);

  // Always-rekey on incoming KEY_EXCHANGE: wipe any pre-existing ratchet state for
  // this contact so getOrCreateRatchet performs a fresh Kyber encapsulate and we
  // can return a KEY_EXCHANGE_RESPONSE. Without this, a stale pairSeed-fallback
  // ratchet (left over from a previous failed exchange) would short-circuit
  // getOrCreateRatchet and the peer would never receive the ciphertext, so they
  // could never derive the shared secret -- forcing both sides into incompatible
  // legacy modes ("All decryption methods failed" on the receiver).
  try { await AsyncStorage.removeItem("speaq_ratchet_" + msg.from); } catch { /* best-effort */ }

  // Perform Kyber encapsulation to establish shared secret
  const { state, kyberCiphertext } = await getOrCreateRatchet(
    identity.speaqId, msg.from, msg.kyberPublicKey
  );

  console.warn("[SPEAQ-LOG] handleKeyExchange ratchetReady from=" + msg.from + " ctOut=" + (kyberCiphertext ? "yes" : "no"));

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
 * Handle RECEIVE_SEALED: relay strips `from` field for sender-anonymity (sealed
 * sender mode). To deliver the message we enumerate every stored ratchet state
 * and try to decrypt the blob against each. The first successful decrypt
 * identifies the sender. The decrypted plaintext is forwarded as `msg.plaintext`
 * so ChatScreen can skip its own decrypt paths and avoid double-advancing the
 * ratchet counter.
 *
 * Mirrors the PWA implementation in speaq-web@12b1496 (2026-04-30).
 */
async function handleSealedReceive(msg: any) {
  if (!identity) return;
  if (!msg.blob) return;

  // Parse the blob as a ratchet message envelope. Accept both the native field
  // names (messageNumber, ciphertext) and the PWA legacy short names (mn, ct)
  // so PWA peers that haven't migrated still interoperate.
  let ratchetMsg: { messageNumber: number; ciphertext: string } | null = null;
  try {
    const parsed = JSON.parse(msg.blob);
    const messageNumber = parsed.messageNumber ?? parsed.mn;
    const ciphertext = parsed.ciphertext ?? parsed.ct;
    if (typeof messageNumber === "number" && typeof ciphertext === "string") {
      ratchetMsg = { messageNumber, ciphertext };
    }
  } catch {
    console.warn("[SPEAQ] Sealed message blob is not a ratchet envelope");
    return;
  }
  if (!ratchetMsg) {
    console.warn("[SPEAQ] Sealed message missing messageNumber/ciphertext");
    return;
  }

  // Enumerate all stored ratchet states. Keys are prefixed with `speaq_ratchet_`.
  const RATCHET_PREFIX = "speaq_ratchet_";
  let candidateIds: string[] = [];
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    candidateIds = allKeys
      .filter((k) => k.startsWith(RATCHET_PREFIX))
      .map((k) => k.slice(RATCHET_PREFIX.length));
  } catch (e) {
    console.error("[SPEAQ] Sealed receive: AsyncStorage.getAllKeys failed:", e);
    return;
  }

  if (candidateIds.length === 0) {
    console.warn("[SPEAQ] Sealed message arrived but no ratchet states are stored yet");
    return;
  }

  // Try each candidate ratchet. First successful decrypt identifies the sender.
  for (const candidateId of candidateIds) {
    const candidateState = await loadRatchetState(candidateId);
    if (!candidateState) continue;
    try {
      const plaintext = await ratchetDecrypt(candidateState, ratchetMsg, candidateId);
      console.log("[SPEAQ] Sealed message decrypted from", candidateId);
      // Forward to listeners as a normal RECEIVE so ChatScreen handles it. We
      // attach the discovered sender + the already-decrypted plaintext so
      // ChatScreen does not double-decrypt (which would advance the ratchet
      // counter twice and break the next inbound message).
      listeners.forEach((cb) => cb({
        ...msg,
        type: "RECEIVE",
        from: candidateId,
        plaintext,
      }));
      return;
    } catch {
      // Not this ratchet, try next
    }
  }

  console.warn("[SPEAQ] Sealed message arrived but no ratchet decrypts it (sender unknown)");
}

/**
 * Handle Kyber ciphertext response -- decapsulate to get shared secret.
 * E1-N hardening: requires valid signature on kyberCiphertext + pinned-key check.
 */
async function handleKeyExchangeResponse(msg: any) {
  if (!identity) return;
  console.warn("[SPEAQ-LOG] handleKeyExchangeResponse from=" + msg.from + " ctLen=" + (msg.kyberCiphertext?.length||0));

  if (!(await verifyAndPinSigningKey(msg.from, msg.kyberCiphertext, msg.sig, msg.signPub))) {
    console.warn("[SPEAQ-LOG] handleKeyExchangeResponse REJECTED (signature/pinning) from=" + msg.from);
    return;
  }

  try {
    await initRatchetFromKeyExchange(msg.from, msg.kyberCiphertext, identity.speaqId);
    console.warn("[SPEAQ-LOG] handleKeyExchangeResponse ratchetReady from=" + msg.from);
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

  // 2026-05-07 cross-platform fix: use SEND (not SEND_SEALED) so PWA peers
  // route the message through their RECEIVE handler. PWA does not implement
  // a RECEIVE_SEALED handler, so SEND_SEALED-from-native silently disappeared
  // on PWA. Sender identity is still inside the encrypted blob (sealed-sender
  // semantics preserved at the application layer); only the relay frame-type
  // changes. Mirrors PWA's send code in speaq-web@page.tsx:1990 which also
  // sends type:"SEND" + protocol:"ratchet-v1".
  ws.send(JSON.stringify({
    type: "SEND",
    to: toSpeaqId,
    blob: JSON.stringify({
      messageNumber: ratchetMsg.messageNumber,
      ciphertext: ratchetMsg.ciphertext,
    }),
    encrypted: true,
    protocol: "ratchet-v1",
  }));
}

/**
 * Send a QC payment to a contact (encrypted via ratchet)
 *
 * @param note Optional sender memo. Travels inside the encrypted payload
 *   so the receiver sees it in their wallet transaction-history. Without
 *   this, only the hardcoded "[Payment: X QC]" text reaches the receiver.
 */
export async function sendQCPayment(toSpeaqId: string, amount: number, note?: string): Promise<void> {
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
  if (note && note.trim()) payload.note = note.trim();
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

/**
 * Send a raw envelope on the relay-shared WebSocket. Used by call.ts to
 * dispatch CALL_OFFER / CALL_ANSWER / ICE_CANDIDATE / CALL_END / CALL_REJECT
 * messages. The separate RelayService in services/relay.ts is never connected,
 * so call signaling must ride the speaq.ts WS that AUTHs once on identity load.
 */
export function sendRelayPayload(payload: Record<string, unknown>): boolean {
  if (!ws || !connected) {
    console.warn("[SPEAQ] sendRelayPayload: WS not connected, dropping", payload.type);
    return false;
  }
  try {
    ws.send(JSON.stringify(payload));
    return true;
  } catch (e) {
    console.warn("[SPEAQ] sendRelayPayload failed:", (e as Error).message);
    return false;
  }
}
