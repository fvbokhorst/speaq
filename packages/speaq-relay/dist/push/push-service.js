"use strict";
/**
 * Push service: silent push trigger + rate limiting.
 *
 * Silent push = data-only payload with no content. Service Worker on the
 * client decides what notification to show (e.g. "new message"). The relay
 * never sees or transmits the message body.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configurePush = configurePush;
exports.isConfigured = isConfigured;
exports.triggerSilentPush = triggerSilentPush;
const web_push_1 = __importDefault(require("web-push"));
const push_store_1 = require("./push-store");
const TRIGGER_WINDOW_MS = 60 * 1000;
const TRIGGER_MAX_PER_WINDOW = 10;
const triggerCounters = new Map();
let configured = false;
function configurePush(opts) {
    web_push_1.default.setVapidDetails(opts.subject, opts.publicKey, opts.privateKey);
    configured = true;
}
function isConfigured() {
    return configured;
}
function allowTrigger(speaqId) {
    const now = Date.now();
    const entry = triggerCounters.get(speaqId);
    if (!entry || now > entry.resetAt) {
        triggerCounters.set(speaqId, { count: 1, resetAt: now + TRIGGER_WINDOW_MS });
        return true;
    }
    if (entry.count >= TRIGGER_MAX_PER_WINDOW)
        return false;
    entry.count++;
    return true;
}
async function triggerSilentPush(speaqId) {
    if (!configured)
        return;
    if (!allowTrigger(speaqId))
        return;
    const subs = await (0, push_store_1.listSubscriptionsFor)(speaqId);
    if (subs.length === 0)
        return;
    const payload = JSON.stringify({ t: "msg", ts: Date.now() });
    await Promise.all(subs.map(async (sub) => {
        try {
            await web_push_1.default.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: 60, urgency: "high" });
        }
        catch (err) {
            const statusCode = err.statusCode;
            const drop = statusCode === 404 || statusCode === 410;
            await (0, push_store_1.recordFailure)(sub.endpoint, drop).catch(() => undefined);
        }
    }));
}
//# sourceMappingURL=push-service.js.map