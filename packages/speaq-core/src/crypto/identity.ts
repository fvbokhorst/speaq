/**
 * SPEAQ Core - Identity & QR Pairing
 * PRD Section 2.5: Sovereign ID
 * PRD Section 4.4: QR-code pairing
 *
 * SPEAQ ID = SHA-256 hash of Kyber public key (no phone number, no email)
 * QR code contains: SPEAQ ID + Kyber public key (base64)
 */

import crypto from "crypto";
import * as kyber from "./kyber";

export interface SpeaqIdentity {
  speaqId: string;
  displayName: string;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  createdAt: number;
}

export interface QRPayload {
  version: 1;
  speaqId: string;
  kyberPublicKey: string; // base64
  displayName: string;
}

/**
 * Generate a new SPEAQ identity
 * No phone number. No email. No government ID.
 * Just a Kyber keypair and a hash.
 */
export async function createIdentity(displayName: string): Promise<SpeaqIdentity> {
  const keys = await kyber.generateKeyPair();
  const speaqId = crypto
    .createHash("sha256")
    .update(Buffer.from(keys.publicKey))
    .digest("hex")
    .substring(0, 16);

  return {
    speaqId,
    displayName,
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
    createdAt: Date.now(),
  };
}

/**
 * Generate QR code payload for sharing your identity
 * Someone scans this to start a quantum-encrypted chat with you
 */
export function generateQRPayload(identity: SpeaqIdentity): QRPayload {
  return {
    version: 1,
    speaqId: identity.speaqId,
    kyberPublicKey: Buffer.from(identity.publicKey).toString("base64"),
    displayName: identity.displayName,
  };
}

/**
 * Convert QR payload to a string for QR code generation
 * Prefixed with speaq:// for deep linking
 */
export function qrPayloadToString(payload: QRPayload): string {
  return "speaq://" + Buffer.from(JSON.stringify(payload)).toString("base64url");
}

/**
 * Parse a scanned QR code string back to a payload
 */
export function parseQRString(qrString: string): QRPayload | null {
  try {
    const prefix = "speaq://";
    if (!qrString.startsWith(prefix)) return null;
    const data = qrString.substring(prefix.length);
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (payload.version !== 1 || !payload.speaqId || !payload.kyberPublicKey) return null;
    return payload as QRPayload;
  } catch {
    return null;
  }
}

/**
 * Extract Kyber public key from QR payload
 */
export function extractPublicKey(payload: QRPayload): Uint8Array {
  return new Uint8Array(Buffer.from(payload.kyberPublicKey, "base64"));
}
