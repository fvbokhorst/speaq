/**
 * Push subscription types.
 *
 * Zero-knowledge: relay only stores routing metadata (endpoint + keys).
 * No message content, no recipient real identity.
 */
export type PushPlatform = "web" | "ios" | "android";
export interface PushKeys {
    auth: string;
    p256dh: string;
}
export interface PushSubscriptionDoc {
    speaqId: string;
    endpoint: string;
    keys: PushKeys;
    platform: PushPlatform;
    createdAt: number;
    lastSeenAt: number;
    failureCount: number;
}
export interface SubscribeRequest {
    speaqId: string;
    subscription: {
        endpoint: string;
        keys: PushKeys;
    };
    platform: PushPlatform;
}
