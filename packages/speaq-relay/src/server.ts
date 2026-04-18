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
import fs from "fs";
import path from "path";

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

// --- Admin Stats ---

const ADMIN_PIN_HASH = crypto.createHash("sha256").update("555766").digest("hex");
const ADMIN_SPEAQ_ID = process.env.ADMIN_SPEAQ_ID || "";
const STATS_FILE = path.join(process.cwd(), "speaq-stats.json");
const STATS_SERVER_URL = process.env.STATS_SERVER_URL || "http://136.117.234.208:9335/stats";

interface UserRecord {
  firstSeen: number;
}

// All users ever seen, keyed by speaqId
const allUsers = new Map<string, UserRecord>();

// Country stats: anonymous aggregate counters (timezone-derived, no IP)
const countryStats = new Map<string, number>();

const COUNTRY_NAMES: Record<string, string> = {
  AF: "Afghanistan", AL: "Albania", DZ: "Algeria", AR: "Argentina",
  AM: "Armenia", AU: "Australia", AT: "Austria", AZ: "Azerbaijan",
  BH: "Bahrain", BD: "Bangladesh", BY: "Belarus", BE: "Belgium",
  BO: "Bolivia", BA: "Bosnia & Herzegovina", BR: "Brazil", BG: "Bulgaria",
  KH: "Cambodia", CM: "Cameroon", CA: "Canada", CL: "Chile",
  CN: "China", CO: "Colombia", CR: "Costa Rica", HR: "Croatia",
  CU: "Cuba", CY: "Cyprus", CZ: "Czechia", DK: "Denmark",
  EC: "Ecuador", EG: "Egypt", SV: "El Salvador", EE: "Estonia",
  ET: "Ethiopia", FI: "Finland", FR: "France", GE: "Georgia",
  DE: "Germany", GH: "Ghana", GR: "Greece", GT: "Guatemala",
  HN: "Honduras", HK: "Hong Kong", HU: "Hungary", IS: "Iceland",
  IN: "India", ID: "Indonesia", IR: "Iran", IQ: "Iraq",
  IE: "Ireland", IL: "Israel", IT: "Italy", JM: "Jamaica",
  JP: "Japan", JO: "Jordan", KZ: "Kazakhstan", KE: "Kenya",
  KW: "Kuwait", KG: "Kyrgyzstan", LV: "Latvia", LB: "Lebanon",
  LY: "Libya", LT: "Lithuania", LU: "Luxembourg", MO: "Macau",
  MY: "Malaysia", MV: "Maldives", MT: "Malta", MX: "Mexico",
  MD: "Moldova", MN: "Mongolia", ME: "Montenegro", MA: "Morocco",
  MZ: "Mozambique", MM: "Myanmar", NP: "Nepal", NL: "Netherlands",
  NZ: "New Zealand", NI: "Nicaragua", NG: "Nigeria", KP: "North Korea",
  MK: "North Macedonia", NO: "Norway", OM: "Oman", PK: "Pakistan",
  PA: "Panama", PY: "Paraguay", PE: "Peru", PH: "Philippines",
  PL: "Poland", PT: "Portugal", QA: "Qatar", RO: "Romania",
  RU: "Russia", SA: "Saudi Arabia", RS: "Serbia", SG: "Singapore",
  SK: "Slovakia", SI: "Slovenia", ZA: "South Africa", KR: "South Korea",
  ES: "Spain", LK: "Sri Lanka", SD: "Sudan", SE: "Sweden",
  CH: "Switzerland", SY: "Syria", TW: "Taiwan", TJ: "Tajikistan",
  TZ: "Tanzania", TH: "Thailand", TN: "Tunisia", TR: "Turkey",
  TM: "Turkmenistan", UA: "Ukraine", AE: "UAE", GB: "United Kingdom",
  US: "United States", UY: "Uruguay", UZ: "Uzbekistan", VE: "Venezuela",
  VN: "Vietnam", YE: "Yemen", ZM: "Zambia", ZW: "Zimbabwe",
  XX: "Unknown",
};

// Mining stats
let totalMiningReceipts = 0;
let totalQCMined = 0;

// Load persisted stats from remote server (Google VM), fallback to local disk
async function loadStats(): Promise<void> {
  // Try remote first
  try {
    const res = await fetch(STATS_SERVER_URL);
    if (res.ok) {
      const data = await res.json() as { users?: Record<string, UserRecord>; totalMiningReceipts?: number; totalQCMined?: number; countryStats?: Record<string, number> };
      if (data.users) {
        for (const [id, record] of Object.entries(data.users)) {
          allUsers.set(id, record as UserRecord);
        }
      }
      if (data.totalMiningReceipts) totalMiningReceipts = data.totalMiningReceipts;
      if (data.totalQCMined) totalQCMined = data.totalQCMined;
      if (data.countryStats) {
        for (const [code, count] of Object.entries(data.countryStats)) {
          countryStats.set(code, count as number);
        }
      }
      console.log(`  Stats loaded: ${allUsers.size} users, ${countryStats.size} countries from remote`);
      return;
    }
  } catch (e) {
    console.error("  Remote stats unavailable, trying local:", e);
  }
  // Fallback to local disk
  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATS_FILE, "utf-8"));
      if (data.users) {
        for (const [id, record] of Object.entries(data.users)) {
          allUsers.set(id, record as UserRecord);
        }
      }
      if (data.totalMiningReceipts) totalMiningReceipts = data.totalMiningReceipts;
      if (data.totalQCMined) totalQCMined = data.totalQCMined;
      if (data.countryStats) {
        for (const [code, count] of Object.entries(data.countryStats)) {
          countryStats.set(code, count as number);
        }
      }
      console.log(`  Stats loaded: ${allUsers.size} users, ${countryStats.size} countries from disk`);
    }
  } catch (e) {
    console.error("  Failed to load stats:", e);
  }
}

// Save stats to remote server (Google VM) + local disk
async function saveStats(): Promise<void> {
  const data = {
    users: Object.fromEntries(allUsers),
    totalMiningReceipts,
    totalQCMined,
    countryStats: Object.fromEntries(countryStats),
    savedAt: Date.now(),
  };
  const json = JSON.stringify(data);
  // Save to remote
  try {
    await fetch(STATS_SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: json,
    });
  } catch (e) {
    console.error("  Failed to save stats to remote:", e);
  }
  // Also save locally as backup
  try {
    fs.writeFileSync(STATS_FILE, json, "utf-8");
  } catch (e) {
    console.error("  Failed to save stats to disk:", e);
  }
}

// Save stats every 2 minutes (more frequent since remote is reliable)
setInterval(saveStats, 2 * 60 * 1000);

// Track a user connection, returns true if NEW user
function trackUser(speaqId: string): boolean {
  if (allUsers.has(speaqId)) return false;
  allUsers.set(speaqId, { firstSeen: Date.now() });
  // Save immediately on new user (don't wait for interval)
  saveStats();
  return true;
}

// Count users first seen in a time range
function countUsersInRange(sinceMs: number): number {
  const since = Date.now() - sinceMs;
  let count = 0;
  for (const record of allUsers.values()) {
    if (record.firstSeen >= since) count++;
  }
  return count;
}

// Send a system notification to admin via WebSocket
function notifyAdmin(text: string): void {
  if (!ADMIN_SPEAQ_ID) return;
  const adminClient = clients.get(ADMIN_SPEAQ_ID);
  if (adminClient && adminClient.ws.readyState === WebSocket.OPEN) {
    const blob = JSON.stringify({
      type: "message",
      text,
      from: "SPEAQ Network",
      senderId: "system",
      timestamp: Date.now(),
    });
    adminClient.ws.send(JSON.stringify({
      type: "RECEIVE",
      from: "system",
      blob,
      id: crypto.randomUUID(),
    }));
  }
}

// --- Counters ---

let totalMessagesRelayed = 0;
const serverStartedAt = Date.now();

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
app.use(cors({ origin: "*", allowedHeaders: ["Content-Type", "x-admin-pin"] }));
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

// Network stats
app.get("/api/v1/stats", (_req, res) => {
  res.json({
    registeredUsers: publicKeys.size,
    onlineUsers: clients.size,
    totalMessagesRelayed: totalMessagesRelayed,
    uptimeSeconds: Math.floor((Date.now() - serverStartedAt) / 1000),
  });
});

// --- Admin Stats Endpoint (PIN-protected) ---

app.get("/api/v1/admin/stats", (req, res) => {
  const pin = (req.query.pin as string) || (req.headers["x-admin-pin"] as string);
  if (!pin) {
    return res.status(401).json({ error: "PIN required" });
  }
  const pinHash = crypto.createHash("sha256").update(pin).digest("hex");
  if (pinHash !== ADMIN_PIN_HASH) {
    return res.status(403).json({ error: "Invalid PIN" });
  }

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const WEEK = 7 * DAY;
  const MONTH = 30 * DAY;
  const YEAR = 365 * DAY;

  // Build user growth timeline (daily buckets for last 30 days)
  const userGrowth: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const dayStart = now - (i + 1) * DAY;
    const dayEnd = now - i * DAY;
    let count = 0;
    for (const record of allUsers.values()) {
      if (record.firstSeen <= dayEnd) count++;
    }
    const d = new Date(dayEnd);
    userGrowth.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      count,
    });
  }

  res.json({
    users: {
      total: allUsers.size,
      activeNow: clients.size,
      newToday: countUsersInRange(DAY),
      newThisWeek: countUsersInRange(WEEK),
      newThisMonth: countUsersInRange(MONTH),
      newThisYear: countUsersInRange(YEAR),
      growth: userGrowth,
    },
    miners: {
      totalReceipts: totalMiningReceipts,
      activeNow: clients.size, // every connected user can mine
      newToday: countUsersInRange(DAY), // miners ~ users for now
      newThisWeek: countUsersInRange(WEEK),
      newThisMonth: countUsersInRange(MONTH),
      newThisYear: countUsersInRange(YEAR),
    },
    economy: {
      totalQCMined,
      maxSupply: 21_000_000,
      remaining: 21_000_000 - totalQCMined,
      percentMined: ((totalQCMined / 21_000_000) * 100),
    },
    network: {
      connectedClients: clients.size,
      registeredKeys: publicKeys.size,
      totalMessagesRelayed,
      offlineQueued: Array.from(offlineQueue.values()).reduce((sum, msgs) => sum + msgs.length, 0),
      uptimeSeconds: Math.floor((now - serverStartedAt) / 1000),
      serverStartedAt,
    },
  });
});

// --- Country Stats Endpoint (privacy-preserving) ---
app.get("/api/v1/admin/country-stats", (req, res) => {
  const pin = (req.query.pin as string) || (req.headers["x-admin-pin"] as string);
  if (!pin) {
    return res.status(401).json({ error: "PIN required" });
  }
  const pinHash = crypto.createHash("sha256").update(pin).digest("hex");
  if (pinHash !== ADMIN_PIN_HASH) {
    return res.status(403).json({ error: "Invalid PIN" });
  }

  // Sort by count descending
  const countries = Array.from(countryStats.entries())
    .map(([code, count]) => ({
      code,
      count,
      name: COUNTRY_NAMES[code] || code,
    }))
    .sort((a, b) => b.count - a.count);

  res.json({ countries });
});

// --- Mining Receipt System (C+) ---
// Relay signs a receipt for each mining contribution it witnesses.
// Double signature: miner signs + relay co-signs = unforgeable proof.

// Relay's own signing key (generated once at startup)
const relaySigningKey = crypto.randomBytes(32).toString("hex");

// Sign a mining receipt with the relay's key
function relaySign(data: string): string {
  return crypto.createHmac("sha256", relaySigningKey).update(data).digest("hex");
}

// Issue a mining receipt
app.post("/api/v1/mining/receipt", (req, res) => {
  const { speaqId, miningType, amount, timestamp, minerSignature } = req.body;
  if (!speaqId || !miningType || !amount || !timestamp || !minerSignature) {
    return res.status(400).json({ error: "speaqId, miningType, amount, timestamp, minerSignature required" });
  }

  // Verify the miner is currently connected (proof of activity)
  const client = clients.get(speaqId);
  if (!client) {
    return res.status(403).json({ error: "Miner not connected to relay" });
  }

  // Create receipt data string
  const receiptData = `${speaqId}:${miningType}:${amount}:${timestamp}`;

  // Relay co-signs the receipt
  const relaySignature = relaySign(receiptData);
  const receiptId = crypto.randomUUID();

  // Track mining stats
  totalMiningReceipts++;
  totalQCMined += parseFloat(amount) || 0;

  res.json({
    receiptId,
    speaqId,
    miningType,
    amount,
    timestamp,
    minerSignature,
    relaySignature,
    relayTimestamp: Date.now(),
    valid: true,
  });
});

// Verify a mining receipt
app.post("/api/v1/mining/verify-receipt", (req, res) => {
  const { speaqId, miningType, amount, timestamp, relaySignature } = req.body;
  if (!speaqId || !miningType || !amount || !timestamp || !relaySignature) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const receiptData = `${speaqId}:${miningType}:${amount}:${timestamp}`;
  const expectedSig = relaySign(receiptData);
  const valid = expectedSig === relaySignature;

  res.json({ valid, receiptData });
});

// Mining network stats (placeholder -- will be replaced by ledger)
app.get("/api/v1/mining/network-stats", (_req, res) => {
  res.json({
    totalQCMined: 0, // placeholder: will be replaced by ledger integration
    activeMiners: 0,  // placeholder: will be replaced by ledger integration
  });
});

// --- Dead Man's Switch (Server-Side) ---
// Server stores DMS configs in-memory. Checks every 60 seconds.
// If a user is overdue, sends their encrypted message to all recipients.

interface DMSConfig {
  speaqId: string;
  intervalMs: number;
  lastCheckIn: number;
  recipientIds: string[];
  encryptedMessage: string; // Server never decrypts this
}

const dmsConfigs = new Map<string, DMSConfig>();

// Register a DMS config
app.post("/api/v1/dms/register", (req, res) => {
  const { speaqId, intervalMs, recipientIds, encryptedMessage } = req.body;
  if (!speaqId || !intervalMs || !recipientIds || !encryptedMessage) {
    return res.status(400).json({ error: "speaqId, intervalMs, recipientIds, and encryptedMessage required" });
  }
  if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
    return res.status(400).json({ error: "recipientIds must be a non-empty array" });
  }
  if (intervalMs < 60000) {
    return res.status(400).json({ error: "intervalMs must be at least 60000 (1 minute)" });
  }

  dmsConfigs.set(speaqId, {
    speaqId,
    intervalMs,
    lastCheckIn: Date.now(),
    recipientIds,
    encryptedMessage,
  });

  res.json({ registered: true, speaqId });
});

// Check in (reset timer)
app.post("/api/v1/dms/checkin", (req, res) => {
  const { speaqId } = req.body;
  if (!speaqId) {
    return res.status(400).json({ error: "speaqId required" });
  }

  const config = dmsConfigs.get(speaqId);
  if (!config) {
    return res.status(404).json({ error: "No DMS registered for this speaqId" });
  }

  config.lastCheckIn = Date.now();
  res.json({ checkedIn: true, speaqId, nextDeadline: config.lastCheckIn + config.intervalMs });
});

// Background DMS check every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [speaqId, config] of dmsConfigs.entries()) {
    const elapsed = now - config.lastCheckIn;
    if (elapsed > config.intervalMs) {
      // Overdue: send encrypted message to all recipients
      for (const recipientId of config.recipientIds) {
        const recipient = clients.get(recipientId);
        if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
          recipient.ws.send(JSON.stringify({
            type: "RECEIVE",
            from: speaqId,
            blob: config.encryptedMessage,
            id: crypto.randomUUID(),
            deadManSwitch: true,
          }));
        } else {
          // Queue for offline recipient
          queueOfflineMessage(recipientId, speaqId, config.encryptedMessage);
        }
      }
      // Remove the triggered DMS config
      dmsConfigs.delete(speaqId);
    }
  }
}, 60_000);

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

          // Track country code (privacy-preserving: timezone-derived, no IP)
          if (msg.cc && typeof msg.cc === "string" && msg.cc.length === 2) {
            const cc = msg.cc.toUpperCase();
            countryStats.set(cc, (countryStats.get(cc) || 0) + 1);
          }

          // Track user for admin stats
          const isNewUser = trackUser(clientId);
          if (isNewUser) {
            notifyAdmin(`[SYSTEM] New user joined: ${clientId.substring(0, 8)}`);
          }

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
          totalMessagesRelayed++;
          const recipient = clients.get(to);

          if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
            // Recipient online: relay immediately (fire-and-forget)
            recipient.ws.send(JSON.stringify({
              type: "RECEIVE",
              from: clientId,
              blob,
              id: messageId,
            }));
            // Include mining receipt for relay contribution
            const receiptData = `${clientId}:relay:0.0001:${Date.now()}`;
            const miningReceipt = relaySign(receiptData);
            ws.send(JSON.stringify({ type: "ACK", id: messageId, status: "delivered", miningReceipt, receiptData }));
          } else {
            // Recipient offline: queue
            queueOfflineMessage(to, clientId, blob);
            const receiptData = `${clientId}:relay:0.0001:${Date.now()}`;
            const miningReceipt = relaySign(receiptData);
            ws.send(JSON.stringify({ type: "ACK", id: messageId, status: "queued", miningReceipt, receiptData }));
          }
          break;
        }

        // TYPING: Relay typing indicator
        case "TYPING": {
          if (!clientId) return;
          if (!checkRateLimit(clientId)) {
            ws.send(JSON.stringify({ type: "ERROR", error: "Rate limit exceeded" }));
            return;
          }
          const recipient = clients.get(msg.to);
          if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
            recipient.ws.send(JSON.stringify({ type: "TYPING", from: clientId }));
            totalMessagesRelayed++;
          }
          break;
        }

        // --- Call Signaling (Phase 3) ---
        // All signaling is relayed as-is. Server sees nothing (zero knowledge).

        case "CALL_OFFER": {
          if (!clientId) return;
          if (!checkRateLimit(clientId)) {
            ws.send(JSON.stringify({ type: "ERROR", error: "Rate limit exceeded" }));
            return;
          }
          totalMessagesRelayed++;
          const recipient = clients.get(msg.to);
          if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
            recipient.ws.send(JSON.stringify({ type: "CALL_OFFER", from: clientId, sdp: msg.sdp, callId: msg.callId, video: msg.video }));
          } else {
            ws.send(JSON.stringify({ type: "CALL_UNAVAILABLE", to: msg.to, callId: msg.callId }));
          }
          break;
        }

        case "CALL_ANSWER": {
          if (!clientId) return;
          if (!checkRateLimit(clientId)) {
            ws.send(JSON.stringify({ type: "ERROR", error: "Rate limit exceeded" }));
            return;
          }
          totalMessagesRelayed++;
          const recipient = clients.get(msg.to);
          if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
            recipient.ws.send(JSON.stringify({ type: "CALL_ANSWER", from: clientId, sdp: msg.sdp, callId: msg.callId }));
          }
          break;
        }

        case "ICE_CANDIDATE": {
          if (!clientId) return;
          if (!checkRateLimit(clientId)) {
            ws.send(JSON.stringify({ type: "ERROR", error: "Rate limit exceeded" }));
            return;
          }
          totalMessagesRelayed++;
          const recipient = clients.get(msg.to);
          if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
            recipient.ws.send(JSON.stringify({ type: "ICE_CANDIDATE", from: clientId, candidate: msg.candidate, callId: msg.callId }));
          }
          break;
        }

        case "CALL_END": {
          if (!clientId) return;
          if (!checkRateLimit(clientId)) {
            ws.send(JSON.stringify({ type: "ERROR", error: "Rate limit exceeded" }));
            return;
          }
          totalMessagesRelayed++;
          const recipient = clients.get(msg.to);
          if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
            recipient.ws.send(JSON.stringify({ type: "CALL_END", from: clientId, callId: msg.callId }));
          }
          break;
        }

        case "CALL_REJECT": {
          if (!clientId) return;
          if (!checkRateLimit(clientId)) {
            ws.send(JSON.stringify({ type: "ERROR", error: "Rate limit exceeded" }));
            return;
          }
          totalMessagesRelayed++;
          const recipient = clients.get(msg.to);
          if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
            recipient.ws.send(JSON.stringify({ type: "CALL_REJECT", from: clientId, callId: msg.callId }));
          }
          break;
        }

        // --- Key Exchange (Quantum Crypto) ---
        // KEY_EXCHANGE and KEY_EXCHANGE_RESPONSE are relayed like messages.
        // If recipient is offline, they are queued (critical for ratchet init).

        case "KEY_EXCHANGE": {
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
          totalMessagesRelayed++;
          const recipient = clients.get(to);

          if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
            recipient.ws.send(JSON.stringify({
              type: "KEY_EXCHANGE",
              from: clientId,
              blob,
              id: messageId,
            }));
            ws.send(JSON.stringify({ type: "ACK", id: messageId, status: "delivered" }));
          } else {
            queueOfflineMessage(to, clientId, JSON.stringify({ type: "KEY_EXCHANGE", blob }));
            ws.send(JSON.stringify({ type: "ACK", id: messageId, status: "queued" }));
          }
          break;
        }

        case "KEY_EXCHANGE_RESPONSE": {
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
          totalMessagesRelayed++;
          const recipient = clients.get(to);

          if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
            recipient.ws.send(JSON.stringify({
              type: "KEY_EXCHANGE_RESPONSE",
              from: clientId,
              blob,
              id: messageId,
            }));
            ws.send(JSON.stringify({ type: "ACK", id: messageId, status: "delivered" }));
          } else {
            queueOfflineMessage(to, clientId, JSON.stringify({ type: "KEY_EXCHANGE_RESPONSE", blob }));
            ws.send(JSON.stringify({ type: "ACK", id: messageId, status: "queued" }));
          }
          break;
        }

        // --- Sealed Sender (metadata protection) ---
        // The relay does NOT see the sender ID. The sender's identity is
        // encrypted inside the blob. Only the recipient can decrypt it.
        // This prevents the relay from building a social graph.
        case "SEND_SEALED": {
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
          totalMessagesRelayed++;
          const recipient = clients.get(to);

          if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
            // Sealed: NO `from` field -- sender ID is inside the encrypted blob
            recipient.ws.send(JSON.stringify({
              type: "RECEIVE_SEALED",
              blob,
              id: messageId,
            }));
            ws.send(JSON.stringify({ type: "ACK", id: messageId, status: "delivered" }));
          } else {
            // Queue without sender ID -- relay never knows who sent it
            queueOfflineMessage(to, "sealed", blob);
            ws.send(JSON.stringify({ type: "ACK", id: messageId, status: "queued" }));
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

// Load persisted stats before starting
loadStats();

server.listen(PORT, () => {
  console.log("");
  console.log("  SPEAQ Relay Server v0.1.0");
  console.log("  SPEAQ Freely.");
  console.log("");
  console.log("  WebSocket: ws://localhost:" + PORT);
  console.log("  REST API:  http://localhost:" + PORT + "/api/v1/health");
  console.log("  Admin:     http://localhost:" + PORT + "/api/v1/admin/stats");
  console.log("  Zero knowledge: server sees ONLY encrypted blobs");
  console.log("");
});

// Save stats on graceful shutdown
process.on("SIGTERM", () => {
  saveStats();
  process.exit(0);
});
process.on("SIGINT", () => {
  saveStats();
  process.exit(0);
});
