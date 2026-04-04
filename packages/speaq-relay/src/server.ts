/**
 * SPEAQ Relay Server
 * PRD Section 4.2, 4.4
 *
 * Zero knowledge relay: server sees ONLY encrypted blobs.
 * No message storage (fire-and-forget).
 * Offline queue: max 7 days, then deleted.
 *
 * The server NEVER knows:
 * - Message content
 * - Who is talking to whom (only SPEAQ IDs, not real identities)
 * - Message length (padded to fixed blocks)
 */

import { WebSocketServer, WebSocket } from "ws";
import express from "express";
import cors from "cors";
import http from "http";
import crypto from "crypto";

// --- Types ---

interface ConnectedClient {
  speaqId: string;
  ws: WebSocket;
  connectedAt: number;
}

interface OfflineMessage {
  id: string;
  from: string;
  blob: string; // base64 encoded encrypted blob
  createdAt: number;
  expiresAt: number;
}

interface PublicKeyEntry {
  speaqId: string;
  kyberPublicKey: string; // base64
  signPublicKey: string;  // base64
  registeredAt: number;
}

// --- State ---
// In production: Redis for offline queue, PostgreSQL for public keys
// For now: in-memory (sufficient for testing and small deployments)

const clients = new Map<string, ConnectedClient>();
const offlineQueue = new Map<string, OfflineMessage[]>();
const publicKeys = new Map<string, PublicKeyEntry>();

const OFFLINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 messages per minute
const rateLimitCounters = new Map<string, { count: number; resetAt: number }>();

// --- Rate Limiting ---

function checkRateLimit(speaqId: string): boolean {
  const now = Date.now();
  const entry = rateLimitCounters.get(speaqId);

  if (!entry || now > entry.resetAt) {
    rateLimitCounters.set(speaqId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// --- Offline Queue ---

function queueOfflineMessage(to: string, from: string, blob: string): void {
  const messages = offlineQueue.get(to) || [];
  messages.push({
    id: crypto.randomUUID(),
    from,
    blob,
    createdAt: Date.now(),
    expiresAt: Date.now() + OFFLINE_MAX_AGE_MS,
  });
  offlineQueue.set(to, messages);
}

function getOfflineMessages(speaqId: string): OfflineMessage[] {
  const messages = offlineQueue.get(speaqId) || [];
  const now = Date.now();
  // Filter expired
  const valid = messages.filter((m) => m.expiresAt > now);
  offlineQueue.set(speaqId, valid);
  return valid;
}

function clearOfflineMessages(speaqId: string): void {
  offlineQueue.delete(speaqId);
}

// --- Cleanup expired offline messages (runs every hour) ---

setInterval(() => {
  const now = Date.now();
  for (const [id, messages] of offlineQueue.entries()) {
    const valid = messages.filter((m) => m.expiresAt > now);
    if (valid.length === 0) {
      offlineQueue.delete(id);
    } else {
      offlineQueue.set(id, valid);
    }
  }
}, 60 * 60 * 1000);

// --- Express REST API ---

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/api/v1/health", (_req, res) => {
  res.json({
    status: "ok",
    clients: clients.size,
    offlineQueued: Array.from(offlineQueue.values()).reduce((sum, msgs) => sum + msgs.length, 0),
    registeredKeys: publicKeys.size,
    uptime: process.uptime(),
    version: "0.1.0",
  });
});

// Register public keys
app.post("/api/v1/register", (req, res) => {
  const { speaqId, kyberPublicKey, signPublicKey } = req.body;
  if (!speaqId || !kyberPublicKey || !signPublicKey) {
    return res.status(400).json({ error: "speaqId, kyberPublicKey, and signPublicKey required" });
  }

  publicKeys.set(speaqId, {
    speaqId,
    kyberPublicKey,
    signPublicKey,
    registeredAt: Date.now(),
  });

  res.json({ registered: true, speaqId });
});

// Get public key by SPEAQ ID
app.get("/api/v1/key/:speaqId", (req, res) => {
  const entry = publicKeys.get(req.params.speaqId);
  if (!entry) return res.status(404).json({ error: "Not found" });
  res.json({ kyberPublicKey: entry.kyberPublicKey, signPublicKey: entry.signPublicKey });
});

// Get offline messages
app.get("/api/v1/offline/:speaqId", (req, res) => {
  const messages = getOfflineMessages(req.params.speaqId);
  res.json(messages);
});

// Delete offline messages after retrieval
app.delete("/api/v1/offline/:speaqId", (req, res) => {
  clearOfflineMessages(req.params.speaqId);
  res.json({ cleared: true });
});

// --- HTTP Server + WebSocket ---

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket) => {
  let clientId: string | null = null;

  ws.on("message", (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.type) {
        // AUTH: Client identifies itself
        case "AUTH": {
          clientId = msg.speaqId;
          if (!clientId) {
            ws.send(JSON.stringify({ type: "ERROR", error: "speaqId required" }));
            return;
          }

          clients.set(clientId, { speaqId: clientId, ws, connectedAt: Date.now() });

          // Deliver any offline messages
          const offline = getOfflineMessages(clientId);
          for (const m of offline) {
            ws.send(JSON.stringify({ type: "RECEIVE", from: m.from, blob: m.blob, id: m.id }));
          }
          if (offline.length > 0) {
            clearOfflineMessages(clientId);
          }

          ws.send(JSON.stringify({ type: "AUTH_OK", offlineDelivered: offline.length }));
          break;
        }

        // SEND: Relay encrypted blob to recipient
        case "SEND": {
          if (!clientId) {
            ws.send(JSON.stringify({ type: "ERROR", error: "Not authenticated" }));
            return;
          }

          if (!checkRateLimit(clientId)) {
            ws.send(JSON.stringify({ type: "ERROR", error: "Rate limit exceeded" }));
            return;
          }

          const { to, blob, id } = msg;
          if (!to || !blob) {
            ws.send(JSON.stringify({ type: "ERROR", error: "to and blob required" }));
            return;
          }

          const messageId = id || crypto.randomUUID();
          const recipient = clients.get(to);

          if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
            // Recipient online: relay immediately (fire-and-forget)
            recipient.ws.send(JSON.stringify({
              type: "RECEIVE",
              from: clientId,
              blob,
              id: messageId,
            }));
            ws.send(JSON.stringify({ type: "ACK", id: messageId, status: "delivered" }));
          } else {
            // Recipient offline: queue
            queueOfflineMessage(to, clientId, blob);
            ws.send(JSON.stringify({ type: "ACK", id: messageId, status: "queued" }));
          }
          break;
        }

        // TYPING: Relay typing indicator
        case "TYPING": {
          if (!clientId) return;
          const recipient = clients.get(msg.to);
          if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
            recipient.ws.send(JSON.stringify({ type: "TYPING", from: clientId }));
          }
          break;
        }

        default:
          ws.send(JSON.stringify({ type: "ERROR", error: "Unknown message type: " + msg.type }));
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: "ERROR", error: "Invalid JSON" }));
    }
  });

  ws.on("close", () => {
    if (clientId) {
      clients.delete(clientId);
    }
  });

  // Heartbeat: close stale connections after 60s of no pong
  ws.on("pong", () => {
    (ws as any).__alive = true;
  });
});

// Heartbeat interval
setInterval(() => {
  wss.clients.forEach((ws) => {
    if ((ws as any).__alive === false) return ws.terminate();
    (ws as any).__alive = false;
    ws.ping();
  });
}, 30000);

// --- Start ---

const PORT = parseInt(process.env.PORT || "8080", 10);

server.listen(PORT, () => {
  console.log("");
  console.log("  SPEAQ Relay Server v0.1.0");
  console.log("  SPEAQ Freely.");
  console.log("");
  console.log("  WebSocket: ws://localhost:" + PORT);
  console.log("  REST API:  http://localhost:" + PORT + "/api/v1/health");
  console.log("  Zero knowledge: server sees ONLY encrypted blobs");
  console.log("");
});
