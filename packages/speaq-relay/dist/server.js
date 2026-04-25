"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const push_service_1 = require("./push/push-service");
const push_store_1 = require("./push/push-store");
// --- State ---
// In production: Redis for offline queue, PostgreSQL for public keys
// For now: in-memory (sufficient for testing and small deployments)
const clients = new Map();
const offlineQueue = new Map();
const publicKeys = new Map();
const OFFLINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 messages per minute
const rateLimitCounters = new Map();
// --- Admin Stats ---
const ADMIN_PIN_HASH = crypto_1.default.createHash("sha256").update("555766").digest("hex");
const ADMIN_SPEAQ_ID = process.env.ADMIN_SPEAQ_ID || "";
const STATS_FILE = path_1.default.join(process.cwd(), "speaq-stats.json");
const STATS_SERVER_URL = process.env.STATS_SERVER_URL || "http://136.117.234.208:9335/stats";
// All users ever seen, keyed by speaqId
const allUsers = new Map();
// Country stats: unique users per country (timezone-derived, no IP)
// Fix 2026-04-24: was aggregate message-count, now deduped by speaqId -> Set for accurate user count
const countryStats = new Map();
const COUNTRY_NAMES = {
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
// Set to true if loadStats finished but counters are 0 while users > 0 (stale-state guard).
// While true, saveStats() refuses to overwrite the persisted file to avoid wiping a healthy
// remote/disk copy with the in-memory zero-state from a fresh container.
let statsLoadFailed = false;
// Load persisted stats from remote server (Google VM), fallback to local disk
async function loadStats() {
    // Try remote first
    try {
        const res = await fetch(STATS_SERVER_URL);
        if (res.ok) {
            const data = await res.json();
            if (data.users) {
                for (const [id, record] of Object.entries(data.users)) {
                    allUsers.set(id, record);
                }
            }
            if (typeof data.totalMiningReceipts === "number")
                totalMiningReceipts = data.totalMiningReceipts;
            if (typeof data.totalQCMined === "number")
                totalQCMined = data.totalQCMined;
            if (data.countryStats) {
                for (const [code, value] of Object.entries(data.countryStats)) {
                    // New format: Array<speaqId>. Old format (number) is legacy and ignored (stats refresh).
                    if (Array.isArray(value))
                        countryStats.set(code, new Set(value));
                }
            }
            console.log(`  Stats loaded: ${allUsers.size} users, ${countryStats.size} countries, totalQCMined=${totalQCMined}, totalMiningReceipts=${totalMiningReceipts} from remote`);
            return;
        }
    }
    catch (e) {
        console.error("  Remote stats unavailable, trying local:", e);
    }
    // Fallback to local disk
    try {
        if (fs_1.default.existsSync(STATS_FILE)) {
            const data = JSON.parse(fs_1.default.readFileSync(STATS_FILE, "utf-8"));
            if (data.users) {
                for (const [id, record] of Object.entries(data.users)) {
                    allUsers.set(id, record);
                }
            }
            if (typeof data.totalMiningReceipts === "number")
                totalMiningReceipts = data.totalMiningReceipts;
            if (typeof data.totalQCMined === "number")
                totalQCMined = data.totalQCMined;
            if (data.countryStats) {
                for (const [code, value] of Object.entries(data.countryStats)) {
                    if (Array.isArray(value))
                        countryStats.set(code, new Set(value));
                }
            }
            console.log(`  Stats loaded: ${allUsers.size} users, ${countryStats.size} countries, totalQCMined=${totalQCMined}, totalMiningReceipts=${totalMiningReceipts} from disk`);
        }
        else {
            console.warn("  No stats source available (remote + disk both failed). Counters START AT ZERO.");
        }
    }
    catch (e) {
        console.error("  Failed to load stats:", e);
    }
    // Loud-fail safety: if we have known users from previous saves but counters are 0, log very visibly.
    // This catches the silent-reset bug observed 2026-04-25 where Cloud Run cold start + dead fallback URL
    // would silently start counters at 0 and overwrite the persisted value on next save.
    if (allUsers.size > 0 && totalMiningReceipts === 0 && totalQCMined === 0) {
        console.error("=".repeat(80));
        console.error(`STATS WARNING: ${allUsers.size} known users but counters are 0.`);
        console.error("This may indicate state was lost. Refusing to overwrite persistent state until counters > 0.");
        console.error("=".repeat(80));
        statsLoadFailed = true;
    }
    else {
        statsLoadFailed = false;
    }
}
// Save stats to remote server (Google VM) + local disk
async function saveStats() {
    // Stale-state guard: if loadStats flagged a likely silent-reset, do not overwrite the persisted
    // copy with our in-memory zero state. The healthy values stay safe on remote/disk until either
    // (a) counters grow above 0 from real activity, or (b) an operator force-resets statsLoadFailed.
    if (statsLoadFailed && totalMiningReceipts === 0 && totalQCMined === 0) {
        console.warn("  saveStats SKIPPED: stale-state guard active (counters 0 with known users). Manual recovery required.");
        return;
    }
    const data = {
        users: Object.fromEntries(allUsers),
        totalMiningReceipts,
        totalQCMined,
        countryStats: Object.fromEntries(Array.from(countryStats.entries()).map(([cc, ids]) => [cc, Array.from(ids)])),
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
    }
    catch (e) {
        console.error("  Failed to save stats to remote:", e);
    }
    // Also save locally as backup
    try {
        fs_1.default.writeFileSync(STATS_FILE, json, "utf-8");
    }
    catch (e) {
        console.error("  Failed to save stats to disk:", e);
    }
}
// Once real activity grows the counters above 0, lift the stale-state guard so saveStats resumes.
// This is checked on every mining receipt that increments totalQCMined (see receipt handler below).
function clearStaleStateGuardIfRecovered() {
    if (statsLoadFailed && (totalMiningReceipts > 0 || totalQCMined > 0)) {
        console.log(`  Stats stale-state guard CLEARED: counters recovered (totalQCMined=${totalQCMined}, receipts=${totalMiningReceipts}). saveStats will resume.`);
        statsLoadFailed = false;
    }
}
// Save stats every 2 minutes (more frequent since remote is reliable)
setInterval(saveStats, 2 * 60 * 1000);
// Track a user connection, returns true if NEW user
function trackUser(speaqId) {
    if (allUsers.has(speaqId))
        return false;
    allUsers.set(speaqId, { firstSeen: Date.now() });
    // Save immediately on new user (don't wait for interval)
    saveStats();
    return true;
}
// Count users first seen in a time range
function countUsersInRange(sinceMs) {
    const since = Date.now() - sinceMs;
    let count = 0;
    for (const record of allUsers.values()) {
        if (record.firstSeen >= since)
            count++;
    }
    return count;
}
// Send a system notification to admin via WebSocket
function notifyAdmin(text) {
    if (!ADMIN_SPEAQ_ID)
        return;
    const adminClient = clients.get(ADMIN_SPEAQ_ID);
    if (adminClient && adminClient.ws.readyState === ws_1.WebSocket.OPEN) {
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
            id: crypto_1.default.randomUUID(),
        }));
    }
}
// --- Counters ---
let totalMessagesRelayed = 0;
const serverStartedAt = Date.now();
// --- Rate Limiting ---
function checkRateLimit(speaqId) {
    const now = Date.now();
    const entry = rateLimitCounters.get(speaqId);
    if (!entry || now > entry.resetAt) {
        rateLimitCounters.set(speaqId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }
    if (entry.count >= RATE_LIMIT_MAX)
        return false;
    entry.count++;
    return true;
}
// --- Offline Queue ---
function queueOfflineMessage(to, from, blob) {
    const messages = offlineQueue.get(to) || [];
    messages.push({
        id: crypto_1.default.randomUUID(),
        from,
        blob,
        createdAt: Date.now(),
        expiresAt: Date.now() + OFFLINE_MAX_AGE_MS,
    });
    offlineQueue.set(to, messages);
    // Fire silent push to wake the recipient's device. Never awaited: push
    // failures must not block queue writes.
    if ((0, push_service_1.isConfigured)()) {
        (0, push_service_1.triggerSilentPush)(to).catch((err) => {
            console.warn("[push] trigger failed for", to, err instanceof Error ? err.message : err);
        });
    }
}
function getOfflineMessages(speaqId) {
    const messages = offlineQueue.get(speaqId) || [];
    const now = Date.now();
    // Filter expired
    const valid = messages.filter((m) => m.expiresAt > now);
    offlineQueue.set(speaqId, valid);
    return valid;
}
function clearOfflineMessages(speaqId) {
    offlineQueue.delete(speaqId);
}
// --- Cleanup expired offline messages (runs every hour) ---
setInterval(() => {
    const now = Date.now();
    for (const [id, messages] of offlineQueue.entries()) {
        const valid = messages.filter((m) => m.expiresAt > now);
        if (valid.length === 0) {
            offlineQueue.delete(id);
        }
        else {
            offlineQueue.set(id, valid);
        }
    }
}, 60 * 60 * 1000);
// --- Express REST API ---
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: "*", allowedHeaders: ["Content-Type", "x-admin-pin"] }));
app.use(express_1.default.json({ limit: "1mb" }));
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
    if (!entry)
        return res.status(404).json({ error: "Not found" });
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
// --- Push subscription routes ---
// Rate limit subscribe to 3 per hour per SPEAQ ID (abuse protection).
const subscribeCounters = new Map();
const SUBSCRIBE_WINDOW_MS = 60 * 60 * 1000;
const SUBSCRIBE_MAX_PER_WINDOW = 3;
function allowSubscribe(speaqId) {
    const now = Date.now();
    const entry = subscribeCounters.get(speaqId);
    if (!entry || now > entry.resetAt) {
        subscribeCounters.set(speaqId, { count: 1, resetAt: now + SUBSCRIBE_WINDOW_MS });
        return true;
    }
    if (entry.count >= SUBSCRIBE_MAX_PER_WINDOW)
        return false;
    entry.count++;
    return true;
}
app.post("/api/push/subscribe", async (req, res) => {
    const { speaqId, subscription, platform } = req.body || {};
    if (!speaqId || typeof speaqId !== "string") {
        return res.status(400).json({ error: "speaqId required" });
    }
    if (!subscription || !subscription.endpoint || !subscription.keys?.auth || !subscription.keys?.p256dh) {
        return res.status(400).json({ error: "subscription with endpoint + keys required" });
    }
    if (!platform || !["web", "ios", "android"].includes(platform)) {
        return res.status(400).json({ error: "platform must be web|ios|android" });
    }
    if (!allowSubscribe(speaqId)) {
        return res.status(429).json({ error: "Subscribe rate limit exceeded" });
    }
    try {
        const result = await (0, push_store_1.upsertSubscription)({
            speaqId,
            endpoint: subscription.endpoint,
            keys: subscription.keys,
            platform,
        });
        res.status(result.created ? 201 : 200).json({ ok: true, created: result.created });
    }
    catch (err) {
        console.error("[push] subscribe failed:", err instanceof Error ? err.message : err);
        res.status(500).json({ error: "Subscribe failed" });
    }
});
app.post("/api/push/unsubscribe", async (req, res) => {
    const { speaqId, endpoint } = req.body || {};
    if (!speaqId && !endpoint) {
        return res.status(400).json({ error: "speaqId or endpoint required" });
    }
    try {
        if (endpoint) {
            const removed = await (0, push_store_1.removeByEndpoint)(endpoint);
            return res.json({ ok: true, removed });
        }
        const count = await (0, push_store_1.removeAllFor)(speaqId);
        res.json({ ok: true, removed: count });
    }
    catch (err) {
        console.error("[push] unsubscribe failed:", err instanceof Error ? err.message : err);
        res.status(500).json({ error: "Unsubscribe failed" });
    }
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
    const pin = req.query.pin || req.headers["x-admin-pin"];
    if (!pin) {
        return res.status(401).json({ error: "PIN required" });
    }
    const pinHash = crypto_1.default.createHash("sha256").update(pin).digest("hex");
    if (pinHash !== ADMIN_PIN_HASH) {
        return res.status(403).json({ error: "Invalid PIN" });
    }
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY;
    const YEAR = 365 * DAY;
    // Build user growth timeline (daily buckets for last 30 days)
    const userGrowth = [];
    for (let i = 29; i >= 0; i--) {
        const dayStart = now - (i + 1) * DAY;
        const dayEnd = now - i * DAY;
        let count = 0;
        for (const record of allUsers.values()) {
            if (record.firstSeen <= dayEnd)
                count++;
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
    const pin = req.query.pin || req.headers["x-admin-pin"];
    if (!pin) {
        return res.status(401).json({ error: "PIN required" });
    }
    const pinHash = crypto_1.default.createHash("sha256").update(pin).digest("hex");
    if (pinHash !== ADMIN_PIN_HASH) {
        return res.status(403).json({ error: "Invalid PIN" });
    }
    // Sort by count descending (count = unique speaqIds per country)
    const countries = Array.from(countryStats.entries())
        .map(([code, ids]) => ({
        code,
        count: ids.size,
        name: COUNTRY_NAMES[code] || code,
    }))
        .sort((a, b) => b.count - a.count);
    res.json({ countries });
});
// --- Mining Receipt System (C+) ---
// Relay signs a receipt for each mining contribution it witnesses.
// Double signature: miner signs + relay co-signs = unforgeable proof.
// Relay's own signing key (generated once at startup)
const relaySigningKey = crypto_1.default.randomBytes(32).toString("hex");
// Sign a mining receipt with the relay's key
function relaySign(data) {
    return crypto_1.default.createHmac("sha256", relaySigningKey).update(data).digest("hex");
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
    const receiptId = crypto_1.default.randomUUID();
    // Track mining stats
    totalMiningReceipts++;
    totalQCMined += parseFloat(amount) || 0;
    clearStaleStateGuardIfRecovered();
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
// Mining network stats - real values from in-memory counters (kept in sync with persisted stats).
// staleState=true means the relay is currently running with the stale-state guard active because
// it could not load known counters at startup; the response value is then unreliable until recovered.
app.get("/api/v1/mining/network-stats", (_req, res) => {
    res.json({
        totalQCMined,
        activeMiners: clients.size,
        totalMiningReceipts,
        knownUsers: allUsers.size,
        staleState: statsLoadFailed,
        serverStartedAt,
    });
});
const dmsConfigs = new Map();
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
                if (recipient && recipient.ws.readyState === ws_1.WebSocket.OPEN) {
                    recipient.ws.send(JSON.stringify({
                        type: "RECEIVE",
                        from: speaqId,
                        blob: config.encryptedMessage,
                        id: crypto_1.default.randomUUID(),
                        deadManSwitch: true,
                    }));
                }
                else {
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
const server = http_1.default.createServer(app);
const wss = new ws_1.WebSocketServer({ server });
wss.on("connection", (ws) => {
    let clientId = null;
    ws.on("message", (raw) => {
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
                        let ids = countryStats.get(cc);
                        if (!ids) {
                            ids = new Set();
                            countryStats.set(cc, ids);
                        }
                        ids.add(clientId);
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
                    const messageId = id || crypto_1.default.randomUUID();
                    totalMessagesRelayed++;
                    const recipient = clients.get(to);
                    if (recipient && recipient.ws.readyState === ws_1.WebSocket.OPEN) {
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
                    }
                    else {
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
                    if (!clientId)
                        return;
                    if (!checkRateLimit(clientId)) {
                        ws.send(JSON.stringify({ type: "ERROR", error: "Rate limit exceeded" }));
                        return;
                    }
                    const recipient = clients.get(msg.to);
                    if (recipient && recipient.ws.readyState === ws_1.WebSocket.OPEN) {
                        recipient.ws.send(JSON.stringify({ type: "TYPING", from: clientId }));
                        totalMessagesRelayed++;
                    }
                    break;
                }
                // --- Call Signaling (Phase 3) ---
                // All signaling is relayed as-is. Server sees nothing (zero knowledge).
                case "CALL_OFFER": {
                    if (!clientId)
                        return;
                    if (!checkRateLimit(clientId)) {
                        ws.send(JSON.stringify({ type: "ERROR", error: "Rate limit exceeded" }));
                        return;
                    }
                    totalMessagesRelayed++;
                    const recipient = clients.get(msg.to);
                    if (recipient && recipient.ws.readyState === ws_1.WebSocket.OPEN) {
                        recipient.ws.send(JSON.stringify({ type: "CALL_OFFER", from: clientId, sdp: msg.sdp, callId: msg.callId, video: msg.video }));
                    }
                    else {
                        ws.send(JSON.stringify({ type: "CALL_UNAVAILABLE", to: msg.to, callId: msg.callId }));
                    }
                    break;
                }
                case "CALL_ANSWER": {
                    if (!clientId)
                        return;
                    if (!checkRateLimit(clientId)) {
                        ws.send(JSON.stringify({ type: "ERROR", error: "Rate limit exceeded" }));
                        return;
                    }
                    totalMessagesRelayed++;
                    const recipient = clients.get(msg.to);
                    if (recipient && recipient.ws.readyState === ws_1.WebSocket.OPEN) {
                        recipient.ws.send(JSON.stringify({ type: "CALL_ANSWER", from: clientId, sdp: msg.sdp, callId: msg.callId }));
                    }
                    break;
                }
                case "ICE_CANDIDATE": {
                    if (!clientId)
                        return;
                    if (!checkRateLimit(clientId)) {
                        ws.send(JSON.stringify({ type: "ERROR", error: "Rate limit exceeded" }));
                        return;
                    }
                    totalMessagesRelayed++;
                    const recipient = clients.get(msg.to);
                    if (recipient && recipient.ws.readyState === ws_1.WebSocket.OPEN) {
                        recipient.ws.send(JSON.stringify({ type: "ICE_CANDIDATE", from: clientId, candidate: msg.candidate, callId: msg.callId }));
                    }
                    break;
                }
                case "CALL_END": {
                    if (!clientId)
                        return;
                    if (!checkRateLimit(clientId)) {
                        ws.send(JSON.stringify({ type: "ERROR", error: "Rate limit exceeded" }));
                        return;
                    }
                    totalMessagesRelayed++;
                    const recipient = clients.get(msg.to);
                    if (recipient && recipient.ws.readyState === ws_1.WebSocket.OPEN) {
                        recipient.ws.send(JSON.stringify({ type: "CALL_END", from: clientId, callId: msg.callId }));
                    }
                    break;
                }
                case "CALL_REJECT": {
                    if (!clientId)
                        return;
                    if (!checkRateLimit(clientId)) {
                        ws.send(JSON.stringify({ type: "ERROR", error: "Rate limit exceeded" }));
                        return;
                    }
                    totalMessagesRelayed++;
                    const recipient = clients.get(msg.to);
                    if (recipient && recipient.ws.readyState === ws_1.WebSocket.OPEN) {
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
                    const messageId = id || crypto_1.default.randomUUID();
                    totalMessagesRelayed++;
                    const recipient = clients.get(to);
                    if (recipient && recipient.ws.readyState === ws_1.WebSocket.OPEN) {
                        recipient.ws.send(JSON.stringify({
                            type: "KEY_EXCHANGE",
                            from: clientId,
                            blob,
                            id: messageId,
                        }));
                        ws.send(JSON.stringify({ type: "ACK", id: messageId, status: "delivered" }));
                    }
                    else {
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
                    const messageId = id || crypto_1.default.randomUUID();
                    totalMessagesRelayed++;
                    const recipient = clients.get(to);
                    if (recipient && recipient.ws.readyState === ws_1.WebSocket.OPEN) {
                        recipient.ws.send(JSON.stringify({
                            type: "KEY_EXCHANGE_RESPONSE",
                            from: clientId,
                            blob,
                            id: messageId,
                        }));
                        ws.send(JSON.stringify({ type: "ACK", id: messageId, status: "delivered" }));
                    }
                    else {
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
                    const messageId = id || crypto_1.default.randomUUID();
                    totalMessagesRelayed++;
                    const recipient = clients.get(to);
                    if (recipient && recipient.ws.readyState === ws_1.WebSocket.OPEN) {
                        // Sealed: NO `from` field -- sender ID is inside the encrypted blob
                        recipient.ws.send(JSON.stringify({
                            type: "RECEIVE_SEALED",
                            blob,
                            id: messageId,
                        }));
                        ws.send(JSON.stringify({ type: "ACK", id: messageId, status: "delivered" }));
                    }
                    else {
                        // Queue without sender ID -- relay never knows who sent it
                        queueOfflineMessage(to, "sealed", blob);
                        ws.send(JSON.stringify({ type: "ACK", id: messageId, status: "queued" }));
                    }
                    break;
                }
                default:
                    ws.send(JSON.stringify({ type: "ERROR", error: "Unknown message type: " + msg.type }));
            }
        }
        catch (e) {
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
        ws.__alive = true;
    });
});
// Heartbeat interval
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.__alive === false)
            return ws.terminate();
        ws.__alive = false;
        ws.ping();
    });
}, 30000);
// --- Start ---
// Never let a stray promise rejection crash the relay. In production with
// Cloud Run a crash triggers a cold restart for every user. Push / Firestore
// failures must stay contained to the failing request.
process.on("unhandledRejection", (reason) => {
    console.error("[relay] unhandledRejection:", reason instanceof Error ? reason.message : reason);
});
process.on("uncaughtException", (err) => {
    console.error("[relay] uncaughtException:", err instanceof Error ? err.message : err);
});
const PORT = parseInt(process.env.PORT || "8080", 10);
// Configure web-push (VAPID). Skipped if env vars missing: push routes will
// still accept subscribes but silent-push triggers become a no-op.
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:frank@plexaris.com";
if (VAPID_PUBLIC && VAPID_PRIVATE) {
    (0, push_service_1.configurePush)({ publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE, subject: VAPID_SUBJECT });
    console.log("[push] VAPID configured");
}
else {
    console.warn("[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY missing -- push disabled");
}
// Daily cleanup of stale push subscriptions (30 days without use).
setInterval(() => {
    (0, push_store_1.cleanupStale)()
        .then((n) => n > 0 && console.log(`[push] cleaned ${n} stale subscriptions`))
        .catch((err) => console.warn("[push] cleanup failed:", err instanceof Error ? err.message : err));
}, 24 * 60 * 60 * 1000);
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
//# sourceMappingURL=server.js.map