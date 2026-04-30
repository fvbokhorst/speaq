/**
 * SPEAQ - Abuse report and denied SPEAQ ID storage.
 *
 * Apple App Store Guideline 1.2 (User-Generated Content) compliance.
 * SPEAQ is end-to-end encrypted: the relay cannot moderate content.
 * Enforcement uses identity-level moderation:
 *
 * 1. Users report objectionable messages from their device. Reporting
 *    consents to share the recipient's decrypted view of the offending
 *    message with SPEAQ moderators (this does NOT break zero-knowledge,
 *    because the recipient already holds the plaintext).
 *
 * 2. Moderators triage reports in the admin dashboard within 24 hours.
 *    Confirmed violations result in writing the offending speaqId to the
 *    `denied_speaq_ids` collection.
 *
 * 3. The relay reads the deny-list at connect-time and rejects WS auth
 *    from suspended SPEAQ IDs (network-level eject).
 */

import crypto from "crypto";
import {
  getFirestore,
  ABUSE_REPORTS_COLLECTION,
  DENIED_SPEAQ_IDS_COLLECTION,
} from "../push/firestore-client";

export type AbuseReportReason =
  | "spam"
  | "harassment"
  | "threat"
  | "csam"
  | "illegal"
  | "impersonation"
  | "other";

export interface AbuseReportInput {
  reporterSpeaqId: string;
  reportedSpeaqId: string;
  reason: AbuseReportReason;
  comment?: string;
  // The recipient's decrypted view of the offending message. Truncated
  // to 4 KB to bound storage cost. Optional because some reports (block
  // without specific message) only carry the SPEAQ ID.
  messageContent?: string;
  messageId?: string;
  source: "app-report" | "app-block" | "email";
  appVersion?: string;
  language?: string;
}

const MAX_MESSAGE_LEN = 4096;
const VALID_REASONS = new Set<AbuseReportReason>([
  "spam",
  "harassment",
  "threat",
  "csam",
  "illegal",
  "impersonation",
  "other",
]);

export function validateAbuseReport(
  input: Partial<AbuseReportInput>,
): { ok: true } | { ok: false; error: string } {
  if (!input.reporterSpeaqId || typeof input.reporterSpeaqId !== "string") {
    return { ok: false, error: "reporterSpeaqId required" };
  }
  if (!input.reportedSpeaqId || typeof input.reportedSpeaqId !== "string") {
    return { ok: false, error: "reportedSpeaqId required" };
  }
  if (input.reporterSpeaqId === input.reportedSpeaqId) {
    return { ok: false, error: "cannot report yourself" };
  }
  if (!input.reason || !VALID_REASONS.has(input.reason as AbuseReportReason)) {
    return { ok: false, error: "reason must be one of " + Array.from(VALID_REASONS).join(",") };
  }
  if (!input.source || !["app-report", "app-block", "email"].includes(input.source)) {
    return { ok: false, error: "source must be app-report|app-block|email" };
  }
  return { ok: true };
}

export async function createAbuseReport(input: AbuseReportInput): Promise<{ id: string }> {
  const db = getFirestore();
  const now = Date.now();
  const id = crypto.randomBytes(12).toString("hex");

  const doc = {
    reporterSpeaqId: input.reporterSpeaqId,
    reportedSpeaqId: input.reportedSpeaqId,
    reason: input.reason,
    comment: (input.comment || "").slice(0, 1000),
    messageContent: (input.messageContent || "").slice(0, MAX_MESSAGE_LEN),
    messageId: input.messageId || null,
    source: input.source,
    appVersion: input.appVersion || null,
    language: input.language || null,
    status: "open" as "open" | "actioned" | "dismissed",
    createdAt: now,
    actionedAt: null as number | null,
    actionedBy: null as string | null,
    resolution: null as null | "ban" | "dismiss" | "defer",
  };

  await db.collection(ABUSE_REPORTS_COLLECTION).doc(id).set(doc);
  return { id };
}

// --- Deny list (used at WS auth time) ---

let denyListCache: Set<string> = new Set();
let denyListLoadedAt = 0;
const DENY_CACHE_TTL_MS = 60 * 1000;

export async function loadDenyList(force = false): Promise<Set<string>> {
  const age = Date.now() - denyListLoadedAt;
  if (!force && denyListLoadedAt > 0 && age < DENY_CACHE_TTL_MS) {
    return denyListCache;
  }
  try {
    const db = getFirestore();
    const snap = await db.collection(DENIED_SPEAQ_IDS_COLLECTION).get();
    const next = new Set<string>();
    snap.forEach((doc) => {
      const data = doc.data();
      if (data && data.active !== false) {
        next.add(doc.id);
      }
    });
    denyListCache = next;
    denyListLoadedAt = Date.now();
    return denyListCache;
  } catch (err) {
    console.error("[abuse] loadDenyList failed:", err instanceof Error ? err.message : err);
    return denyListCache;
  }
}

export function isSpeaqIdDeniedSync(speaqId: string): boolean {
  return denyListCache.has(speaqId);
}

export async function denySpeaqId(input: {
  speaqId: string;
  reason: string;
  reportRef?: string;
  actionedBy?: string;
}): Promise<void> {
  const db = getFirestore();
  await db.collection(DENIED_SPEAQ_IDS_COLLECTION).doc(input.speaqId).set({
    speaqId: input.speaqId,
    reason: input.reason,
    reportRef: input.reportRef || null,
    actionedBy: input.actionedBy || "system",
    bannedAt: Date.now(),
    active: true,
  });
  denyListCache.add(input.speaqId);
}

export async function unbanSpeaqId(speaqId: string): Promise<void> {
  const db = getFirestore();
  await db.collection(DENIED_SPEAQ_IDS_COLLECTION).doc(speaqId).update({
    active: false,
    unbannedAt: Date.now(),
  });
  denyListCache.delete(speaqId);
}

// --- Admin moderator helpers ---

export interface AbuseReportSummary {
  id: string;
  reporterSpeaqId: string;
  reportedSpeaqId: string;
  reason: string;
  comment: string;
  messageContent: string;
  messageId: string | null;
  source: string;
  status: "open" | "actioned" | "dismissed";
  createdAt: number;
  actionedAt: number | null;
  actionedBy: string | null;
  resolution: null | "ban" | "dismiss" | "defer";
  language?: string | null;
  appVersion?: string | null;
}

export async function listAbuseReports(opts: { status?: "open" | "actioned" | "dismissed"; limit?: number } = {}): Promise<AbuseReportSummary[]> {
  const db = getFirestore();
  let q: FirebaseFirestore.Query = db.collection(ABUSE_REPORTS_COLLECTION);
  if (opts.status) q = q.where("status", "==", opts.status);
  q = q.orderBy("createdAt", "desc").limit(opts.limit || 100);
  const snap = await q.get();
  return snap.docs.map((doc) => {
    const d = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      reporterSpeaqId: String(d.reporterSpeaqId || ""),
      reportedSpeaqId: String(d.reportedSpeaqId || ""),
      reason: String(d.reason || ""),
      comment: String(d.comment || ""),
      messageContent: String(d.messageContent || ""),
      messageId: (d.messageId as string | null) || null,
      source: String(d.source || ""),
      status: (d.status as "open" | "actioned" | "dismissed") || "open",
      createdAt: Number(d.createdAt) || 0,
      actionedAt: (d.actionedAt as number | null) || null,
      actionedBy: (d.actionedBy as string | null) || null,
      resolution: (d.resolution as null | "ban" | "dismiss" | "defer") || null,
      language: (d.language as string | null) || null,
      appVersion: (d.appVersion as string | null) || null,
    };
  });
}

export async function actionAbuseReport(input: {
  reportId: string;
  action: "ban" | "dismiss" | "defer";
  actionedBy?: string;
  banReason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getFirestore();
  const ref = db.collection(ABUSE_REPORTS_COLLECTION).doc(input.reportId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { ok: false, error: "report not found" };
  }
  const data = snap.data() as Record<string, unknown>;
  const reportedSpeaqId = String(data.reportedSpeaqId || "");

  if (input.action === "ban") {
    if (!reportedSpeaqId) {
      return { ok: false, error: "reportedSpeaqId missing on report" };
    }
    await denySpeaqId({
      speaqId: reportedSpeaqId,
      reason: input.banReason || `report ${input.reportId} (${data.reason || "unknown"})`,
      reportRef: input.reportId,
      actionedBy: input.actionedBy || "moderator",
    });
    await ref.update({
      status: "actioned",
      resolution: "ban",
      actionedAt: Date.now(),
      actionedBy: input.actionedBy || "moderator",
    });
    return { ok: true };
  }

  if (input.action === "dismiss") {
    await ref.update({
      status: "dismissed",
      resolution: "dismiss",
      actionedAt: Date.now(),
      actionedBy: input.actionedBy || "moderator",
    });
    return { ok: true };
  }

  if (input.action === "defer") {
    await ref.update({
      status: "open",
      resolution: "defer",
      actionedAt: Date.now(),
      actionedBy: input.actionedBy || "moderator",
    });
    return { ok: true };
  }

  return { ok: false, error: "unknown action" };
}
