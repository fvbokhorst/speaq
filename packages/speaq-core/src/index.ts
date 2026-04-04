/**
 * @speaq/core - SPEAQ Quantum Freedom Platform Core Library
 *
 * Crypto: Kyber key exchange, AES-256-GCM, HKDF, Double Ratchet
 * Cost: Q-Credits tracking, tier enforcement (ported from plexaris-agent-core)
 * Hooks: Event system (ported from plexaris-agent-core)
 * Coordinator: Message pipeline (ported from plexaris-agent-core)
 * Memory: Encrypted state persistence (ported from plexaris-agent-core)
 */

// Crypto
export * as kyber from "./crypto/kyber";
export * as aes from "./crypto/aes";
export * as hkdf from "./crypto/hkdf";
export * as ratchet from "./crypto/ratchet";

// Cost (ported from plexaris-agent-core)
export { CostTracker } from "./cost/tracker";
export type { Transaction } from "./cost/tracker";
export { BudgetEnforcer } from "./cost/enforcer";
export type { Tier } from "./cost/enforcer";

// Hooks (ported from plexaris-agent-core)
export { HookRegistry } from "./hooks/registry";
export type { HookEvent } from "./hooks/registry";

// Coordinator (ported from plexaris-agent-core)
export { Pipeline, createMessagePipeline, unpad } from "./coordinator/pipeline";

// Memory (ported from plexaris-agent-core)
export { MemoryManager, InMemoryStore } from "./memory/manager";
export type { MemoryStore } from "./memory/manager";
