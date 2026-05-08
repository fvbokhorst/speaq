/**
 * SPEAQ Wallet Receive Listener
 *
 * App-level subscriber for incoming WS messages that updates the wallet
 * regardless of which screen is currently active. Mirrors PWA's app-level
 * QC-receive handling at speaq-web/src/app/app/page.tsx:1306.
 *
 * Pre-1.0.7 behaviour: only ChatScreen mounted on the exact contact would
 * trigger wallet updates. This caused QC-payments to be silently dropped
 * when the user was on Wallet/Settings/Mining/etc, or in a chat with
 * another contact than the sender.
 *
 * Post-1.0.7 behaviour: this listener fires for every incoming RECEIVE,
 * detects QC-payload, decrypts if necessary, updates wallet + auto-adds
 * contact if new.
 *
 * NOT in this listener (out of scope for F1):
 * - QC_ACK protocol (F6, deferred to wallet-core sprint)
 * - Idempotency-set (F6)
 * - Refund-on-timeout (F6)
 * - Push-notifications (P0-3, separate)
 *
 * Coordination with ChatScreen.tsx: ChatScreen still renders the
 * payment-bubble for chat-UI, but no longer calls walletService.receive
 * directly. This listener is the single source of truth for wallet state
 * mutations on incoming RECEIVE.
 */

import { onMessage, getIdentity } from "./speaq";
import { walletService } from "./wallet";
import { contactsService } from "./contacts";
import { ratchetDecrypt, getOrCreateRatchet } from "./crypto";

let unsubscribe: (() => void) | null = null;

export function initWalletReceiveListener(): void {
  // Idempotent: do not double-subscribe if called twice.
  if (unsubscribe) return;

  unsubscribe = onMessage(async (msg: any) => {
    // Only handle RECEIVE-type messages with a payload.
    if (msg.type !== "RECEIVE") return;
    if (!msg.from && !msg.plaintext) return;

    const myId = getIdentity()?.speaqId;
    if (!myId) return;

    let data: any = null;

    // Path 1: sealed-receive already pre-decrypted via handleSealedReceive
    // (see speaq.ts:389). Use the attached plaintext directly to avoid
    // double-advancing the ratchet counter.
    if (typeof msg.plaintext === "string") {
      try { data = JSON.parse(msg.plaintext); } catch { data = null; }
    }

    // Path 2: regular RECEIVE with blob; decrypt via ratchet.
    if (!data && msg.blob && msg.from) {
      try {
        const parsed = JSON.parse(msg.blob);
        const messageNumber = parsed.messageNumber ?? parsed.mn;
        const ciphertext = parsed.ciphertext ?? parsed.ct;
        if (typeof messageNumber === "number" && typeof ciphertext === "string") {
          const ratchetMsg = { messageNumber, ciphertext };
          const { state } = await getOrCreateRatchet(myId, msg.from);
          const decrypted = await ratchetDecrypt(state, ratchetMsg, msg.from);
          try { data = JSON.parse(decrypted); } catch { data = null; }
        }
      } catch {
        // ChatScreen will handle this message via its own decrypt path; we
        // only act when ratchet-decrypt succeeds at app-level. Failures here
        // are silent on purpose (this listener is best-effort wallet-sync).
        return;
      }
    }

    if (!data) return;

    // Detect QC payload. Mirror PWA semantics at page.tsx:1306 where the
    // detection is `parsed.qc && parsed.amount > 0` regardless of payload
    // type field. This is intentionally less strict than ChatScreen's
    // historic data.type === "message" check to handle legacy clients.
    if (!(data.qc && typeof data.amount === "number" && data.amount > 0)) return;

    const senderId: string = data.senderId || data.from || msg.from || "unknown";
    const senderName: string = data.fromName || senderId.substring(0, 8);

    // Update wallet (single source of truth - ChatScreen no longer does this).
    walletService.receive(senderId, data.amount, `From ${senderName}`);

    // F4: auto-add contact if not already present. Mirrors PWA page.tsx:1346.
    const contacts = contactsService.getContacts();
    const alreadyKnown = contacts.some((c) => c.id === senderId);
    if (!alreadyKnown && senderId !== "unknown") {
      try {
        contactsService.addContact(senderId, senderName);
      } catch {
        // Best-effort; silent failure does not block wallet credit.
      }
    }
  });
}

export function teardownWalletReceiveListener(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
