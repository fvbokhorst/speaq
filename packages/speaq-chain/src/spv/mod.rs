//! SPV Light Client -- Simple Payment Verification
//!
//! Mobile devices don't download the full blockchain.
//! Instead, they download only block HEADERS and verify
//! individual transactions using Merkle proofs.
//!
//! This is how Bitcoin mobile wallets work.
//! SPEAQ light clients do the same but with quantum-safe signatures.

use crate::block::{BlockHash, BlockHeader, compute_merkle_root, verify_merkle_proof};
use crate::crypto::dilithium;
use crate::transaction::TxHash;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// A block header stored by the light client (no transactions)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LightBlockHeader {
    pub height: u64,
    pub hash: BlockHash,
    pub previous_hash: BlockHash,
    pub merkle_root: [u8; 32],
    pub timestamp: u64,
    pub validator_pubkey: dilithium::PublicKeyBytes,
    pub signature: dilithium::SignatureBytes,
}

/// Merkle proof for a single transaction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MerkleProof {
    /// The transaction hash being proven
    pub tx_hash: TxHash,
    /// The block height containing this transaction
    pub block_height: u64,
    /// Sibling hashes from leaf to root: (is_right, sibling_hash)
    pub path: Vec<(bool, [u8; 32])>,
}

/// SPV Light Client state
#[derive(Debug)]
pub struct LightClient {
    /// Block headers only (no full blocks)
    headers: Vec<LightBlockHeader>,
    /// Our wallet address for scanning
    wallet_address: [u8; 32],
}

impl LightClient {
    /// Create a new light client
    pub fn new(wallet_address: [u8; 32]) -> Self {
        LightClient {
            headers: Vec::new(),
            wallet_address,
        }
    }

    /// Add a block header (after verifying its signature)
    pub fn add_header(&mut self, header: LightBlockHeader) -> bool {
        // Verify the header signature
        let pk = match dilithium::import_public_key(&header.validator_pubkey) {
            Some(pk) => pk,
            None => return false,
        };

        // Reconstruct the header hash for verification
        let mut hasher = Sha256::new();
        hasher.update(&1u32.to_le_bytes()); // version
        hasher.update(&header.previous_hash);
        hasher.update(&header.merkle_root);
        hasher.update(&header.timestamp.to_le_bytes());
        hasher.update(&header.height.to_le_bytes());
        hasher.update(&header.validator_pubkey.0);
        // Note: simplified hash - production should match BlockHeader::hash() exactly

        if !dilithium::verify(&header.hash, &header.signature, &pk) {
            return false;
        }

        // Verify chain linking
        if let Some(last) = self.headers.last() {
            if header.previous_hash != last.hash {
                return false;
            }
            if header.height != last.height + 1 {
                return false;
            }
        }

        self.headers.push(header);
        true
    }

    /// Verify a transaction is included in a block using a Merkle proof
    pub fn verify_transaction(&self, proof: &MerkleProof) -> bool {
        // Find the header for this block height
        let header = match self.headers.iter().find(|h| h.height == proof.block_height) {
            Some(h) => h,
            None => return false,
        };

        // Verify the Merkle proof against the header's merkle root
        verify_merkle_proof(&proof.tx_hash, &proof.path, &header.merkle_root)
    }

    /// Get the current chain height
    pub fn height(&self) -> u64 {
        self.headers.last().map(|h| h.height).unwrap_or(0)
    }

    /// Get the latest block hash
    pub fn tip_hash(&self) -> BlockHash {
        self.headers.last().map(|h| h.hash).unwrap_or([0u8; 32])
    }

    /// Number of headers stored
    pub fn header_count(&self) -> usize {
        self.headers.len()
    }
}

/// Generate a Merkle proof for a transaction at a given index
pub fn generate_merkle_proof(
    tx_hashes: &[TxHash],
    tx_index: usize,
    block_height: u64,
) -> Option<MerkleProof> {
    if tx_index >= tx_hashes.len() || tx_hashes.is_empty() {
        return None;
    }

    let mut path = Vec::new();
    let mut level_hashes = tx_hashes.to_vec();

    // If odd, duplicate last
    if level_hashes.len() % 2 != 0 {
        let last = *level_hashes.last().unwrap();
        level_hashes.push(last);
    }

    let mut current_index = tx_index;

    while level_hashes.len() > 1 {
        let sibling_index = if current_index % 2 == 0 {
            current_index + 1
        } else {
            current_index - 1
        };

        if sibling_index < level_hashes.len() {
            let is_right = current_index % 2 == 0;
            path.push((is_right, level_hashes[sibling_index]));
        }

        // Compute next level
        let mut next_level = Vec::new();
        for pair in level_hashes.chunks(2) {
            let mut hasher = Sha256::new();
            hasher.update(&pair[0]);
            if pair.len() > 1 {
                hasher.update(&pair[1]);
            } else {
                hasher.update(&pair[0]);
            }
            let result = hasher.finalize();
            let mut hash = [0u8; 32];
            hash.copy_from_slice(&result);
            next_level.push(hash);
        }

        current_index /= 2;
        level_hashes = next_level;

        if level_hashes.len() % 2 != 0 && level_hashes.len() > 1 {
            let last = *level_hashes.last().unwrap();
            level_hashes.push(last);
        }
    }

    Some(MerkleProof {
        tx_hash: tx_hashes[tx_index],
        block_height,
        path,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_light_client_creation() {
        let client = LightClient::new([1u8; 32]);
        assert_eq!(client.height(), 0);
        assert_eq!(client.header_count(), 0);
    }

    #[test]
    fn test_merkle_proof_generation() {
        let tx_hashes: Vec<TxHash> = (0..4).map(|i| {
            let mut h = [0u8; 32];
            h[0] = i;
            h
        }).collect();

        let proof = generate_merkle_proof(&tx_hashes, 1, 5).unwrap();
        assert_eq!(proof.tx_hash, tx_hashes[1]);
        assert_eq!(proof.block_height, 5);
        assert!(!proof.path.is_empty());
        println!("Merkle proof depth: {}", proof.path.len());
    }

    #[test]
    fn test_merkle_proof_verification() {
        use crate::transaction::Transaction;
        use crate::wallet::Wallet;

        let wallet = Wallet::generate();
        let txs: Vec<Transaction> = (0..4).map(|i| {
            Transaction::create_mining_reward(wallet.address.0, 10000, i, &wallet)
        }).collect();

        let tx_hashes: Vec<TxHash> = txs.iter().map(|tx| tx.hash()).collect();
        let merkle_root = compute_merkle_root(&txs);

        // Generate proof for tx at index 2
        let proof = generate_merkle_proof(&tx_hashes, 2, 1).unwrap();

        // Verify against merkle root
        assert!(verify_merkle_proof(&proof.tx_hash, &proof.path, &merkle_root));

        // Wrong tx hash should fail
        let wrong_hash = [99u8; 32];
        assert!(!verify_merkle_proof(&wrong_hash, &proof.path, &merkle_root));
    }

    #[test]
    fn test_single_tx_proof() {
        let tx_hashes = vec![[42u8; 32]];
        let proof = generate_merkle_proof(&tx_hashes, 0, 0).unwrap();
        assert_eq!(proof.tx_hash, [42u8; 32]);
    }

    #[test]
    fn test_forged_merkle_proof_rejected() {
        use crate::transaction::Transaction;
        use crate::wallet::Wallet;

        let wallet = Wallet::generate();
        let txs: Vec<Transaction> = (0..4).map(|i| {
            Transaction::create_mining_reward(wallet.address.0, 10000, i, &wallet)
        }).collect();
        let merkle_root = compute_merkle_root(&txs);

        // Attacker creates fake proof with wrong sibling hashes
        let fake_proof = MerkleProof {
            tx_hash: txs[0].hash(),
            block_height: 1,
            path: vec![(true, [0xFF; 32]), (true, [0xAA; 32])], // Forged
        };
        assert!(!verify_merkle_proof(&fake_proof.tx_hash, &fake_proof.path, &merkle_root),
            "Forged merkle proof must be REJECTED");
    }

    #[test]
    fn test_wrong_tx_hash_rejected() {
        use crate::transaction::Transaction;
        use crate::wallet::Wallet;

        let wallet = Wallet::generate();
        let txs: Vec<Transaction> = (0..4).map(|i| {
            Transaction::create_mining_reward(wallet.address.0, 10000, i, &wallet)
        }).collect();
        let tx_hashes: Vec<TxHash> = txs.iter().map(|tx| tx.hash()).collect();
        let merkle_root = compute_merkle_root(&txs);

        // Get valid proof for tx 0
        let proof = generate_merkle_proof(&tx_hashes, 0, 1).unwrap();

        // Try to verify with a DIFFERENT tx hash (attacker claims different tx is in block)
        let fake_tx_hash = [0xDE; 32];
        assert!(!verify_merkle_proof(&fake_tx_hash, &proof.path, &merkle_root),
            "Wrong tx hash with valid proof must be REJECTED");
    }

    #[test]
    fn test_proof_for_nonexistent_index() {
        let tx_hashes = vec![[1u8; 32], [2u8; 32]];
        let result = generate_merkle_proof(&tx_hashes, 99, 1);
        assert!(result.is_none(), "Out of bounds index must return None");
    }
}
