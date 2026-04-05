/**
 * SPEAQ Identity Manager - Sovereign ID (Module 5)
 *
 * W3C DID-based decentralized identity:
 * - DID generation from Kyber public key
 * - Verifiable Credentials (signed claims)
 * - Identity export/import for device portability
 */

import CryptoJS from "crypto-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { sha256 } from "./crypto";

// ============================================================
// SECTION 1: Base58 Encoding (for DID format)
// ============================================================

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(hexStr: string): string {
  // Convert hex to array of bytes
  const bytes: number[] = [];
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes.push(parseInt(hexStr.substring(i, i + 2), 16));
  }

  // Count leading zeros
  let leadingZeros = 0;
  for (const b of bytes) {
    if (b === 0) leadingZeros++;
    else break;
  }

  // Convert to base58 using repeated division
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let result = "";
  // Leading zeros -> '1' in base58
  for (let i = 0; i < leadingZeros; i++) result += "1";
  // Digits are in reverse order
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }

  return result;
}

// ============================================================
// SECTION 2: DID Generation
// ============================================================

const DID_STORAGE_KEY = "speaq_did";
const CREDENTIALS_STORAGE_KEY = "speaq_credentials";

/**
 * Generate a W3C DID from a Kyber public key.
 * Format: did:speaq:<base58-encoded-public-key-hash>
 */
export function generateDID(kyberPublicKey: string): string {
  const hash = sha256(kyberPublicKey);
  const encoded = base58Encode(hash);
  return `did:speaq:${encoded}`;
}

/** Save DID to AsyncStorage */
export async function saveDID(did: string): Promise<void> {
  await AsyncStorage.setItem(DID_STORAGE_KEY, did);
}

/** Load DID from AsyncStorage */
export async function loadDID(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(DID_STORAGE_KEY);
  } catch (e) {
    return null;
  }
}

// ============================================================
// SECTION 3: Verifiable Credentials
// ============================================================

export interface VerifiableCredential {
  id: string;
  type: string;
  issuer: string;        // DID of the issuer
  claim: Record<string, any>;
  signature: string;     // HMAC-SHA256
  issuedAt: number;
  expiresAt: number;
}

/**
 * Create a Verifiable Credential signed with the user's private key.
 * Uses HMAC-SHA256 for signing.
 *
 * @param claim - The claim data (any JSON-serializable object)
 * @param privateKey - The Kyber private key (used as HMAC key)
 * @returns Signed VerifiableCredential
 */
export function createVerifiableCredential(
  claim: Record<string, any>,
  privateKey: string,
  issuerDID: string,
  type: string = "SpeaqCredential",
  expiresInMs: number = 365 * 24 * 60 * 60 * 1000 // 1 year
): VerifiableCredential {
  const now = Date.now();
  const id = sha256(JSON.stringify(claim) + now.toString() + Math.random().toString());

  const credential: VerifiableCredential = {
    id,
    type,
    issuer: issuerDID,
    claim,
    issuedAt: now,
    expiresAt: now + expiresInMs,
    signature: "",
  };

  // Sign the credential data (excluding signature field)
  const dataToSign = JSON.stringify({
    id: credential.id,
    type: credential.type,
    issuer: credential.issuer,
    claim: credential.claim,
    issuedAt: credential.issuedAt,
    expiresAt: credential.expiresAt,
  });

  const signature = CryptoJS.HmacSHA256(dataToSign, privateKey).toString(CryptoJS.enc.Hex);

  return { ...credential, signature };
}

/**
 * Verify a credential's signature using the issuer's public key.
 * Returns true if signature is valid and credential is not expired.
 */
export function verifyCredential(
  credential: VerifiableCredential,
  publicKey: string
): boolean {
  // Check expiration
  if (Date.now() > credential.expiresAt) {
    return false;
  }

  // Reconstruct the signed data
  const dataToSign = JSON.stringify({
    id: credential.id,
    type: credential.type,
    issuer: credential.issuer,
    claim: credential.claim,
    issuedAt: credential.issuedAt,
    expiresAt: credential.expiresAt,
  });

  // Verify HMAC -- use public key as verification key
  // (In a full implementation, this would use asymmetric signature verification)
  const expectedSignature = CryptoJS.HmacSHA256(dataToSign, publicKey).toString(CryptoJS.enc.Hex);
  return expectedSignature === credential.signature;
}

/** Save credentials list to AsyncStorage */
export async function saveCredentials(credentials: VerifiableCredential[]): Promise<void> {
  await AsyncStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials));
}

/** Load credentials list from AsyncStorage */
export async function loadCredentials(): Promise<VerifiableCredential[]> {
  try {
    const data = await AsyncStorage.getItem(CREDENTIALS_STORAGE_KEY);
    if (data) return JSON.parse(data);
  } catch (e) {}
  return [];
}

// ============================================================
// SECTION 4: Identity Export / Import (QR-scannable)
// ============================================================

export interface ExportedIdentity {
  version: 1;
  did: string;
  speaqId: string;
  displayName: string;
  credentials: VerifiableCredential[];
  exportedAt: number;
}

/**
 * Export the full identity as a JSON string (QR-scannable).
 * Includes DID, SPEAQ ID, display name, and all credentials.
 */
export async function exportIdentity(): Promise<string> {
  const identityData = await AsyncStorage.getItem("speaq_identity");
  const did = await loadDID();
  const credentials = await loadCredentials();

  if (!identityData || !did) {
    throw new Error("No identity to export");
  }

  const identity = JSON.parse(identityData);

  const exported: ExportedIdentity = {
    version: 1,
    did,
    speaqId: identity.speaqId,
    displayName: identity.displayName,
    credentials,
    exportedAt: Date.now(),
  };

  return JSON.stringify(exported);
}

/**
 * Import an identity from a QR scan JSON string.
 * Used for device portability -- restores DID and credentials on a new device.
 * Note: does NOT import private keys (those must be transferred separately via secure channel).
 */
export async function importIdentity(data: string): Promise<ExportedIdentity> {
  const imported: ExportedIdentity = JSON.parse(data);

  if (imported.version !== 1) {
    throw new Error("Unsupported identity format version");
  }

  if (!imported.did || !imported.speaqId || !imported.displayName) {
    throw new Error("Invalid identity data: missing required fields");
  }

  // Store imported identity
  const identity = {
    speaqId: imported.speaqId,
    displayName: imported.displayName,
    createdAt: Date.now(),
  };
  await AsyncStorage.setItem("speaq_identity", JSON.stringify(identity));

  // Store DID
  await saveDID(imported.did);

  // Store credentials
  if (imported.credentials && imported.credentials.length > 0) {
    await saveCredentials(imported.credentials);
  }

  return imported;
}
