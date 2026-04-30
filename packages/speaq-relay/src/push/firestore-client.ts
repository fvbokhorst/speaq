/**
 * Firestore client singleton for the push module.
 *
 * Uses Application Default Credentials. On Cloud Run this uses the
 * service account automatically. Locally requires
 * GOOGLE_APPLICATION_CREDENTIALS pointing to a service account key.
 */

import { Firestore } from "@google-cloud/firestore";

let instance: Firestore | null = null;

export function getFirestore(): Firestore {
  if (!instance) {
    const projectId = process.env.FIRESTORE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "plexaris-ai-note-taker";
    instance = new Firestore({ projectId });
  }
  return instance;
}

export const PUSH_COLLECTION = "push_subscriptions";
export const ABUSE_REPORTS_COLLECTION = "abuse_reports";
export const DENIED_SPEAQ_IDS_COLLECTION = "denied_speaq_ids";
