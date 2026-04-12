/**
 * SPEAQ Core - Cost Tracker
 * PORT from plexaris-agent-core/cost/tracker.py
 * PRD Section 5: Q-Credits balances, transaction fees, mining rewards
 */

export interface Transaction {
  id: string;
  type: "send" | "receive" | "mining" | "bridge" | "fee" | "subscription";
  amount: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export class CostTracker {
  private balance: number = 0;
  private history: Transaction[] = [];

  track(
    type: Transaction["type"],
    amount: number,
    metadata?: Record<string, unknown>
  ): Transaction {
    const tx: Transaction = {
      id: crypto.randomUUID(),
      type,
      amount,
      timestamp: Date.now(),
      metadata,
    };

    if (type === "send" || type === "fee" || type === "subscription") {
      this.balance -= amount;
    } else {
      this.balance += amount;
    }

    this.history.push(tx);
    return tx;
  }

  getBalance(): number {
    return this.balance;
  }

  getHistory(limit?: number): Transaction[] {
    if (limit) return this.history.slice(-limit);
    return [...this.history];
  }

  setBalance(amount: number): void {
    this.balance = amount;
  }
}
