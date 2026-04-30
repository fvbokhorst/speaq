/**
 * SPEAQ - Abuse report service (native).
 *
 * Apple Guideline 1.2 (User-Generated Content): users can report
 * objectionable messages and block abusive senders. The recipient's
 * decrypted view of the offending message is shared with SPEAQ
 * moderators with consent (they already hold the plaintext); zero-
 * knowledge against the relay is preserved.
 *
 * Mirrors the PWA flow in src/app/app/page.tsx (postAbuseReport).
 */

import { Platform } from "react-native";
import pkg from "../../package.json";

const RELAY_HTTPS_BASE = "https://speaq-relay-244491980730.europe-west1.run.app";

export type AbuseReason =
  | "spam"
  | "harassment"
  | "threat"
  | "csam"
  | "illegal"
  | "impersonation"
  | "other";

export interface AbuseReportPayload {
  reporterSpeaqId: string;
  reportedSpeaqId: string;
  reason: AbuseReason;
  source: "app-report" | "app-block";
  comment?: string;
  messageContent?: string;
  messageId?: string;
  language?: string;
}

export async function postAbuseReport(payload: AbuseReportPayload): Promise<boolean> {
  try {
    const res = await fetch(`${RELAY_HTTPS_BASE}/api/v1/abuse-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        appVersion: `native-${Platform.OS}-${(pkg as { version?: string }).version || "unknown"}`,
      }),
    });
    return res.ok;
  } catch (e) {
    console.warn("[abuse] report POST failed:", (e as Error).message);
    return false;
  }
}
