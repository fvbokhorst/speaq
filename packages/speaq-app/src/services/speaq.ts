/**
 * SPEAQ Service - Connects UI to speaq-core + relay
 * Handles: identity creation, pairing, sending/receiving messages
 */

import { config } from "./config";
import crypto from "crypto";

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

// Generate a simple SPEAQ ID (in production: from Kyber public key hash)
function generateSpeaqId(): string {
  const chars = "abcdef0123456789";
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
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

  // Connect to relay
  connectRelay();

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

  // In production: encrypt with Double Ratchet via speaq-core
  // For now: base64 encode (protocol layer will be added)
  const blob = btoa(JSON.stringify({
    type: "message",
    text,
    from: identity.displayName,
    timestamp: Date.now(),
  }));

  ws.send(JSON.stringify({
    type: "SEND",
    to: toSpeaqId,
    blob,
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
