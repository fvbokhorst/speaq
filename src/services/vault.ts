/**
 * SPEAQ Private Storage Service
 * PIN-protected layers: two PINs, two data layers
 *
 * PIN A (normal) = visible layer with innocent data
 * PIN B (hidden) = real encrypted data
 *
 * No technical evidence that the hidden layer exists.
 * All vault files are AES-256 encrypted locally.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import RNFS from "react-native-fs";
import CryptoJS from "crypto-js";

export interface VaultFile {
  id: string;
  name: string;
  type: "photo" | "document" | "note" | "video";
  uri: string;
  size: number;
  addedAt: number;
}

const VAULT_DIR = `${RNFS.DocumentDirectoryPath}/vault`;
const HIDDEN_VAULT_DIR = `${RNFS.DocumentDirectoryPath}/.sys_cache`; // Disguised name
const VAULT_FILES_KEY = "speaq_vault_files";
const HIDDEN_FILES_KEY = "speaq_sys_cache_idx"; // Disguised key
const HIDDEN_PIN_KEY = "speaq_sys_pref"; // Disguised as system preference
const DECOY_KEY = "speaq_vault_decoy";

let currentLayer: "normal" | "hidden" = "normal";
let hiddenPinHash: string | null = null;

// Encryption keys derived from PINs
let normalEncKey: string | null = null;
let hiddenEncKey: string | null = null;

// --- Crypto helpers ---

/** SHA-256 hash for PIN comparison (replaces simple JS hash) */
function hashPin(pin: string): string {
  return CryptoJS.SHA256(pin).toString(CryptoJS.enc.Hex);
}

/** Derive an AES-256 encryption key from a PIN */
function deriveKey(pin: string): string {
  return CryptoJS.SHA256("speaq-vault-key:" + pin).toString(CryptoJS.enc.Hex);
}

/** Get the current layer's encryption key */
function getEncKey(): string | null {
  return currentLayer === "hidden" ? hiddenEncKey : normalEncKey;
}

/** AES-256 encrypt a string */
function vaultEncrypt(data: string, key: string): string {
  return CryptoJS.AES.encrypt(data, key).toString();
}

/** AES-256 decrypt a string */
function vaultDecrypt(encrypted: string, key: string): string {
  const bytes = CryptoJS.AES.decrypt(encrypted, key);
  return bytes.toString(CryptoJS.enc.Utf8);
}

// --- Init & Layer Management ---

export async function initVault(): Promise<void> {
  try {
    await RNFS.mkdir(VAULT_DIR);
    await RNFS.mkdir(HIDDEN_VAULT_DIR);
    const stored = await AsyncStorage.getItem(HIDDEN_PIN_KEY);
    if (stored) hiddenPinHash = stored;
  } catch (e) {}
}

/**
 * Set the normal layer encryption key from the user's PIN.
 * Must be called after PIN verification in App.tsx.
 */
export function setNormalPin(pin: string): void {
  normalEncKey = deriveKey(pin);
}

export function hasHiddenLayer(): boolean {
  return hiddenPinHash !== null;
}

export async function setupHiddenPin(pin: string): Promise<void> {
  hiddenPinHash = hashPin(pin);
  hiddenEncKey = deriveKey(pin);
  await AsyncStorage.setItem(HIDDEN_PIN_KEY, hiddenPinHash);
}

/** Legacy hash for backwards compatibility with old PINs */
function legacyHashPin(pin: string): string {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    const chr = pin.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return "h" + Math.abs(hash).toString(36);
}

export function unlockHidden(pin: string): boolean {
  if (!hiddenPinHash) return false;
  // Try new SHA-256 hash first, then legacy hash for backwards compatibility
  if (hashPin(pin) === hiddenPinHash || legacyHashPin(pin) === hiddenPinHash) {
    hiddenEncKey = deriveKey(pin);
    currentLayer = "hidden";
    // Migrate to new hash format
    hiddenPinHash = hashPin(pin);
    AsyncStorage.setItem(HIDDEN_PIN_KEY, hiddenPinHash);
    return true;
  }
  return false;
}

export function switchToNormal(): void {
  currentLayer = "normal";
}

export function getCurrentLayer(): "normal" | "hidden" {
  return currentLayer;
}

// --- File Management ---

function getStorageKey(): string {
  return currentLayer === "hidden" ? HIDDEN_FILES_KEY : VAULT_FILES_KEY;
}

function getVaultDir(): string {
  return currentLayer === "hidden" ? HIDDEN_VAULT_DIR : VAULT_DIR;
}

export async function getVaultFiles(): Promise<VaultFile[]> {
  try {
    const data = await AsyncStorage.getItem(getStorageKey());
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Add a file to the vault. The file is AES-256 encrypted before writing to disk.
 * - Notes: text is encrypted directly
 * - Photos/documents/video: file is read as base64, encrypted, then written
 */
export async function addToVault(name: string, sourceUri: string, type: VaultFile["type"], textContent?: string): Promise<VaultFile> {
  const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const dir = getVaultDir();
  const key = getEncKey();

  // Ensure directory exists
  const dirExists = await RNFS.exists(dir);
  if (!dirExists) await RNFS.mkdir(dir);

  let destPath: string;
  let size = 0;

  if (type === "note" && textContent) {
    // Encrypt note text and write
    destPath = `${dir}/${id}.enc`;
    const encrypted = key ? vaultEncrypt(textContent, key) : textContent;
    await RNFS.writeFile(destPath, encrypted, "utf8");
    size = textContent.length;
  } else if (sourceUri) {
    // Read file as base64, encrypt, write encrypted version
    destPath = `${dir}/${id}.enc`;
    let base64Data: string;
    try {
      base64Data = await RNFS.readFile(sourceUri, "base64");
    } catch {
      base64Data = await RNFS.readFile(sourceUri.replace("file://", ""), "base64");
    }
    size = base64Data.length; // approximate original size
    const encrypted = key ? vaultEncrypt(base64Data, key) : base64Data;
    await RNFS.writeFile(destPath, encrypted, "utf8");
  } else {
    return { id, name, type, uri: "", size: 0, addedAt: Date.now() };
  }

  const file: VaultFile = {
    id,
    name,
    type,
    uri: `file://${destPath}`,
    size,
    addedAt: Date.now(),
  };

  const files = await getVaultFiles();
  files.push(file);
  await AsyncStorage.setItem(getStorageKey(), JSON.stringify(files));
  return file;
}

/**
 * Read a vault file, decrypting it first.
 * Returns the decrypted content:
 * - For notes: returns the plain text string
 * - For photos/documents: returns the base64 data (can be used as data URI)
 */
export async function readVaultFile(file: VaultFile): Promise<string> {
  const key = getEncKey();
  const filePath = file.uri.replace("file://", "");
  const raw = await RNFS.readFile(filePath, "utf8");

  if (!key) return raw;

  try {
    const decrypted = vaultDecrypt(raw, key);
    if (!decrypted) return raw; // fallback for unencrypted legacy files
    return decrypted;
  } catch {
    // Fallback: file might be from before encryption was added
    return raw;
  }
}

export async function removeFromVault(fileId: string): Promise<void> {
  const files = await getVaultFiles();
  const file = files.find((f) => f.id === fileId);
  if (file) {
    try {
      await RNFS.unlink(file.uri.replace("file://", ""));
    } catch (e) {}
  }
  const updated = files.filter((f) => f.id !== fileId);
  await AsyncStorage.setItem(getStorageKey(), JSON.stringify(updated));
}

// --- Decoy Content ---
// Pre-populate the normal vault with innocent files
// so it doesn't look empty/suspicious

// --- Backup & Restore ---

/**
 * Export an encrypted backup of all vault files (current layer).
 * The backup is AES-256 encrypted with the current layer's PIN-derived key.
 * Returns a base64-encoded encrypted JSON string.
 */
export async function exportVaultBackup(): Promise<string> {
  const key = getEncKey();
  if (!key) throw new Error("Vault not unlocked -- no encryption key available");

  const files = await getVaultFiles();
  const dir = getVaultDir();
  const backupData: { files: VaultFile[]; contents: Record<string, string> } = {
    files,
    contents: {},
  };

  // Read all encrypted file contents
  for (const file of files) {
    try {
      const filePath = file.uri.replace("file://", "");
      const exists = await RNFS.exists(filePath);
      if (exists) {
        const raw = await RNFS.readFile(filePath, "utf8");
        backupData.contents[file.id] = raw; // Already encrypted on disk
      }
    } catch (e) {
      // Skip files that can't be read
    }
  }

  // Double-encrypt the entire backup JSON with the vault key
  const jsonStr = JSON.stringify(backupData);
  const encrypted = vaultEncrypt(jsonStr, key);
  // Base64 encode for safe transport
  return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(encrypted));
}

/**
 * Import and restore a vault backup.
 * Decrypts the backup using the current layer's PIN-derived key.
 * Overwrites current layer files.
 */
export async function importVaultBackup(encryptedBase64: string): Promise<number> {
  const key = getEncKey();
  if (!key) throw new Error("Vault not unlocked -- no encryption key available");

  // Decode base64
  const encrypted = CryptoJS.enc.Base64.parse(encryptedBase64).toString(CryptoJS.enc.Utf8);

  // Decrypt the backup
  const jsonStr = vaultDecrypt(encrypted, key);
  if (!jsonStr) throw new Error("Failed to decrypt backup -- wrong PIN or corrupted data");

  const backupData = JSON.parse(jsonStr);
  if (!backupData.files || !backupData.contents) {
    throw new Error("Invalid backup format");
  }

  const dir = getVaultDir();
  const dirExists = await RNFS.exists(dir);
  if (!dirExists) await RNFS.mkdir(dir);

  // Restore file contents
  let restoredCount = 0;
  for (const file of backupData.files as VaultFile[]) {
    const content = backupData.contents[file.id];
    if (content) {
      const destPath = `${dir}/${file.id}.enc`;
      await RNFS.writeFile(destPath, content, "utf8");
      file.uri = `file://${destPath}`;
      restoredCount++;
    }
  }

  // Save file index
  await AsyncStorage.setItem(getStorageKey(), JSON.stringify(backupData.files));
  return restoredCount;
}

export async function addDecoyNote(text: string): Promise<void> {
  const dirExists = await RNFS.exists(VAULT_DIR);
  if (!dirExists) await RNFS.mkdir(VAULT_DIR);

  const files = await AsyncStorage.getItem(VAULT_FILES_KEY);
  const existing: VaultFile[] = files ? JSON.parse(files) : [];

  const id = Date.now().toString(36);
  const path = `${VAULT_DIR}/${id}.enc`;
  const encrypted = normalEncKey ? vaultEncrypt(text, normalEncKey) : text;
  await RNFS.writeFile(path, encrypted, "utf8");

  existing.push({
    id,
    name: "note.txt",
    type: "note",
    uri: `file://${path}`,
    size: text.length,
    addedAt: Date.now(),
  });

  await AsyncStorage.setItem(VAULT_FILES_KEY, JSON.stringify(existing));
}
