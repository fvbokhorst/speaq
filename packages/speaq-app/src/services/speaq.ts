/**
 * SPEAQ Service - Connects UI to speaq-core + relay
 * Handles: identity creation, pairing, sending/receiving messages
 */

import { config } from "./config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { encryptMessage, decryptMessage, getContactKey, generateSecureId } from "./crypto";

// State
let identity: {
  speaqId: string;
  displayName: string;
  createdAt: number;
} | null = null;

let ws: WebSocket | null = null;
let connected = false;

type MessageCallback = (msg: any) => void;
const listeners: MessageCallback[] = [];

// Generate cryptographically secure SPEAQ ID
function generateSpeaqId(): string {
  return generateSecureId();
}

/**
 * Create a new identity and connect to relay
 */
export function createIdentity(displayName: string): typeof identity {
  identity = {
    speaqId: generateSpeaqId(),
    displayName,
    createdAt: Date.now(),
  };

  // Persist identity
  AsyncStorage.setItem("speaq_identity", JSON.stringify(identity));

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
    ws?.send(JSON.stringify({ type: "AUTH", speaqId: identity!.speaqId }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string);
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
 * Send a message to a contact
 */
export function sendMessage(toSpeaqId: string, text: string): void {
  if (!ws || !connected || !identity) return;

  // Encrypt with AES-256-GCM using shared key
  const key = getContactKey(identity.speaqId, toSpeaqId);
  const plaintext = JSON.stringify({
    type: "message",
    text,
    from: identity.displayName,
    timestamp: Date.now(),
  });
  const blob = encryptMessage(key, plaintext);

  ws.send(JSON.stringify({
    type: "SEND",
    to: toSpeaqId,
    blob,
    encrypted: true,
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
 * Check connection status
 */
export function isConnected(): boolean {
  return connected;
}
