//! # SPEAQ Chain - Quantum-Resistant Blockchain
//!
//! A blockchain combining Bitcoin's proven structure, Monero's privacy,
//! and post-quantum cryptography. No master key, no admin backdoor.
//!
//! ## Architecture
//! - Layer 1: Network (libp2p P2P + Tor + BLE Mesh)
//! - Layer 2: Consensus (Proof of Contribution)
//! - Layer 3: Privacy (CLSAG, Stealth, Pedersen, Bulletproofs)
//! - Layer 4: Quantum Signing (Dilithium-3, SPHINCS+, Kyber-768)
//! - Layer 5: Application (Wallet, SPV Light Client, Payments)
//! - Storage: RocksDB persistent database
//!
//! ## Motto: By the people, for the people.

pub mod crypto;
pub mod wallet;
pub mod transaction;
pub mod block;
pub mod consensus;
pub mod chain;
pub mod network;
pub mod storage;
pub mod spv;
#[cfg(feature = "tor")]
pub mod tor;
pub mod mesh;
