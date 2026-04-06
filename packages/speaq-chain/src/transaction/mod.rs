//! SPEAQ Chain Transaction Structure
//!
//! Based on PRD Section 4: Confidential Transactions
//!
//! Each transaction has:
//! - Inputs: references to previous outputs (with ring signatures for privacy)
//! - Outputs: stealth addresses with Pedersen commitments (hidden amounts)
//! - Dilithium-3 quantum signature
//! - Transaction type: Transfer, Mining, Stake
//!
//! Privacy features (to be implemented in crypto modules):
//! - CLSAG ring signatures: sender is hidden among 11 decoys
//! - Stealth addresses: one-time recipient addresses
//! - Pedersen commitments: amounts are cryptographically hidden
//! - Bulletproofs+: proves amount >= 0 without revealing it

use crate::crypto::dilithium;
use crate::wallet::WalletAddress;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Transaction type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TxType {
    /// Regular transfer between wallets
    Transfer,
    /// Mining reward (Proof of Contribution)
    Mining,
    /// Stake for validator selection
    Stake,
    /// Coinbase (genesis/block reward)
    Coinbase,
}

/// Reference to a previous transaction output
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct OutputReference {
    /// Transaction hash that contains the output
    pub tx_hash: [u8; 32],
    /// Index of the output in that transaction
    pub output_index: u32,
}

/// Transaction input
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxInput {
    /// Ring members: 11 possible sources (1 real + 10 decoys)
    /// Privacy: nobody knows which one is the real input
    pub ring_members: Vec<OutputReference>,
    /// Key image: prevents double-spending
    /// Unique per real input, reveals nothing about which ring member is real
    pub key_image: [u8; 32],
    // TODO: CLSAG ring signature (when crypto/clsag.rs is implemented)
}

/// Transaction output
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxOutput {
    /// Stealth address: one-time public key for the recipient
    /// Even the recipient's real address is not visible on chain
    pub stealth_address: [u8; 32],
    /// Pedersen commitment: C = rG + vH (hides the amount)
    /// Anyone can verify the math but nobody can see the value
    pub commitment: [u8; 32],
    /// Encrypted amount: only the recipient can decrypt this
    pub encrypted_amount: [u8; 8],
}

/// A complete SPEAQ Chain transaction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    /// Protocol version
    pub version: u8,
    /// Transaction type
    pub tx_type: TxType,
    /// Inputs (references to previous outputs)
    pub inputs: Vec<TxInput>,
    /// Outputs (new UTXOs)
    pub outputs: Vec<TxOutput>,
    /// Fee in Sparks (1 QC = 100,000,000 Sparks). 0 = free.
    pub fee: u64,
    /// Extra data (transaction public key for stealth address derivation)
    pub extra: Vec<u8>,
    /// Dilithium-3 post-quantum signature
    pub quantum_signature: dilithium::SignatureBytes,
    /// Timestamp (Unix milliseconds)
    pub timestamp: u64,
}

/// Transaction hash (unique identifier)
pub type TxHash = [u8; 32];

impl Transaction {
    /// Compute the transaction hash (SHA-256 of serialized tx without signature)
    pub fn hash(&self) -> TxHash {
        let mut hasher = Sha256::new();
        hasher.update(&[self.version]);
        hasher.update(&[self.tx_type as u8]);
        hasher.update(&self.fee.to_le_bytes());
        hasher.update(&self.timestamp.to_le_bytes());

        // Hash inputs
        for input in &self.inputs {
            hasher.update(&input.key_image);
            for rm in &input.ring_members {
                hasher.update(&rm.tx_hash);
                hasher.update(&rm.output_index.to_le_bytes());
            }
        }

        // Hash outputs
        for output in &self.outputs {
            hasher.update(&output.stealth_address);
            hasher.update(&output.commitment);
            hasher.update(&output.encrypted_amount);
        }

        hasher.update(&self.extra);

        let result = hasher.finalize();
        let mut hash = [0u8; 32];
        hash.copy_from_slice(&result);
        hash
    }

    /// Create a signed transfer transaction
    pub fn create_transfer(
        inputs: Vec<TxInput>,
        outputs: Vec<TxOutput>,
        extra: Vec<u8>,
        wallet: &crate::wallet::Wallet,
    ) -> Self {
        let mut tx = Transaction {
            version: 1,
            tx_type: TxType::Transfer,
            inputs,
            outputs,
            fee: 0, // Free transactions
            extra,
            quantum_signature: dilithium::SignatureBytes(vec![]),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        };

        // Sign the transaction hash with Dilithium-3
        let tx_hash = tx.hash();
        tx.quantum_signature = wallet.sign(&tx_hash);
        tx
    }

    /// Create a mining reward transaction (coinbase)
    pub fn create_mining_reward(
        miner_address: [u8; 32],
        amount_sparks: u64,
        block_height: u64,
        wallet: &crate::wallet::Wallet,
    ) -> Self {
        let output = TxOutput {
            stealth_address: miner_address,
            commitment: [0u8; 32], // TODO: Pedersen commitment
            encrypted_amount: amount_sparks.to_le_bytes(),
        };

        let mut extra = Vec::new();
        extra.extend_from_slice(&block_height.to_le_bytes());

        let mut tx = Transaction {
            version: 1,
            tx_type: TxType::Mining,
            inputs: vec![], // Mining has no inputs
            outputs: vec![output],
            fee: 0,
            extra,
            quantum_signature: dilithium::SignatureBytes(vec![]),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        };

        let tx_hash = tx.hash();
        tx.quantum_signature = wallet.sign(&tx_hash);
        tx
    }

    /// Verify the Dilithium-3 signature on this transaction
    pub fn verify_signature(&self, public_key: &pqcrypto_dilithium::dilithium3::PublicKey) -> bool {
        let tx_hash = self.hash();
        dilithium::verify(&tx_hash, &self.quantum_signature, public_key)
    }

    /// Serialize transaction to bytes
    pub fn to_bytes(&self) -> Vec<u8> {
        bincode::serialize(self).unwrap_or_default()
    }

    /// Deserialize transaction from bytes
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        bincode::deserialize(bytes).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wallet::Wallet;

    #[test]
    fn test_create_mining_reward() {
        let wallet = Wallet::generate();
        let tx = Transaction::create_mining_reward(
            wallet.address.0,
            10000, // 0.0001 QC in Sparks
            1,     // Block height 1
            &wallet,
        );

        assert_eq!(tx.version, 1);
        assert_eq!(tx.tx_type, TxType::Mining);
        assert_eq!(tx.inputs.len(), 0);
        assert_eq!(tx.outputs.len(), 1);
        assert_eq!(tx.fee, 0);

        // Verify signature
        assert!(
            tx.verify_signature(&wallet.signing.public_key),
            "Mining reward signature must verify"
        );

        println!("Mining tx hash: {}", hex::encode(tx.hash()));
        println!("Mining tx size: {} bytes", tx.to_bytes().len());
    }

    #[test]
    fn test_create_transfer() {
        let alice = Wallet::generate();
        let bob = Wallet::generate();

        // Simulate input (reference to previous output)
        let input = TxInput {
            ring_members: vec![OutputReference {
                tx_hash: [1u8; 32], // Fake previous tx
                output_index: 0,
            }],
            key_image: [2u8; 32], // Fake key image
        };

        // Output to Bob
        let output = TxOutput {
            stealth_address: bob.address.0,
            commitment: [0u8; 32],
            encrypted_amount: 150000u64.to_le_bytes(), // 0.0015 QC
        };

        let tx = Transaction::create_transfer(
            vec![input],
            vec![output],
            vec![],
            &alice,
        );

        assert_eq!(tx.tx_type, TxType::Transfer);
        assert_eq!(tx.inputs.len(), 1);
        assert_eq!(tx.outputs.len(), 1);

        // Alice's signature must verify
        assert!(tx.verify_signature(&alice.signing.public_key));

        // Bob's key must NOT verify Alice's signature
        assert!(!tx.verify_signature(&bob.signing.public_key));

        println!("Transfer tx hash: {}", hex::encode(tx.hash()));
        println!("Transfer tx size: {} bytes", tx.to_bytes().len());
    }

    #[test]
    fn test_tx_hash_deterministic() {
        let wallet = Wallet::generate();
        let tx = Transaction::create_mining_reward(wallet.address.0, 10000, 1, &wallet);

        let hash1 = tx.hash();
        let hash2 = tx.hash();
        assert_eq!(hash1, hash2, "Same tx must produce same hash");
    }

    #[test]
    fn test_tx_hash_unique() {
        let wallet = Wallet::generate();
        let tx1 = Transaction::create_mining_reward(wallet.address.0, 10000, 1, &wallet);
        let tx2 = Transaction::create_mining_reward(wallet.address.0, 10000, 2, &wallet);

        assert_ne!(tx1.hash(), tx2.hash(), "Different txs must have different hashes");
    }

    #[test]
    fn test_tx_tamper_detection() {
        let wallet = Wallet::generate();
        let mut tx = Transaction::create_mining_reward(wallet.address.0, 10000, 1, &wallet);

        // Signature verifies on original
        assert!(tx.verify_signature(&wallet.signing.public_key));

        // Tamper with the amount
        tx.outputs[0].encrypted_amount = 999999u64.to_le_bytes();

        // Signature must NO LONGER verify (hash changed)
        assert!(
            !tx.verify_signature(&wallet.signing.public_key),
            "Tampered tx must NOT verify"
        );
    }

    #[test]
    fn test_tx_serialization_roundtrip() {
        let wallet = Wallet::generate();
        let tx = Transaction::create_mining_reward(wallet.address.0, 10000, 1, &wallet);

        let bytes = tx.to_bytes();
        assert!(!bytes.is_empty());

        let restored = Transaction::from_bytes(&bytes).expect("Should deserialize");
        assert_eq!(restored.hash(), tx.hash());
        assert_eq!(restored.version, tx.version);
        assert_eq!(restored.tx_type, tx.tx_type);
    }
}
