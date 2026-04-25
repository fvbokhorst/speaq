/**
 * Push subscription CRUD on Firestore.
 *
 * Document ID = SHA256(endpoint) to keep endpoints out of document IDs
 * while preserving idempotent upserts (same endpoint, same doc).
 */
import type { PushSubscriptionDoc, PushKeys, PushPlatform } from "./push-subscription";
export declare function upsertSubscription(input: {
    speaqId: string;
    endpoint: string;
    keys: PushKeys;
    platform: PushPlatform;
}): Promise<{
    id: string;
    created: boolean;
}>;
export declare function listSubscriptionsFor(speaqId: string): Promise<PushSubscriptionDoc[]>;
export declare function removeByEndpoint(endpoint: string): Promise<boolean>;
export declare function removeAllFor(speaqId: string): Promise<number>;
export declare function recordFailure(endpoint: string, drop: boolean): Promise<void>;
export declare function cleanupStale(): Promise<number>;
