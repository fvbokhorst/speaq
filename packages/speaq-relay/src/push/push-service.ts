/**
 * Push service: silent push trigger + rate limiting.
 *
 * Silent push = data-only payload with no content. Service Worker on the
 * client decides what notification to show (e.g. "new message"). The relay
 * never sees or transmits the message body.
 */

import webpush from "web-push";
import { listSubscriptionsFor, recordFailure } from "./push-store";

const TRIGGER_WINDOW_MS = 60 * 1000;
const TRIGGER_MAX_PER_WINDOW = 10;
const triggerCounters = new Map<string, { count: number; resetAt: number }>();

let configured = false;

export function configurePush(opts: { publicKey: string; privateKey: string; subject: string }): void {
  webpush.setVapidDetails(opts.subject, opts.publicKey, opts.privateKey);
  configured = true;
}

export function isConfigured(): boolean {
  return configured;
}

function allowTrigger(speaqId: string): boolean {
  const now = Date.now();
  const entry = triggerCounters.get(speaqId);
  if (!entry || now > entry.resetAt) {
    triggerCounters.set(speaqId, { count: 1, resetAt: now + TRIGGER_WINDOW_MS });
    return true;
  }
  if (entry.count >= TRIGGER_MAX_PER_WINDOW) return false;
  entry.count++;
  return true;
}

export async function triggerSilentPush(speaqId: string): Promise<void> {
  if (!configured) return;
  if (!allowTrigger(speaqId)) return;

  const subs = await listSubscriptionsFor(speaqId);
  if (subs.length === 0) return;

  const payload = JSON.stringify({ t: "msg", ts: Date.now() });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload,
          { TTL: 60, urgency: "high" }
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        const drop = statusCode === 404 || statusCode === 410;
        await recordFailure(sub.endpoint, drop).catch(() => undefined);
      }
    })
  );
}

// Like triggerSilentPush but signals an incoming call instead of a message.
// Same privacy guarantees: data-only payload, no caller identity, no content.
// SW shows generic "Incoming call" notification; the PWA fetches the queued
// CALL_OFFER on next AUTH (within the 30-second pending-call TTL window).
export async function triggerCallPush(speaqId: string): Promise<void> {
  if (!configured) return;
  if (!allowTrigger(speaqId)) return;

  const subs = await listSubscriptionsFor(speaqId);
  if (subs.length === 0) return;

  const payload = JSON.stringify({ t: "call", ts: Date.now() });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload,
          { TTL: 30, urgency: "high" }
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        const drop = statusCode === 404 || statusCode === 410;
        await recordFailure(sub.endpoint, drop).catch(() => undefined);
      }
    })
  );
}
