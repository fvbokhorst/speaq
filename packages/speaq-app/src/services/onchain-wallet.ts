// SPEAQ On-Chain Wallet -- ML-DSA-65 (FIPS 204) Sovereign Keys
// Cross-compatible with Rust blockchain node (fips204 crate)
// Keys never leave the device. "By the people, for the people."

import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { sha256 } from "@noble/hashes/sha2.js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ONCHAIN_WALLET_KEY = "speaq_onchain_wallet";

export interface OnChainWallet {
  publicKey: string;
  secretKey: string;
  address: string;
  createdAt: number;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function deriveAddress(publicKey: Uint8Array): string {
  const hash = sha256(publicKey);
  return "SQ1" + toHex(hash);
}

export function generateOnChainWallet(): OnChainWallet {
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  const keys = ml_dsa65.keygen(seed);
  const address = deriveAddress(keys.publicKey);

  return {
    publicKey: toHex(keys.publicKey),
    secretKey: toHex(keys.secretKey),
    address,
    createdAt: Date.now(),
  };
}

export async function loadOnChainWallet(): Promise<OnChainWallet | null> {
  try {
    const stored = await AsyncStorage.getItem(ONCHAIN_WALLET_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export async function saveOnChainWallet(wallet: OnChainWallet): Promise<void> {
  await AsyncStorage.setItem(ONCHAIN_WALLET_KEY, JSON.stringify(wallet));
}

export async function getOrCreateOnChainWallet(): Promise<OnChainWallet> {
  const existing = await loadOnChainWallet();
  if (existing) return existing;
  const wallet = generateOnChainWallet();
  await saveOnChainWallet(wallet);
  return wallet;
}

export function signTransaction(message: Uint8Array, secretKeyHex: string): Uint8Array {
  const sk = fromHex(secretKeyHex);
  return ml_dsa65.sign(message, sk);
}

export function verifySignature(message: Uint8Array, signature: Uint8Array, publicKeyHex: string): boolean {
  const pk = fromHex(publicKeyHex);
  return ml_dsa65.verify(signature, message, pk);
}

const CHAIN_API = "http://134.98.141.213:9334";

export async function sendOnChainTransaction(
  wallet: OnChainWallet,
  toAddress: string,
  amount: number
): Promise<{ success: boolean; txId?: string; error?: string }> {
  const txData = JSON.stringify({ from: wallet.address, to: toAddress, amount, timestamp: Date.now() });
  const messageBytes = new TextEncoder().encode(txData);
  const signature = signTransaction(messageBytes, wallet.secretKey);

  try {
    const res = await fetch(`${CHAIN_API}/api/transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: wallet.address,
        to: toAddress,
        amount,
        publicKey: wallet.publicKey,
        signature: toHex(signature),
        message: toHex(messageBytes),
      }),
    });
    const data = await res.json();
    if (res.ok) return { success: true, txId: data.txId };
    return { success: false, error: data.error || "Transaction rejected" };
  } catch {
    return { success: false, error: "Failed to connect to blockchain node" };
  }
}
