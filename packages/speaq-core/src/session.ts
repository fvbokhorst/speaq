/**
 * SPEAQ Core - Session Manager
 * Orchestrates the full flow: identity -> pairing -> key exchange -> ratchet -> chat
 *
 * This is the main entry point for using SPEAQ encryption.
 */

import * as identity from "./crypto/identity";
import * as kyber from "./crypto/kyber";
import * as hkdf from "./crypto/hkdf";
import * as ratchet from "./crypto/ratchet";
import * as aes from "./crypto/aes";

export interface Contact {
  speaqId: string;
  displayName: string;
  publicKey: Uint8Array;
  ratchetState: ratchet.RatchetState;
  addedAt: number;
}

export interface EncryptedBlob {
  header: ratchet.RatchetHeader;
  ciphertext: string; // base64
  iv: string;         // base64
  authTag: string;    // base64
}

export class SpeaqSession {
  private identity: identity.SpeaqIdentity | null = null;
  private contacts: Map<string, Contact> = new Map();

  /**
   * Initialize session with a new or existing identity
   */
  async init(displayName: string): Promise<identity.SpeaqIdentity> {
    this.identity = await identity.createIdentity(displayName);
    return this.identity;
  }

  /**
   * Load existing identity (from encrypted storage)
   */
  loadIdentity(id: identity.SpeaqIdentity): void {
    this.identity = id;
  }

  /**
   * Get QR code string for sharing your identity
   */
  getQRString(): string {
    if (!this.identity) throw new Error("No identity initialized");
    const payload = identity.generateQRPayload(this.identity);
    return identity.qrPayloadToString(payload);
  }

  /**
   * Pair with a contact by scanning their QR code
   * Returns the Kyber ciphertext to send to them
   */
  async pairFromQR(qrString: string): Promise<{
    contact: Contact;
    kyberCiphertext: string; // base64, send to contact
  }> {
    if (!this.identity) throw new Error("No identity initialized");

    const payload = identity.parseQRString(qrString);
    if (!payload) throw new Error("Invalid QR code");

    const theirPublicKey = identity.extractPublicKey(payload);

    // Kyber encapsulation
    const { ciphertext, sharedSecret } = await kyber.encapsulate(theirPublicKey);

    // Derive ratchet root key
    const sessionSalt = Buffer.from(
      "speaq-session-" + [this.identity.speaqId, payload.speaqId].sort().join("-")
    );
    const root = hkdf.deriveKey(Buffer.from(sharedSecret), sessionSalt, "speaq-root");

    // Initialize ratchet as initiator
    const ratchetState = ratchet.initState(root.key, true);

    const contact: Contact = {
      speaqId: payload.speaqId,
      displayName: payload.displayName,
      publicKey: theirPublicKey,
      ratchetState,
      addedAt: Date.now(),
    };

    this.contacts.set(payload.speaqId, contact);

    return {
      contact,
      kyberCiphertext: Buffer.from(ciphertext).toString("base64"),
    };
  }

  /**
   * Complete pairing when receiving a Kyber ciphertext from someone who scanned our QR
   */
  async completePairing(
    fromSpeaqId: string,
    displayName: string,
    kyberCiphertext: string,
    theirPublicKey: Uint8Array
  ): Promise<Contact> {
    if (!this.identity) throw new Error("No identity initialized");

    const ciphertext = new Uint8Array(Buffer.from(kyberCiphertext, "base64"));
    const sharedSecret = await kyber.decapsulate(ciphertext, this.identity.privateKey);

    const sessionSalt = Buffer.from(
      "speaq-session-" + [this.identity.speaqId, fromSpeaqId].sort().join("-")
    );
    const root = hkdf.deriveKey(Buffer.from(sharedSecret), sessionSalt, "speaq-root");

    // Initialize ratchet as responder
    const ratchetState = ratchet.initState(root.key, false);

    const contact: Contact = {
      speaqId: fromSpeaqId,
      displayName,
      publicKey: theirPublicKey,
      ratchetState,
      addedAt: Date.now(),
    };

    this.contacts.set(fromSpeaqId, contact);
    return contact;
  }

  /**
   * Encrypt a message for a contact
   */
  encryptMessage(toSpeaqId: string, plaintext: string): EncryptedBlob {
    const contact = this.contacts.get(toSpeaqId);
    if (!contact) throw new Error("Contact not found: " + toSpeaqId);

    const encrypted = ratchet.ratchetEncrypt(
      contact.ratchetState,
      Buffer.from(plaintext)
    );

    return {
      header: encrypted.header,
      ciphertext: encrypted.ciphertext.toString("base64"),
      iv: encrypted.iv.toString("base64"),
      authTag: encrypted.authTag.toString("base64"),
    };
  }

  /**
   * Decrypt a message from a contact
   */
  decryptMessage(fromSpeaqId: string, blob: EncryptedBlob): string {
    const contact = this.contacts.get(fromSpeaqId);
    if (!contact) throw new Error("Contact not found: " + fromSpeaqId);

    const decrypted = ratchet.ratchetDecrypt(contact.ratchetState, {
      header: blob.header,
      ciphertext: Buffer.from(blob.ciphertext, "base64"),
      iv: Buffer.from(blob.iv, "base64"),
      authTag: Buffer.from(blob.authTag, "base64"),
    });

    return decrypted.toString();
  }

  /**
   * Get identity
   */
  getIdentity(): identity.SpeaqIdentity | null {
    return this.identity;
  }

  /**
   * Get all contacts
   */
  getContacts(): Contact[] {
    return Array.from(this.contacts.values());
  }

  /**
   * Get specific contact
   */
  getContact(speaqId: string): Contact | null {
    return this.contacts.get(speaqId) || null;
  }
}
