/**
 * SPEAQ CLI Chat Client
 * PRD Section 4: Proof that the protocol works end-to-end
 *
 * Usage:
 *   Terminal 1: npx tsx cli-chat.ts --name Alice --relay ws://localhost:8080
 *   Terminal 2: npx tsx cli-chat.ts --name Bob --relay ws://localhost:8080
 *
 * Then in Alice's terminal: /pair <Bob's SPEAQ ID>
 * Then type messages and press Enter.
 */

import WebSocket from "ws";
import crypto from "crypto";
import readline from "readline";

// Import speaq-core
import * as kyber from "../../speaq-core/dist/crypto/kyber";
import * as hkdf from "../../speaq-core/dist/crypto/hkdf";
import * as ratchet from "../../speaq-core/dist/crypto/ratchet";

// --- Parse args ---
const args = process.argv.slice(2);
const nameIdx = args.indexOf("--name");
const relayIdx = args.indexOf("--relay");
const displayName = nameIdx >= 0 ? args[nameIdx + 1] : "User";
const relayUrl = relayIdx >= 0 ? args[relayIdx + 1] : "ws://localhost:8080";

// --- Identity ---
const speaqId = crypto.createHash("sha256").update(displayName + Date.now()).digest("hex").substring(0, 16);

// --- State ---
let myKeys: { publicKey: Uint8Array; privateKey: Uint8Array } | null = null;
const contacts: Map<string, {
  name: string;
  publicKey: Uint8Array;
  ratchetState: ratchet.RatchetState;
}> = new Map();
let currentContact: string | null = null;

// --- UI ---
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "",
});

function log(msg: string) {
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
  console.log(msg);
  updatePrompt();
}

function updatePrompt() {
  const target = currentContact ? ` -> ${currentContact}` : "";
  rl.setPrompt(`\x1b[33m[${displayName}${target}]\x1b[0m > `);
  rl.prompt(true);
}

// --- WebSocket ---
const ws = new WebSocket(relayUrl);

ws.on("open", async () => {
  // Generate Kyber keypair
  myKeys = await kyber.generateKeyPair();

  // Auth with relay
  ws.send(JSON.stringify({ type: "AUTH", speaqId }));
});

ws.on("message", async (raw: Buffer) => {
  const msg = JSON.parse(raw.toString());

  switch (msg.type) {
    case "AUTH_OK":
      console.log("");
      console.log("  \x1b[36m=== SPEAQ CLI Chat ===\x1b[0m");
      console.log("  \x1b[33mSPEAQ Freely.\x1b[0m");
      console.log("");
      console.log(`  Name:     ${displayName}`);
      console.log(`  SPEAQ ID: \x1b[32m${speaqId}\x1b[0m`);
      console.log(`  Relay:    ${relayUrl}`);
      console.log(`  Crypto:   Kyber-768 + AES-256-GCM + Double Ratchet`);
      if (msg.offlineDelivered > 0) {
        console.log(`  Offline:  ${msg.offlineDelivered} messages delivered`);
      }
      console.log("");
      console.log("  Commands:");
      console.log("  /pair <speaqId> <name>  - Start encrypted chat");
      console.log("  /contacts               - List contacts");
      console.log("  /chat <name>            - Switch to contact");
      console.log("  /id                     - Show your SPEAQ ID");
      console.log("  /quit                   - Exit");
      console.log("");
      updatePrompt();
      break;

    case "RECEIVE": {
      try {
        const blob = JSON.parse(Buffer.from(msg.blob, "base64").toString());

        // Find or create contact
        let contact = contacts.get(msg.from);

        if (blob.type === "KEY_EXCHANGE") {
          // Incoming key exchange request
          const theirPublicKey = new Uint8Array(Buffer.from(blob.kyberPublicKey, "base64"));
          const theirName = blob.name || msg.from;

          // Decapsulate to get shared secret
          const { ciphertext, sharedSecret } = await kyber.encapsulate(theirPublicKey);

          // Send back our ciphertext
          const responseBlob = Buffer.from(JSON.stringify({
            type: "KEY_EXCHANGE_RESPONSE",
            kyberCiphertext: Buffer.from(ciphertext).toString("base64"),
            kyberPublicKey: Buffer.from(myKeys!.publicKey).toString("base64"),
            name: displayName,
          })).toString("base64");

          ws.send(JSON.stringify({ type: "SEND", to: msg.from, blob: responseBlob }));

          // Init ratchet as responder
          const salt = Buffer.from("speaq-session-" + [speaqId, msg.from].sort().join("-"));
          const root = hkdf.deriveKey(Buffer.from(sharedSecret), salt, "speaq-root");
          const state = ratchet.initState(root.key, false);

          contacts.set(msg.from, {
            name: theirName,
            publicKey: theirPublicKey,
            ratchetState: state,
          });

          log(`\x1b[36m[System] Key exchange with ${theirName} (${msg.from}) - QUANTUM SECURED\x1b[0m`);
          currentContact = msg.from;
          break;
        }

        if (blob.type === "KEY_EXCHANGE_RESPONSE") {
          // Response to our key exchange
          const theirCiphertext = new Uint8Array(Buffer.from(blob.kyberCiphertext, "base64"));
          const theirName = blob.name || msg.from;

          // Decapsulate their ciphertext with our private key
          const sharedSecret = await kyber.decapsulate(theirCiphertext, myKeys!.privateKey);

          // Init ratchet as initiator
          const salt = Buffer.from("speaq-session-" + [speaqId, msg.from].sort().join("-"));
          const root = hkdf.deriveKey(Buffer.from(sharedSecret), salt, "speaq-root");
          const state = ratchet.initState(root.key, true);

          contacts.set(msg.from, {
            name: theirName,
            publicKey: new Uint8Array(Buffer.from(blob.kyberPublicKey, "base64")),
            ratchetState: state,
          });

          log(`\x1b[36m[System] Paired with ${theirName} - QUANTUM SECURED\x1b[0m`);
          currentContact = msg.from;
          break;
        }

        // Regular encrypted message
        if (contact) {
          const decrypted = ratchet.ratchetDecrypt(contact.ratchetState, {
            header: blob.header,
            ciphertext: Buffer.from(blob.ciphertext, "base64"),
            iv: Buffer.from(blob.iv, "base64"),
            authTag: Buffer.from(blob.authTag, "base64"),
          });

          log(`\x1b[32m[${contact.name}]\x1b[0m ${decrypted.toString()}`);
        } else {
          log(`\x1b[31m[Unknown ${msg.from}] Encrypted message (not paired)\x1b[0m`);
        }
      } catch (e: any) {
        log(`\x1b[31m[Error] ${e.message}\x1b[0m`);
      }
      break;
    }

    case "ACK":
      // Silent - message delivered/queued
      break;

    case "TYPING": {
      const contact = contacts.get(msg.from);
      if (contact) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(`\x1b[90m${contact.name} is typing...\x1b[0m`);
        setTimeout(updatePrompt, 2000);
      }
      break;
    }

    case "ERROR":
      log(`\x1b[31m[Relay Error] ${msg.error}\x1b[0m`);
      break;
  }
});

ws.on("close", () => {
  console.log("\n\x1b[31mDisconnected from relay.\x1b[0m");
  process.exit(0);
});

ws.on("error", (err) => {
  console.error("\x1b[31mRelay connection error:\x1b[0m", err.message);
  process.exit(1);
});

// --- Input handling ---
rl.on("line", async (input: string) => {
  const line = input.trim();
  if (!line) {
    updatePrompt();
    return;
  }

  // Commands
  if (line.startsWith("/")) {
    const [cmd, ...args] = line.split(" ");

    switch (cmd) {
      case "/pair": {
        const targetId = args[0];
        const targetName = args[1] || targetId;
        if (!targetId) {
          log("Usage: /pair <speaqId> <name>");
          break;
        }

        // Send key exchange
        const blob = Buffer.from(JSON.stringify({
          type: "KEY_EXCHANGE",
          kyberPublicKey: Buffer.from(myKeys!.publicKey).toString("base64"),
          name: displayName,
        })).toString("base64");

        ws.send(JSON.stringify({ type: "SEND", to: targetId, blob }));
        log(`\x1b[36m[System] Key exchange sent to ${targetName} (${targetId})\x1b[0m`);
        currentContact = targetId;
        break;
      }

      case "/contacts":
        if (contacts.size === 0) {
          log("No contacts. Use /pair <speaqId> <name> to start.");
        } else {
          log("\x1b[36mContacts:\x1b[0m");
          for (const [id, c] of contacts) {
            log(`  ${c.name} (${id})`);
          }
        }
        break;

      case "/chat": {
        const name = args[0];
        if (!name) {
          log("Usage: /chat <name>");
          break;
        }
        for (const [id, c] of contacts) {
          if (c.name.toLowerCase() === name.toLowerCase()) {
            currentContact = id;
            log(`\x1b[36mSwitched to ${c.name}\x1b[0m`);
            break;
          }
        }
        break;
      }

      case "/id":
        log(`Your SPEAQ ID: \x1b[32m${speaqId}\x1b[0m`);
        log("Share this with others to start a quantum-encrypted chat.");
        break;

      case "/quit":
      case "/exit":
        ws.close();
        process.exit(0);

      default:
        log(`Unknown command: ${cmd}`);
    }

    updatePrompt();
    return;
  }

  // Send message
  if (!currentContact) {
    log("No contact selected. Use /pair <speaqId> <name> first.");
    updatePrompt();
    return;
  }

  const contact = contacts.get(currentContact);
  if (!contact) {
    log("Not paired with this contact yet. Waiting for key exchange...");
    updatePrompt();
    return;
  }

  // Encrypt with Double Ratchet
  const encrypted = ratchet.ratchetEncrypt(contact.ratchetState, Buffer.from(line));

  const blob = Buffer.from(JSON.stringify({
    header: encrypted.header,
    ciphertext: encrypted.ciphertext.toString("base64"),
    iv: encrypted.iv.toString("base64"),
    authTag: encrypted.authTag.toString("base64"),
  })).toString("base64");

  ws.send(JSON.stringify({ type: "SEND", to: currentContact, blob }));

  // Show sent message locally
  log(`\x1b[33m[${displayName}]\x1b[0m ${line}`);
});

rl.on("close", () => {
  ws.close();
  process.exit(0);
});
