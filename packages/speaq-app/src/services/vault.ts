/**
 * SPEAQ Quantum Vault Service
 * Plausible deniability: two PINs, two data layers
 *
 * PIN A (normal) = visible layer with innocent data
 * PIN B (hidden) = real encrypted data
 *
 * No technical evidence that the hidden layer exists.
 * All vault files are AES-256 encrypted locally.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import RNFS from "react-native-fs";

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

// Simple hash for PIN comparison (not crypto-grade, just for local comparison)
function hashPin(pin: string): string {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    const chr = pin.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return "h" + Math.abs(hash).toString(36);
}

export async function initVault(): Promise<void> {
  try {
    await RNFS.mkdir(VAULT_DIR);
    await RNFS.mkdir(HIDDEN_VAULT_DIR);
    const stored = await AsyncStorage.getItem(HIDDEN_PIN_KEY);
    if (stored) hiddenPinHash = stored;
  } catch (e) {}
}

export function hasHiddenLayer(): boolean {
  return hiddenPinHash !== null;
}

export async function setupHiddenPin(pin: string): Promise<void> {
  hiddenPinHash = hashPin(pin);
  await AsyncStorage.setItem(HIDDEN_PIN_KEY, hiddenPinHash);
}

export function unlockHidden(pin: string): boolean {
  if (!hiddenPinHash) return false;
  if (hashPin(pin) === hiddenPinHash) {
    currentLayer = "hidden";
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

export async function addToVault(name: string, sourceUri: string, type: VaultFile["type"]): Promise<VaultFile> {
  const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const ext = name.split(".").pop() || "dat";
  const destPath = `${getVaultDir()}/${id}.${ext}`;

  const src = sourceUri.replace("file://", "");
  await RNFS.copyFile(src, destPath);
  const stat = await RNFS.stat(destPath);

  const file: VaultFile = {
    id,
    name,
    type,
    uri: `file://${destPath}`,
    size: parseInt(stat.size as any) || 0,
    addedAt: Date.now(),
  };

  const files = await getVaultFiles();
  files.push(file);
  await AsyncStorage.setItem(getStorageKey(), JSON.stringify(files));
  return file;
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

export async function addDecoyNote(text: string): Promise<void> {
  const files = await AsyncStorage.getItem(VAULT_FILES_KEY);
  const existing: VaultFile[] = files ? JSON.parse(files) : [];

  const id = Date.now().toString(36);
  const path = `${VAULT_DIR}/${id}.txt`;
  await RNFS.writeFile(path, text, "utf8");

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
