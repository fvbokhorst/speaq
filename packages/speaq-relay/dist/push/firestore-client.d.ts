/**
 * Firestore client singleton for the push module.
 *
 * Uses Application Default Credentials. On Cloud Run this uses the
 * service account automatically. Locally requires
 * GOOGLE_APPLICATION_CREDENTIALS pointing to a service account key.
 */
import { Firestore } from "@google-cloud/firestore";
export declare function getFirestore(): Firestore;
export declare const PUSH_COLLECTION = "push_subscriptions";
