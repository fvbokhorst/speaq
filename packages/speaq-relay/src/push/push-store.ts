/**
 * Push subscription CRUD on Firestore.
 *
 * Document ID = SHA256(endpoint) to keep endpoints out of document IDs
 * while preserving idempotent upserts (same endpoint, same doc).
 */

import crypto from "crypto";
import { getFirestore, PUSH_COLLECTION } from "./firestore-client";
import type { PushSubscriptionDoc, PushKeys, PushPlatform } from "./push-subscription";

const MAX_SUBS_PER_USER = 5;
const CLEANUP_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FAILURES = 5;

function endpointId(endpoint: string): string {
  return crypto.createHash("sha256").update(endpoint).digest("hex");
}

export async function upsertSubscription(input: {
  speaqId: string;
  endpoint: string;
  keys: PushKeys;
  platform: PushPlatform;
}): Promise<{ id: string; created: boolean }> {
  const db = getFirestore();
  const id = endpointId(input.endpoint);
  const docRef = db.collection(PUSH_COLLECTION).doc(id);
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

  const doc: PushSubscriptionDoc = {
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

async function enforcePerUserLimit(speaqId: string): Promise<void> {
  const db = getFirestore();
  const snap = await db
    .collection(PUSH_COLLECTION)
    .where("speaqId", "==", speaqId)
    .orderBy("lastSeenAt", "desc")
    .get();
  if (snap.size <= MAX_SUBS_PER_USER) return;
  const excess = snap.docs.slice(MAX_SUBS_PER_USER);
  const batch = db.batch();
  for (const d of excess) batch.delete(d.ref);
  await batch.commit();
}

export async function listSubscriptionsFor(speaqId: string): Promise<PushSubscriptionDoc[]> {
  const db = getFirestore();
  const snap = await db.collection(PUSH_COLLECTION).where("speaqId", "==", speaqId).get();
  return snap.docs.map((d) => d.data() as PushSubscriptionDoc);
}

export async function removeByEndpoint(endpoint: string): Promise<boolean> {
  const db = getFirestore();
  const id = endpointId(endpoint);
  const docRef = db.collection(PUSH_COLLECTION).doc(id);
  const snap = await docRef.get();
  if (!snap.exists) return false;
  await docRef.delete();
  return true;
}

export async function removeAllFor(speaqId: string): Promise<number> {
  const db = getFirestore();
  const snap = await db.collection(PUSH_COLLECTION).where("speaqId", "==", speaqId).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  for (const d of snap.docs) batch.delete(d.ref);
  await batch.commit();
  return snap.size;
}

export async function recordFailure(endpoint: string, drop: boolean): Promise<void> {
  const db = getFirestore();
  const id = endpointId(endpoint);
  const docRef = db.collection(PUSH_COLLECTION).doc(id);
  if (drop) {
    await docRef.delete().catch(() => undefined);
    return;
  }
  const snap = await docRef.get();
  if (!snap.exists) return;
  const data = snap.data() as PushSubscriptionDoc;
  const next = (data.failureCount || 0) + 1;
  if (next >= MAX_FAILURES) {
    await docRef.delete();
    return;
  }
  await docRef.update({ failureCount: next });
}

export async function cleanupStale(): Promise<number> {
  const db = getFirestore();
  const cutoff = Date.now() - CLEANUP_AGE_MS;
  const snap = await db.collection(PUSH_COLLECTION).where("lastSeenAt", "<", cutoff).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  for (const d of snap.docs) batch.delete(d.ref);
  await batch.commit();
  return snap.size;
}
