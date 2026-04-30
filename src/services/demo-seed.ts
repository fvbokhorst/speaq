/**
 * SPEAQ Demo Seed Service
 *
 * Apple App Review (Guideline 2.1 - App Completeness) cannot test our
 * peer-to-peer end-to-end encrypted messenger on a single device with no
 * peer present. To make the messaging surface reviewable, we seed a one-time
 * "SPEAQ Welcome" demo conversation on first launch. The seeded contact
 * exposes the full chat UI: regular messages, a keyword-flagged bubble that
 * exercises the Reveal-anyway gate (Guideline 1.2 filter), and instructions
 * for testing Report and Block.
 *
 * Runs exactly once per install (gated by `speaq_demo_seeded` flag) so it
 * does not interfere with real users.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { contactsService } from "./contacts";
import { StoredMessage } from "./messages";

const SEED_FLAG = "speaq_demo_seeded";
const DEMO_CONTACT_ID = "speaq_welcome_demo";
const DEMO_CONTACT_NAME = "SPEAQ Welcome";

function ts(minutesAgo: number): string {
  const d = new Date(Date.now() - minutesAgo * 60_000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export async function seedDemoConversationIfNeeded(): Promise<void> {
  try {
    const already = await AsyncStorage.getItem(SEED_FLAG);
    if (already === "1") return;

    await contactsService.load();
    contactsService.addContact(DEMO_CONTACT_ID, DEMO_CONTACT_NAME);

    const now = Date.now();
    const messages: StoredMessage[] = [
      { id: String(now - 600_000), text: "Welcome to SPEAQ.", sent: false, type: "text", timestamp: ts(10), status: "delivered" },
      { id: String(now - 540_000), text: "This conversation is seeded once on first launch so you can explore the messaging surface without a paired peer.", sent: false, type: "text", timestamp: ts(9), status: "delivered" },
      { id: String(now - 480_000), text: "Tap the 3-dot button on any bubble (or long-press) to see the Report and Block actions required by Apple Guideline 1.2.", sent: false, type: "text", timestamp: ts(8), status: "delivered" },
      { id: String(now - 420_000), text: "The next message contains a keyword that triggers our on-device safety filter. It will render blurred behind a Reveal-anyway tap.", sent: false, type: "text", timestamp: ts(7), status: "delivered" },
      { id: String(now - 360_000), text: "you suck and i hate this app", sent: false, type: "text", timestamp: ts(6), status: "delivered", flagged: true },
      { id: String(now - 300_000), text: "Real conversations require both parties to mutually add each other's SPEAQ ID. This is a deliberate property of our zero-knowledge architecture.", sent: false, type: "text", timestamp: ts(5), status: "delivered" },
      { id: String(now - 240_000), text: "EULA, on-device keyword filter, Report (7 reasons + comment), Block (local + relay + auto-report), and 24h moderator response are all live in 1.0.4. Thank you for the review.", sent: false, type: "text", timestamp: ts(4), status: "delivered" },
    ];

    await AsyncStorage.setItem(`speaq_chat_${DEMO_CONTACT_ID}`, JSON.stringify(messages));
    await AsyncStorage.setItem(SEED_FLAG, "1");
  } catch (e) {
    console.warn("[demo-seed] failed:", e);
  }
}
