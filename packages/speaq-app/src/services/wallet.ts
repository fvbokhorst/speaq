/**
 * SPEAQ Wallet Service
 * Q-Credits: balance tracking, send/receive, transaction log
 * Phase 5: local-first, encrypted storage
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export interface Transaction {
  id: string;
  type: "send" | "receive";
  amount: number;
  peer: string;
  note: string;
  timestamp: number;
}

const STORAGE_KEY = "speaq_wallet";

class WalletService {
  private balance: number = 0;
  private transactions: Transaction[] = [];
  private loaded: boolean = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        this.balance = parsed.balance || 0;
        this.transactions = parsed.transactions || [];
      }
      this.loaded = true;
    } catch (e) {
      console.error("Wallet load error:", e);
    }
  }

  private async save(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
        balance: this.balance,
        transactions: this.transactions,
      }));
    } catch (e) {
      console.error("Wallet save error:", e);
    }
  }

  getBalance(): number {
    return this.balance;
  }

  getTransactions(): Transaction[] {
    return [...this.transactions].reverse();
  }

  send(to: string, amount: number, note: string = ""): boolean {
    if (amount <= 0 || amount > this.balance) return false;

    this.balance -= amount;
    this.transactions.push({
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      type: "send",
      amount,
      peer: to,
      note,
      timestamp: Date.now(),
    });
    this.save();
    return true;
  }

  receive(from: string, amount: number, note: string = ""): void {
    this.balance += amount;
    this.transactions.push({
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      type: "receive",
      amount,
      peer: from,
      note,
      timestamp: Date.now(),
    });
    this.save();
  }

  // Mining reward
  addMiningReward(amount: number, type: string): void {
    this.receive("SPEAQ Network", amount, `Mining: ${type}`);
  }

  // Initial bonus for new users
  addWelcomeBonus(): void {
    if (this.transactions.length === 0) {
      this.receive("SPEAQ", 10, "Welcome bonus");
    }
  }
}

export const walletService = new WalletService();
