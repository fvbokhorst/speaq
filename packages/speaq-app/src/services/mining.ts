/**
 * SPEAQ Mining Service
 * Proof of Contribution: earn Q-Credits by helping the network
 *
 * 7 mining types:
 * 1. Relay Mining: relay encrypted messages for others
 * 2. Mesh Mining: act as Bluetooth/WiFi mesh node
 * 3. Bridge Mining: cash-to-Q-Credits agent (commission)
 * 4. Validation Mining: validate zero-knowledge proofs
 * 5. Storage Mining: store encrypted data fragments
 * 6. Translation Mining: translate app to new language
 * 7. Onboarding Mining: bring new active users
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { walletService } from "./wallet";

export type MiningType = "relay" | "mesh" | "bridge" | "validation" | "storage" | "translation" | "onboarding";

export interface MiningStats {
  totalEarned: number;
  todayEarned: number;
  todayDate: string;
  activeTypes: MiningType[];
  relayCount: number;
  meshUptime: number; // minutes
  storageUsedMB: number;
  validationCount: number;
  onboardedUsers: number;
  miningStarted: number; // timestamp
  level: number; // 1-10 miner level
  streak: number; // consecutive mining days
}

export interface MiningReward {
  id: string;
  type: MiningType;
  amount: number;
  timestamp: number;
  description: string;
}

const STATS_KEY = "speaq_mining_stats";
const REWARDS_KEY = "speaq_mining_rewards";
const MINING_ACTIVE_KEY = "speaq_mining_active";

// Reward rates per type (QC per action)
// Calibrated to ~5-8% annual yield (comparable to Bitvavo/Binance staking)
// Target: 0.02-0.05 QC/day per active miner
const REWARD_RATES: Record<MiningType, { perAction: number; dailyCap: number; description: string }> = {
  relay: { perAction: 0.0001, dailyCap: 0.01, description: "Relayed encrypted message" },
  mesh: { perAction: 0.0005, dailyCap: 0.02, description: "Mesh node uptime (per 10 min)" },
  bridge: { perAction: 0.005, dailyCap: 0.5, description: "Cash bridge transaction" },
  validation: { perAction: 0.0002, dailyCap: 0.01, description: "Validated transaction proof" },
  storage: { perAction: 0.0001, dailyCap: 0.005, description: "Stored encrypted fragment" },
  translation: { perAction: 0.50, dailyCap: 0.5, description: "Translation contribution" },
  onboarding: { perAction: 0.10, dailyCap: 1.0, description: "Onboarded new user" },
};

// === Q-Credits Tokenomics ===
// Max supply: 21,000,000 QC (fixed, like Bitcoin)
// Value: 1 QC = 0.01 gram gold (pegged to gold spot price)
// Halving: every 2,100,000 QC mined, rewards halve
// Minimum reward: 0.001 QC per action
const MAX_SUPPLY = 21_000_000;
const HALVING_INTERVAL = 2_100_000;
// 1 QC = 100,000,000 Sparks (smallest unit, like Bitcoin satoshis)
const SPARKS_PER_QC = 100_000_000;

let totalNetworkMined = 0;
let networkMiners = 1;

let stats: MiningStats = {
  totalEarned: 0,
  todayEarned: 0,
  todayDate: new Date().toISOString().split("T")[0],
  activeTypes: [],
  relayCount: 0,
  meshUptime: 0,
  storageUsedMB: 0,
  validationCount: 0,
  onboardedUsers: 0,
  miningStarted: 0,
  level: 1,
  streak: 0,
};

let rewards: MiningReward[] = [];
let miningActive = false;
let miningInterval: ReturnType<typeof setInterval> | null = null;

// --- Load / Save ---

export async function loadMining(): Promise<void> {
  try {
    const [s, r, a] = await Promise.all([
      AsyncStorage.getItem(STATS_KEY),
      AsyncStorage.getItem(REWARDS_KEY),
      AsyncStorage.getItem(MINING_ACTIVE_KEY),
    ]);
    if (s) {
      stats = JSON.parse(s);
      totalNetworkMined = stats.totalEarned; // Local approximation until network ledger
    }
    if (r) rewards = JSON.parse(r);
    if (a === "true") startMining();

    // Reset daily if new day
    const today = new Date().toISOString().split("T")[0];
    if (stats.todayDate !== today) {
      if (stats.todayEarned > 0) stats.streak++;
      stats.todayEarned = 0;
      stats.todayDate = today;
      await saveStats();
    }
  } catch (e) {}
}

async function saveStats(): Promise<void> {
  await AsyncStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

async function saveRewards(): Promise<void> {
  await AsyncStorage.setItem(REWARDS_KEY, JSON.stringify(rewards));
}

// --- Mining Control ---

export function isMiningActive(): boolean {
  return miningActive;
}

export async function startMining(): Promise<void> {
  if (miningActive) return;
  miningActive = true;
  stats.miningStarted = Date.now();

  // Enable default mining types
  stats.activeTypes = ["relay", "validation", "storage"];

  await AsyncStorage.setItem(MINING_ACTIVE_KEY, "true");
  await saveStats();

  // Simulate mining activity every 30 seconds
  miningInterval = setInterval(() => {
    simulateMiningCycle();
  }, 30000);
}

export async function stopMining(): Promise<void> {
  miningActive = false;
  if (miningInterval) {
    clearInterval(miningInterval);
    miningInterval = null;
  }
  await AsyncStorage.setItem(MINING_ACTIVE_KEY, "false");
  await saveStats();
}

export function toggleMiningType(type: MiningType): void {
  if (stats.activeTypes.includes(type)) {
    stats.activeTypes = stats.activeTypes.filter((t) => t !== type);
  } else {
    stats.activeTypes.push(type);
  }
  saveStats();
}

// --- Mining Cycle ---

function getHalvingMultiplier(): number {
  // Halving based on total QC mined (not number of miners)
  const halvings = Math.floor(totalNetworkMined / HALVING_INTERVAL);
  const multiplier = Math.pow(0.5, halvings);
  return Math.max(multiplier, 0.001); // minimum 0.1% of base rate
}

function isSupplyExhausted(): boolean {
  return totalNetworkMined >= MAX_SUPPLY;
}

function simulateMiningCycle(): void {
  if (isSupplyExhausted()) return; // No more QC to mine
  const halvingMult = getHalvingMultiplier();

  for (const type of stats.activeTypes) {
    const rate = REWARD_RATES[type];

    // Check daily cap
    const todayForType = rewards
      .filter((r) => r.type === type && new Date(r.timestamp).toISOString().split("T")[0] === stats.todayDate)
      .reduce((sum, r) => sum + r.amount, 0);

    if (todayForType >= rate.dailyCap) continue;

    // Random chance of reward per cycle (simulates actual network activity)
    const chance = type === "relay" ? 0.6 : type === "validation" ? 0.4 : type === "storage" ? 0.3 : 0.1;
    if (Math.random() > chance) continue;

    const amount = Math.round(rate.perAction * halvingMult * 100) / 100;
    if (amount <= 0) continue;

    // Credit the reward
    const reward: MiningReward = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 4),
      type,
      amount,
      timestamp: Date.now(),
      description: rate.description,
    };

    rewards.push(reward);
    stats.totalEarned += amount;
    stats.todayEarned += amount;
    totalNetworkMined += amount;

    // Update type-specific counters
    if (type === "relay") stats.relayCount++;
    if (type === "validation") stats.validationCount++;
    if (type === "storage") stats.storageUsedMB += 0.1;
    if (type === "mesh") stats.meshUptime += 0.5;

    // Add to wallet
    walletService.addMiningReward(amount, type);
  }

  // Update level based on total earned
  stats.level = Math.min(10, Math.floor(stats.totalEarned / 5) + 1);

  saveStats();
  saveRewards();
}

// --- Manual rewards ---

export async function claimOnboardingReward(newUserName: string): Promise<number> {
  const amount = REWARD_RATES.onboarding.perAction * getHalvingMultiplier();
  stats.onboardedUsers++;
  stats.totalEarned += amount;
  stats.todayEarned += amount;

  rewards.push({
    id: Date.now().toString(36),
    type: "onboarding",
    amount,
    timestamp: Date.now(),
    description: `Onboarded: ${newUserName}`,
  });

  walletService.addMiningReward(amount, "onboarding");
  await saveStats();
  await saveRewards();
  return amount;
}

export async function claimTranslationReward(language: string): Promise<number> {
  const amount = REWARD_RATES.translation.perAction * getHalvingMultiplier();
  stats.totalEarned += amount;
  stats.todayEarned += amount;

  rewards.push({
    id: Date.now().toString(36),
    type: "translation",
    amount,
    timestamp: Date.now(),
    description: `Translated to: ${language}`,
  });

  walletService.addMiningReward(amount, "translation");
  await saveStats();
  await saveRewards();
  return amount;
}

// --- Getters ---

export function getMiningStats(): MiningStats {
  return { ...stats };
}

export function getMiningRewards(limit: number = 50): MiningReward[] {
  return [...rewards].reverse().slice(0, limit);
}

export function getRewardRates(): typeof REWARD_RATES {
  return REWARD_RATES;
}

export function getSupplyInfo(): {
  maxSupply: number; totalMined: number; remaining: number;
  halvingProgress: number; sparksPerQC: number; currentHalving: number;
} {
  return {
    maxSupply: MAX_SUPPLY,
    totalMined: totalNetworkMined,
    remaining: MAX_SUPPLY - totalNetworkMined,
    halvingProgress: (totalNetworkMined % HALVING_INTERVAL) / HALVING_INTERVAL,
    sparksPerQC: SPARKS_PER_QC,
    currentHalving: Math.floor(totalNetworkMined / HALVING_INTERVAL),
  };
}

export function getEstimatedDaily(): number {
  const halvingMult = getHalvingMultiplier();
  return stats.activeTypes.reduce((sum, type) => {
    return sum + REWARD_RATES[type].dailyCap * halvingMult * 0.6; // ~60% of cap on average
  }, 0);
}
