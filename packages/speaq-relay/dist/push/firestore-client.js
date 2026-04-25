"use strict";
/**
 * Firestore client singleton for the push module.
 *
 * Uses Application Default Credentials. On Cloud Run this uses the
 * service account automatically. Locally requires
 * GOOGLE_APPLICATION_CREDENTIALS pointing to a service account key.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PUSH_COLLECTION = void 0;
exports.getFirestore = getFirestore;
const firestore_1 = require("@google-cloud/firestore");
let instance = null;
function getFirestore() {
    if (!instance) {
        const projectId = process.env.FIRESTORE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "plexaris-ai-note-taker";
        instance = new firestore_1.Firestore({ projectId });
    }
    return instance;
}
exports.PUSH_COLLECTION = "push_subscriptions";
//# sourceMappingURL=firestore-client.js.map