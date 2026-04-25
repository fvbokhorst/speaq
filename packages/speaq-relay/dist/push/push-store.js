"use strict";
/**
 * Push subscription CRUD on Firestore.
 *
 * Document ID = SHA256(endpoint) to keep endpoints out of document IDs
 * while preserving idempotent upserts (same endpoint, same doc).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertSubscription = upsertSubscription;
exports.listSubscriptionsFor = listSubscriptionsFor;
exports.removeByEndpoint = removeByEndpoint;
exports.removeAllFor = removeAllFor;
exports.recordFailure = recordFailure;
exports.cleanupStale = cleanupStale;
const crypto_1 = __importDefault(require("crypto"));
const firestore_client_1 = require("./firestore-client");
const MAX_SUBS_PER_USER = 5;
const CLEANUP_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
function endpointId(endpoint) {
    return crypto_1.default.createHash("sha256").update(endpoint).digest("hex");
}
async function upsertSubscription(input) {
    const db = (0, firestore_client_1.getFirestore)();
    const id = endpointId(input.endpoint);
    const docRef = db.collection(firestore_client_1.PUSH_COLLECTION).doc(id);
    const snap = await docRef.get();
    const now = Date.now();
    if (snap.exists) {
        await docRef.update({
            speaqId: input.speaqId,
            keys: input.keys,
            platform: input.platform,
            lastSeenAt: now,
            failureCount: 0,
        });
        return { id, created: false };
    }
    const doc = {
        speaqId: input.speaqId,
        endpoint: input.endpoint,
        keys: input.keys,
        platform: input.platform,
        createdAt: now,
        lastSeenAt: now,
        failureCount: 0,
    };
    await docRef.set(doc);
    await enforcePerUserLimit(input.speaqId);
    return { id, created: true };
}
async function enforcePerUserLimit(speaqId) {
    const db = (0, firestore_client_1.getFirestore)();
    const snap = await db.collection(firestore_client_1.PUSH_COLLECTION).where("speaqId", "==", speaqId).get();
    if (snap.size <= MAX_SUBS_PER_USER)
        return;
    // Sort in-memory: Firestore composite index would need to be provisioned
    // per-deployment; for max 5 subs per user the JS sort is trivial and
    // avoids the index ceremony.
    const sorted = snap.docs.slice().sort((a, b) => {
        const aT = a.data().lastSeenAt || 0;
        const bT = b.data().lastSeenAt || 0;
        return bT - aT;
    });
    const excess = sorted.slice(MAX_SUBS_PER_USER);
    const batch = db.batch();
    for (const d of excess)
        batch.delete(d.ref);
    await batch.commit();
}
async function listSubscriptionsFor(speaqId) {
    const db = (0, firestore_client_1.getFirestore)();
    const snap = await db.collection(firestore_client_1.PUSH_COLLECTION).where("speaqId", "==", speaqId).get();
    return snap.docs.map((d) => d.data());
}
async function removeByEndpoint(endpoint) {
    const db = (0, firestore_client_1.getFirestore)();
    const id = endpointId(endpoint);
    const docRef = db.collection(firestore_client_1.PUSH_COLLECTION).doc(id);
    const snap = await docRef.get();
    if (!snap.exists)
        return false;
    await docRef.delete();
    return true;
}
async function removeAllFor(speaqId) {
    const db = (0, firestore_client_1.getFirestore)();
    const snap = await db.collection(firestore_client_1.PUSH_COLLECTION).where("speaqId", "==", speaqId).get();
    if (snap.empty)
        return 0;
    const batch = db.batch();
    for (const d of snap.docs)
        batch.delete(d.ref);
    await batch.commit();
    return snap.size;
}
async function recordFailure(endpoint, drop) {
    const db = (0, firestore_client_1.getFirestore)();
    const id = endpointId(endpoint);
    const docRef = db.collection(firestore_client_1.PUSH_COLLECTION).doc(id);
    if (drop) {
        await docRef.delete().catch(() => undefined);
        return;
    }
    const snap = await docRef.get();
    if (!snap.exists)
        return;
    const data = snap.data();
    const next = (data.failureCount || 0) + 1;
    if (next >= MAX_FAILURES) {
        await docRef.delete();
        return;
    }
    await docRef.update({ failureCount: next });
}
async function cleanupStale() {
    const db = (0, firestore_client_1.getFirestore)();
    const cutoff = Date.now() - CLEANUP_AGE_MS;
    const snap = await db.collection(firestore_client_1.PUSH_COLLECTION).where("lastSeenAt", "<", cutoff).get();
    if (snap.empty)
        return 0;
    const batch = db.batch();
    for (const d of snap.docs)
        batch.delete(d.ref);
    await batch.commit();
    return snap.size;
}
//# sourceMappingURL=push-store.js.map