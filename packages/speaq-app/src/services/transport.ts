/**
 * SPEAQ Transport Layer
 * Censorship-resistant communication
 *
 * Fallback cascade:
 * 1. Direct WebSocket (fastest, normal conditions)
 * 2. Tor-like onion routing (censored networks)
 * 3. Mesh via Bluetooth LE (no internet)
 *
 * The app tries each in order. If one fails, it falls back to the next.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { config } from "./config";

export type TransportMode = "direct" | "obfuscated" | "tor" | "mesh";

export interface TransportStatus {
  currentMode: TransportMode;
  directAvailable: boolean;
  torAvailable: boolean;
  meshAvailable: boolean;
  meshPeers: number;
  lastSwitch: number;
}

const STORAGE_KEY = "speaq_transport";

let status: TransportStatus = {
  currentMode: "direct",
  directAvailable: true,
  torAvailable: false,
  meshAvailable: false,
  meshPeers: 0,
  lastSwitch: Date.now(),
};

// --- Load / Save ---

export async function loadTransport(): Promise<void> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (data) status = JSON.parse(data);
  } catch (e) {}
}

async function save(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(status));
}

// --- Transport Status ---

export function getTransportStatus(): TransportStatus {
  return { ...status };
}

export function getCurrentMode(): TransportMode {
  return status.currentMode;
}

// --- Direct WebSocket ---

export async function checkDirectConnection(): Promise<boolean> {
  try {
    const response = await fetch(config.relay.healthUrl, { method: "GET" });
    status.directAvailable = response.ok;
    return response.ok;
  } catch (e) {
    status.directAvailable = false;
    return false;
  }
}

// --- Obfuscated Transport (obfs4-like) ---
// Makes SPEAQ traffic look like normal HTTPS traffic
// In production: use obfs4proxy or meek bridge

export function obfuscatePayload(data: string): string {
  // Pad to standard size (makes traffic analysis harder)
  const blockSize = 4096;
  const padded = data + "\0".repeat(blockSize - (data.length % blockSize));

  // Add fake HTTP headers (looks like normal web traffic)
  const fakeHeaders = [
    "GET /index.html HTTP/1.1",
    "Host: cdn.googleapis.com",
    "Accept: text/html,application/xhtml+xml",
    "Accept-Language: en-US,en;q=0.9",
    "Connection: keep-alive",
    "",
    "",
  ].join("\r\n");

  // Base64 encode the actual data in what looks like an HTML response
  const encoded = btoa(padded);
  return `${fakeHeaders}${encoded}`;
}

export function deobfuscatePayload(obfuscated: string): string {
  // Strip fake HTTP headers and decode
  const parts = obfuscated.split("\r\n\r\n");
  const encoded = parts[parts.length - 1];
  try {
    const decoded = atob(encoded);
    return decoded.replace(/\0+$/, ""); // remove padding
  } catch {
    return obfuscated;
  }
}

// --- Tor-like Routing ---
// Multi-hop encryption: message is encrypted in layers
// Each relay only knows the next hop, not the final destination

export interface OnionRoute {
  hops: string[]; // relay node IDs
  layers: string[]; // encrypted layers (outermost first)
}

export function createOnionRoute(
  destination: string,
  relayNodes: string[],
  encryptFn: (data: string, key: string) => string
): OnionRoute {
  // Pick 3 random relay nodes for the circuit
  const shuffled = [...relayNodes].sort(() => Math.random() - 0.5);
  const hops = shuffled.slice(0, Math.min(3, shuffled.length));
  hops.push(destination);

  // Encrypt in layers (innermost to outermost)
  let payload = destination;
  const layers: string[] = [];
  for (let i = hops.length - 1; i >= 0; i--) {
    payload = encryptFn(payload, hops[i]);
    layers.unshift(payload);
  }

  return { hops, layers };
}

// --- Mesh Networking ---
// Bluetooth LE + WiFi Direct for no-internet communication
// Each phone acts as a relay node

export interface MeshPeer {
  id: string;
  name: string;
  rssi: number; // signal strength
  lastSeen: number;
}

let meshPeers: MeshPeer[] = [];
let meshScanning = false;

export function getMeshPeers(): MeshPeer[] {
  return [...meshPeers];
}

export function isMeshScanning(): boolean {
  return meshScanning;
}

export async function startMeshScan(): Promise<void> {
  // In production: use react-native-ble-plx for BLE scanning
  // BleManager.startDeviceScan(null, null, (error, device) => { ... })
  meshScanning = true;
  status.meshAvailable = true;

  // Simulate finding peers (for testing without BLE hardware)
  setTimeout(() => {
    meshPeers = []; // Real implementation would populate from BLE scan
    status.meshPeers = meshPeers.length;
    save();
  }, 3000);
}

export function stopMeshScan(): void {
  meshScanning = false;
}

export async function sendViaMesh(peerId: string, data: string): Promise<boolean> {
  // In production: use BLE GATT to send data to peer
  // For now: log and return false (mesh not fully implemented)
  console.log("[Mesh] Would send to peer:", peerId, "data length:", data.length);
  return false;
}

// --- Mesh Message Format ---

export interface MeshMessage {
  type: "MESH_RELAY";
  ttl: number; // decrements at each hop, dropped at 0
  hops: string[]; // node IDs that have seen this message (prevents loops)
  data: string; // encrypted blob
  messageId: string; // unique ID to detect duplicates
}

let messagesRelayed = 0;
const meshMessageCallbacks: ((msg: MeshMessage) => void)[] = [];
const seenMessageIds = new Set<string>();

export function broadcastViaMesh(data: string): void {
  const msg: MeshMessage = {
    type: "MESH_RELAY",
    ttl: 3,
    hops: [],
    data,
    messageId: Date.now().toString(36) + Math.random().toString(36).substring(2, 8),
  };

  // Send to all known peers
  for (const peer of meshPeers) {
    sendViaMesh(peer.id, JSON.stringify(msg));
  }
}

export function onMeshMessage(callback: (msg: MeshMessage) => void): () => void {
  meshMessageCallbacks.push(callback);
  // Return unsubscribe function
  return () => {
    const idx = meshMessageCallbacks.indexOf(callback);
    if (idx !== -1) meshMessageCallbacks.splice(idx, 1);
  };
}

export function handleIncomingMeshMessage(raw: string, fromNodeId: string): void {
  try {
    const msg: MeshMessage = JSON.parse(raw);
    if (msg.type !== "MESH_RELAY") return;

    // Drop if we've seen this message before (duplicate)
    if (seenMessageIds.has(msg.messageId)) return;
    seenMessageIds.add(msg.messageId);

    // Drop if TTL is 0 or below
    if (msg.ttl <= 0) return;

    // Notify local listeners
    for (const cb of meshMessageCallbacks) {
      cb(msg);
    }

    // Relay to other peers (decrement TTL, add ourselves to hops)
    const relayMsg: MeshMessage = {
      ...msg,
      ttl: msg.ttl - 1,
      hops: [...msg.hops, fromNodeId],
    };

    if (relayMsg.ttl > 0) {
      for (const peer of meshPeers) {
        // Don't relay back to sender or to any node that already saw this message
        if (peer.id === fromNodeId || relayMsg.hops.includes(peer.id)) continue;
        sendViaMesh(peer.id, JSON.stringify(relayMsg));
        messagesRelayed++;
      }
    }
  } catch {
    // Invalid message format, ignore
  }
}

export function getMeshStats(): { scanning: boolean; peerCount: number; messagesRelayed: number } {
  return {
    scanning: meshScanning,
    peerCount: meshPeers.length,
    messagesRelayed,
  };
}

// --- Automatic Fallback ---

export async function selectBestTransport(): Promise<TransportMode> {
  // Try direct first
  const directOk = await checkDirectConnection();
  if (directOk) {
    status.currentMode = "direct";
    await save();
    return "direct";
  }

  // Try obfuscated (same server but traffic looks different)
  // In production: try connecting via domain fronting
  status.currentMode = "obfuscated";
  await save();
  return "obfuscated";

  // If obfuscated fails too, try Tor
  // status.currentMode = "tor";

  // Last resort: mesh (no internet needed)
  // status.currentMode = "mesh";
}

// --- Domain Fronting ---
// Makes SPEAQ traffic look like it's going to Google/Amazon/Cloudflare
// The CDN forwards the request to the actual SPEAQ relay

export function getDomainFrontingUrl(): string {
  // In production: use a CDN domain that forwards to the relay
  // The TLS SNI shows "cdn.googleapis.com" but the Host header is the relay
  return "https://cdn.googleapis.com"; // placeholder
}

export function getDomainFrontingHeaders(realHost: string): Record<string, string> {
  return {
    "Host": realHost, // actual destination
    "X-Forwarded-For": "127.0.0.1",
    "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36",
  };
}
