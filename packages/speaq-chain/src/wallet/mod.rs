//! SPEAQ Wallet - Quantum-Resistant Address Generation
//!
//! Each wallet has two keypairs:
//! 1. Dilithium-3 signing keypair (for signing transactions)
//! 2. Kyber-768 KEM keypair (for receiving stealth payments)
//!
//! The wallet address is the SHA-256 hash of both public keys combined.

pub mod address;

pub use address::{Wallet, WalletAddress};
