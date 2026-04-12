/**
 * SPEAQ Core - Budget Enforcer
 * PORT from plexaris-agent-core/cost/enforcer.py
 * PRD Section 12: Free/Pro/Business tier limits
 */

export type Tier = "free" | "pro" | "business";

interface TierLimits {
  maxFileSize: number;       // bytes
  maxGroups: number;
  maxGroupMembers: number;
  maxVaultStorage: number;   // bytes
  videoCalls: boolean;
  quantumPay: boolean;
  maxPayPerMonth: number;    // Q-Credits
  witnessMode: boolean;
  deadManSwitch: number;     // max switches
}

const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    maxFileSize: 25 * 1024 * 1024,       // 25 MB
    maxGroups: 5,
    maxGroupMembers: 25,
    maxVaultStorage: 1024 * 1024 * 1024,  // 1 GB
    videoCalls: false,
    quantumPay: false,
    maxPayPerMonth: 0,
    witnessMode: false,
    deadManSwitch: 1,
  },
  pro: {
    maxFileSize: 500 * 1024 * 1024,       // 500 MB
    maxGroups: Infinity,
    maxGroupMembers: 250,
    maxVaultStorage: 25 * 1024 * 1024 * 1024, // 25 GB
    videoCalls: true,
    quantumPay: true,
    maxPayPerMonth: 1000,
    witnessMode: true,
    deadManSwitch: Infinity,
  },
  business: {
    maxFileSize: Infinity,
    maxGroups: Infinity,
    maxGroupMembers: Infinity,
    maxVaultStorage: 100 * 1024 * 1024 * 1024, // 100 GB
    videoCalls: true,
    quantumPay: true,
    maxPayPerMonth: Infinity,
    witnessMode: true,
    deadManSwitch: Infinity,
  },
};

export class BudgetEnforcer {
  private tier: Tier;

  constructor(tier: Tier = "free") {
    this.tier = tier;
  }

  setTier(tier: Tier): void {
    this.tier = tier;
  }

  getTier(): Tier {
    return this.tier;
  }

  canSendFile(fileSize: number): boolean {
    return fileSize <= TIER_LIMITS[this.tier].maxFileSize;
  }

  canVideoCall(): boolean {
    return TIER_LIMITS[this.tier].videoCalls;
  }

  canPay(): boolean {
    return TIER_LIMITS[this.tier].quantumPay;
  }

  canUseWitness(): boolean {
    return TIER_LIMITS[this.tier].witnessMode;
  }

  getMaxGroupMembers(): number {
    return TIER_LIMITS[this.tier].maxGroupMembers;
  }

  getMaxVaultStorage(): number {
    return TIER_LIMITS[this.tier].maxVaultStorage;
  }

  getLimits(): TierLimits {
    return { ...TIER_LIMITS[this.tier] };
  }
}
