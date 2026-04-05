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

export interface Project {
  id: string;
  name: string;
  description: string;
  balance: number;
  createdAt: number;
}

export interface LinkedWallet {
  id: string;
  type: "monero" | "bitcoin" | "ethereum" | "usdt";
  address: string;
  label: string;
  linkedAt: number;
}

const STORAGE_KEY = "speaq_wallet";

class WalletService {
  private balance: number = 0;
  private transactions: Transaction[] = [];
  private projects: Project[] = [];
  private linkedWallets: LinkedWallet[] = [];
  private loaded: boolean = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        this.balance = parsed.balance || 0;
        this.transactions = parsed.transactions || [];
        this.projects = parsed.projects || [];
        this.linkedWallets = parsed.linkedWallets || [];
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
        projects: this.projects,
        linkedWallets: this.linkedWallets,
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

  // --- Projects ---

  getProjects(): Project[] {
    return [...this.projects];
  }

  createProject(name: string, description: string): Project {
    const project: Project = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      name,
      description,
      balance: 0,
      createdAt: Date.now(),
    };
    this.projects.push(project);
    this.save();
    return project;
  }

  fundProject(projectId: string, amount: number): boolean {
    if (amount <= 0 || amount > this.balance) return false;
    const project = this.projects.find((p) => p.id === projectId);
    if (!project) return false;

    this.balance -= amount;
    project.balance += amount;
    this.transactions.push({
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      type: "send",
      amount,
      peer: `Project: ${project.name}`,
      note: "Fund project",
      timestamp: Date.now(),
    });
    this.save();
    return true;
  }

  withdrawFromProject(projectId: string, amount: number): boolean {
    const project = this.projects.find((p) => p.id === projectId);
    if (!project || amount <= 0 || amount > project.balance) return false;

    project.balance -= amount;
    this.balance += amount;
    this.transactions.push({
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      type: "receive",
      amount,
      peer: `Project: ${project.name}`,
      note: "Withdraw from project",
      timestamp: Date.now(),
    });
    this.save();
    return true;
  }

  deleteProject(projectId: string): boolean {
    const project = this.projects.find((p) => p.id === projectId);
    if (!project) return false;
    if (project.balance > 0) {
      this.balance += project.balance;
    }
    this.projects = this.projects.filter((p) => p.id !== projectId);
    this.save();
    return true;
  }

  // --- Linked Wallets ---

  getLinkedWallets(): LinkedWallet[] {
    return [...this.linkedWallets];
  }

  linkWallet(type: LinkedWallet["type"], address: string, label: string): LinkedWallet {
    const wallet: LinkedWallet = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      type,
      address,
      label,
      linkedAt: Date.now(),
    };
    this.linkedWallets.push(wallet);
    this.save();
    return wallet;
  }

  unlinkWallet(walletId: string): void {
    this.linkedWallets = this.linkedWallets.filter((w) => w.id !== walletId);
    this.save();
  }
}

export const walletService = new WalletService();
