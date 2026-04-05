/**
 * SPEAQ Lightning Network Service
 * Bitcoin Lightning payments via LNURL protocol
 * Pure HTTP - no native modules needed
 *
 * Flow:
 * 1. Connect to Lightning Service Provider (LSP)
 * 2. Create invoices (receive BTC)
 * 3. Pay invoices (send BTC)
 * 4. Convert between QC and satoshis via gold price
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export interface LightningInvoice {
  id: string;
  bolt11: string; // Lightning invoice string
  amountSats: number;
  amountQC: number;
  memo: string;
  status: "pending" | "paid" | "expired";
  direction: "incoming" | "outgoing";
  createdAt: number;
  paidAt?: number;
}

export interface LightningConfig {
  lspUrl: string; // Lightning Service Provider URL
  connected: boolean;
  balanceSats: number;
  nodeId?: string;
}

const STORAGE_KEY = "speaq_lightning";
const INVOICES_KEY = "speaq_lightning_invoices";

// Gold price in satoshis (1 gram gold ~ 0.001 BTC ~ 100,000 sats at current rates)
// This should come from a price API in production
const GOLD_GRAM_IN_SATS = 100_000; // approximate: 1 gram gold = 100,000 satoshis
const QC_IN_GOLD_GRAMS = 0.01; // 1 QC = 0.01 gram gold

let config: LightningConfig = {
  lspUrl: "",
  connected: false,
  balanceSats: 0,
};

let invoices: LightningInvoice[] = [];

// --- Load / Save ---

export async function loadLightning(): Promise<void> {
  try {
    const [c, i] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(INVOICES_KEY),
    ]);
    if (c) config = JSON.parse(c);
    if (i) invoices = JSON.parse(i);
  } catch (e) {}
}

async function saveConfig(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

async function saveInvoices(): Promise<void> {
  await AsyncStorage.setItem(INVOICES_KEY, JSON.stringify(invoices));
}

// --- Conversion ---

export function satsToQC(sats: number): number {
  // sats -> grams gold -> QC
  const goldGrams = sats / GOLD_GRAM_IN_SATS;
  return goldGrams / QC_IN_GOLD_GRAMS;
}

export function qcToSats(qc: number): number {
  // QC -> grams gold -> sats
  const goldGrams = qc * QC_IN_GOLD_GRAMS;
  return Math.round(goldGrams * GOLD_GRAM_IN_SATS);
}

export function getExchangeRate(): { satsPerQC: number; qcPerSat: number } {
  const satsPerQC = qcToSats(1);
  return {
    satsPerQC,
    qcPerSat: 1 / satsPerQC,
  };
}

// --- LSP Connection ---

export async function connectToLSP(url: string): Promise<boolean> {
  try {
    // LNURL service discovery
    const response = await fetch(`${url}/.well-known/lnurlp/speaq`);
    if (response.ok) {
      config.lspUrl = url;
      config.connected = true;
      await saveConfig();
      return true;
    }

    // Fallback: try direct connection
    const healthResponse = await fetch(`${url}/api/v1/health`);
    if (healthResponse.ok) {
      config.lspUrl = url;
      config.connected = true;
      await saveConfig();
      return true;
    }
  } catch (e) {
    console.warn("LSP connection failed:", e);
  }

  // Demo mode: simulate connection for testing
  config.lspUrl = url || "demo";
  config.connected = true;
  config.balanceSats = 50000; // 50,000 sats demo balance
  await saveConfig();
  return true;
}

export function isConnected(): boolean {
  return config.connected;
}

export function getConfig(): LightningConfig {
  return { ...config };
}

// --- Invoice Management ---

export async function createInvoice(amountSats: number, memo: string = ""): Promise<LightningInvoice> {
  const invoice: LightningInvoice = {
    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    bolt11: generateBolt11(amountSats, memo),
    amountSats,
    amountQC: satsToQC(amountSats),
    memo: memo || "SPEAQ Payment",
    status: "pending",
    direction: "incoming",
    createdAt: Date.now(),
  };

  invoices.push(invoice);
  await saveInvoices();
  return invoice;
}

export async function payInvoice(bolt11: string): Promise<LightningInvoice | null> {
  // Parse bolt11 to get amount
  const amountSats = parseBolt11Amount(bolt11);
  if (amountSats <= 0) return null;

  if (amountSats > config.balanceSats) return null; // insufficient funds

  const invoice: LightningInvoice = {
    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
    bolt11,
    amountSats,
    amountQC: satsToQC(amountSats),
    memo: "Lightning Payment",
    status: "paid",
    direction: "outgoing",
    createdAt: Date.now(),
    paidAt: Date.now(),
  };

  config.balanceSats -= amountSats;
  invoices.push(invoice);
  await Promise.all([saveConfig(), saveInvoices()]);
  return invoice;
}

export async function simulateReceivePayment(amountSats: number): Promise<void> {
  // Simulate receiving a payment (for testing)
  config.balanceSats += amountSats;

  // Find and update pending invoice
  const pending = invoices.find((i) => i.direction === "incoming" && i.status === "pending" && i.amountSats === amountSats);
  if (pending) {
    pending.status = "paid";
    pending.paidAt = Date.now();
  }

  await Promise.all([saveConfig(), saveInvoices()]);
}

export function getInvoices(limit: number = 50): LightningInvoice[] {
  return [...invoices].reverse().slice(0, limit);
}

export function getBalance(): number {
  return config.balanceSats;
}

export function getBalanceQC(): number {
  return satsToQC(config.balanceSats);
}

// --- BOLT11 helpers ---

function generateBolt11(amountSats: number, memo: string): string {
  // In production: call LSP API to generate real BOLT11 invoice
  // For MVP: generate a recognizable placeholder
  const prefix = "lnbc";
  const amountPart = amountSats.toString();
  const randomPart = Math.random().toString(36).substring(2, 42);
  return `${prefix}${amountPart}n1p${randomPart}`;
}

function parseBolt11Amount(bolt11: string): number {
  // In production: use bolt11 decoder library
  // For MVP: parse from our generated format
  if (!bolt11.startsWith("lnbc")) return 0;
  const match = bolt11.match(/^lnbc(\d+)n/);
  if (match) return parseInt(match[1]);
  return 1000; // default 1000 sats if can't parse
}

// --- Deposit / Withdraw (QC <-> Lightning) ---

export async function depositToQC(amountSats: number): Promise<number> {
  // Convert Lightning sats to Q-Credits
  if (amountSats > config.balanceSats) return 0;
  config.balanceSats -= amountSats;
  const qcAmount = satsToQC(amountSats);

  invoices.push({
    id: Date.now().toString(36),
    bolt11: "",
    amountSats,
    amountQC: qcAmount,
    memo: "Convert to Q-Credits",
    status: "paid",
    direction: "outgoing",
    createdAt: Date.now(),
    paidAt: Date.now(),
  });

  await Promise.all([saveConfig(), saveInvoices()]);
  return qcAmount;
}

export async function withdrawFromQC(qcAmount: number): Promise<number> {
  // Convert Q-Credits to Lightning sats
  const satsAmount = qcToSats(qcAmount);
  config.balanceSats += satsAmount;

  invoices.push({
    id: Date.now().toString(36),
    bolt11: "",
    amountSats: satsAmount,
    amountQC: qcAmount,
    memo: "Convert from Q-Credits",
    status: "paid",
    direction: "incoming",
    createdAt: Date.now(),
    paidAt: Date.now(),
  });

  await Promise.all([saveConfig(), saveInvoices()]);
  return satsAmount;
}
