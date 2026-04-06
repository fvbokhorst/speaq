//! # SPEAQ Chain - Quantum-Resistant Blockchain
//!
//! A blockchain combining Bitcoin's proven structure, Monero's privacy,
//! and post-quantum cryptography. No master key, no admin backdoor.
//!
//! ## Architecture
//! - Layer 1: Network (libp2p P2P)
//! - Layer 2: Consensus (Proof of Contribution)
//! - Layer 3: Privacy (CLSAG, Stealth, Pedersen, Bulletproofs)
//! - Layer 4: Quantum Signing (Dilithium-3, Kyber-768)
//! - Layer 5: Application (Wallet, Payments)
//!
//! ## Motto: Van en voor de people.

pub mod crypto;
pub mod wallet;
pub mod transaction;
pub mod block;
pub mod consensus;
pub mod chain;
pub mod network;
