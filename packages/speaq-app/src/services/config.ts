/**
 * SPEAQ App Configuration
 * Central config for relay URLs, feature flags, tier limits
 */

export const config = {
  // Relay server
  relay: {
    url: "wss://speaq-relay-244491980730.europe-west1.run.app",
    healthUrl: "https://speaq-relay-244491980730.europe-west1.run.app/api/v1/health",
    localUrl: "ws://localhost:8080", // For development
  },

  // App info
  app: {
    name: "SPEAQ",
    version: "0.1.0",
    tagline: "SPEAQ Freely.",
    domain: "thespeaq.com",
  },

  // Encryption
  crypto: {
    kyberLevel: 768,
    aesKeyBits: 256,
    paddingBlockSize: 4096,
  },

  // Offline queue
  offline: {
    maxAgeDays: 7,
  },

  // Rate limits
  rateLimit: {
    messagesPerMinute: 100,
  },

  // Feature flags
  features: {
    voiceCalls: true,     // Phase 3 - ACTIVE
    videoCalls: true,     // Phase 3 - ACTIVE
    quantumPay: false,    // Phase 5
    freedomBrowse: false, // Phase 4
    witnessMode: false,   // Phase 5
    meshNetwork: false,   // Phase 4
    mining: false,        // Phase 6
  },
};
