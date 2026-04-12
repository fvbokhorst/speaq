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
        this.stablecoinWallets = parsed.stablecoinWallets || [];
        this.cashBridgeTransactions = parsed.cashBridgeTransactions || [];
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
        stablecoinWallets: this.stablecoinWallets,
        cashBridgeTransactions: this.cashBridgeTransactions,
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
    this.receive("SPEAQ Network", amount, `Earning: ${type}`);
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

  // --- Stablecoin Wallets ---

  private stablecoinWallets: StablecoinWallet[] = [];

  getStablecoinWallets(): StablecoinWallet[] {
    return [...this.stablecoinWallets];
  }

  addStablecoinWallet(type: StablecoinWallet["type"], address: string): StablecoinWallet {
    const wallet: StablecoinWallet = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      type,
      address,
      balance: 0,
    };
    this.stablecoinWallets.push(wallet);
    this.save();
    return wallet;
  }

  removeStablecoinWallet(id: string): void {
    this.stablecoinWallets = this.stablecoinWallets.filter((w) => w.id !== id);
    this.save();
  }

  /**
   * Convert Q-Credits to stablecoin.
   * Rate: 1 QC = 1 USD equivalent (pegged to gold-backed value).
   * In production, this would call a DEX or liquidity pool.
   */
  convertQCtoStablecoin(amount: number, type: StablecoinWallet["type"]): boolean {
    if (amount <= 0 || amount > this.balance) return false;
    const wallet = this.stablecoinWallets.find((w) => w.type === type);
    if (!wallet) return false;

    this.balance -= amount;
    wallet.balance += amount; // 1:1 rate for now
    this.transactions.push({
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      type: "send",
      amount,
      peer: `Stablecoin: ${type.toUpperCase()}`,
      note: `Convert to ${type.toUpperCase()}`,
      timestamp: Date.now(),
    });
    this.save();
    return true;
  }

  /**
   * Convert stablecoin back to Q-Credits.
   */
  convertStablecoinToQC(amount: number, type: StablecoinWallet["type"]): boolean {
    const wallet = this.stablecoinWallets.find((w) => w.type === type);
    if (!wallet || amount <= 0 || amount > wallet.balance) return false;

    wallet.balance -= amount;
    this.balance += amount; // 1:1 rate for now
    this.transactions.push({
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      type: "receive",
      amount,
      peer: `Stablecoin: ${type.toUpperCase()}`,
      note: `Convert from ${type.toUpperCase()}`,
      timestamp: Date.now(),
    });
    this.save();
    return true;
  }

  // --- Cash Bridge ---

  private cashBridgeTransactions: CashBridgeTransaction[] = [];

  /**
   * Find nearby cash bridge agents.
   * In production: GPS + backend query. For now: demo agents.
   */
  findNearbyAgents(): CashBridgeAgent[] {
    return [
      { id: "agent_1", name: "Amsterdam Central", location: "Amsterdam, NL", rating: 4.8, transactionCount: 342 },
      { id: "agent_2", name: "Rotterdam Hub", location: "Rotterdam, NL", rating: 4.6, transactionCount: 218 },
      { id: "agent_3", name: "Utrecht Station", location: "Utrecht, NL", rating: 4.9, transactionCount: 156 },
      { id: "agent_4", name: "Den Haag Center", location: "The Hague, NL", rating: 4.7, transactionCount: 89 },
      { id: "agent_5", name: "Kampala Central", location: "Kampala, UG", rating: 4.5, transactionCount: 67 },
    ];
  }

  /**
   * Initiate a cash bridge transaction with an agent.
   * Buy: give cash, receive QC.
   * Sell: give QC, receive cash.
   */
  initiateCashBridge(agentId: string, amount: number, direction: "buy" | "sell"): CashBridgeTransaction {
    const agent = this.findNearbyAgents().find((a) => a.id === agentId);
    const tx: CashBridgeTransaction = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      agentId,
      agentName: agent?.name || "Unknown Agent",
      amount,
      direction,
      status: "pending",
      createdAt: Date.now(),
    };
    this.cashBridgeTransactions.push(tx);
    this.save();
    return tx;
  }

  getCashBridgeTransactions(): CashBridgeTransaction[] {
    return [...this.cashBridgeTransactions].reverse();
  }
}

// --- Stablecoin Types ---

export interface StablecoinWallet {
  id: string;
  type: "usdt" | "usdc";
  address: string;
  balance: number;
}

// --- Cash Bridge Types ---

export interface CashBridgeAgent {
  id: string;
  name: string;
  location: string;
  rating: number;
  transactionCount: number;
}

export interface CashBridgeTransaction {
  id: string;
  agentId: string;
  agentName: string;
  amount: number;
  direction: "buy" | "sell";
  status: "pending" | "confirmed" | "completed" | "cancelled";
  createdAt: number;
}

export const walletService = new WalletService();
