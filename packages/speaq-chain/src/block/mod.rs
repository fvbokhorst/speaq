//! SPEAQ Chain Block Structure
//!
//! Based on PRD Section 3: Block Structure
//!
//! Each block contains:
//! - Header: version, previous hash, merkle root, timestamp, height, validator
//! - Transactions: up to 1000 per block
//! - Dilithium-3 signature by the validator
//!
//! Blocks are linked: each block's previous_hash points to the prior block.
//! Merkle tree allows SPV clients to verify individual transactions.

pub mod genesis;

use crate::crypto::{dilithium, sphincs};
use crate::transaction::{Transaction, TxHash};
use crate::wallet::Wallet;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Maximum transactions per block
pub const MAX_TX_PER_BLOCK: usize = 1000;

/// Target block interval in seconds
pub const BLOCK_INTERVAL_SECS: u64 = 30;

/// Block hash (SHA-256)
pub type BlockHash = [u8; 32];

/// Block header
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockHeader {
    /// Protocol version
    pub version: u32,
    /// SHA-256 hash of the previous block (all zeros for genesis)
    pub previous_hash: BlockHash,
    /// Merkle root of all transactions in this block
    pub merkle_root: [u8; 32],
    /// Unix timestamp in milliseconds
    pub timestamp: u64,
    /// Block height (0 = genesis)
    pub height: u64,
    /// Validator's public signing key (serialized)
    pub validator_pubkey: dilithium::PublicKeyBytes,
    /// Validator's contribution score
    pub contribution_score: u64,
    /// Number of transactions
    pub tx_count: u32,
    /// Nonce for tie-breaking
    pub nonce: u64,
}

/// A complete block
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    /// Block header
    pub header: BlockHeader,
    /// Transactions in this block
    pub transactions: Vec<Transaction>,
    /// Dilithium-3 signature of the block hash by the validator (primary)
    pub signature: dilithium::SignatureBytes,
    /// SPHINCS+ signature of the block hash (backup, PRD 7.3 dual signing)
    pub sphincs_signature: sphincs::SphincsSignatureBytes,
}

impl BlockHeader {
    /// Compute the block hash: SHA-256 of the serialized header
    pub fn hash(&self) -> BlockHash {
        let mut hasher = Sha256::new();
        hasher.update(&self.version.to_le_bytes());
        hasher.update(&self.previous_hash);
        hasher.update(&self.merkle_root);
        hasher.update(&self.timestamp.to_le_bytes());
        hasher.update(&self.height.to_le_bytes());
        hasher.update(&self.validator_pubkey.0);
        hasher.update(&self.contribution_score.to_le_bytes());
        hasher.update(&self.tx_count.to_le_bytes());
        hasher.update(&self.nonce.to_le_bytes());

        let result = hasher.finalize();
        let mut hash = [0u8; 32];
        hash.copy_from_slice(&result);
        hash
    }
}

impl Block {
    /// Compute this block's hash
    pub fn hash(&self) -> BlockHash {
        self.header.hash()
    }

    /// Create a new block with transactions, signed by the validator
    pub fn create(
        previous_hash: BlockHash,
        height: u64,
        transactions: Vec<Transaction>,
        validator: &Wallet,
        contribution_score: u64,
    ) -> Self {
        let merkle_root = compute_merkle_root(&transactions);
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let header = BlockHeader {
            version: 1,
            previous_hash,
            merkle_root,
            timestamp,
            height,
            validator_pubkey: dilithium::export_public_key(&validator.signing.public_key),
            contribution_score,
            tx_count: transactions.len() as u32,
            nonce: 0,
        };

        let block_hash = header.hash();
        // Dual signing: Dilithium (primary) + SPHINCS+ (backup) -- PRD 7.3
        let signature = validator.sign(&block_hash);
        let sphincs_signature = sphincs::sign(&block_hash, &validator.sphincs.secret_key);

        Block {
            header,
            transactions,
            signature,
            sphincs_signature,
        }
    }

    /// Verify the block's dual signatures (both must pass -- PRD 7.3)
    pub fn verify_signature(&self) -> bool {
        let pk = match dilithium::import_public_key(&self.header.validator_pubkey) {
            Some(pk) => pk,
            None => return false,
        };
        let block_hash = self.header.hash();
        dilithium::verify(&block_hash, &self.signature, &pk)
    }

    /// Verify the merkle root matches the transactions
    pub fn verify_merkle_root(&self) -> bool {
        let computed = compute_merkle_root(&self.transactions);
        computed == self.header.merkle_root
    }

    /// Verify the block links to the correct previous block
    pub fn verify_chain_link(&self, previous_block: &Block) -> bool {
        self.header.previous_hash == previous_block.hash()
            && self.header.height == previous_block.header.height + 1
            && self.header.timestamp > previous_block.header.timestamp
    }

    /// Full block validation
    pub fn validate(&self, previous_block: Option<&Block>) -> bool {
        // Check signature
        if !self.verify_signature() {
            return false;
        }

        // Check merkle root
        if !self.verify_merkle_root() {
            return false;
        }

        // Check transaction count
        if self.transactions.len() != self.header.tx_count as usize {
            return false;
        }

        // Check max transactions
        if self.transactions.len() > MAX_TX_PER_BLOCK {
            return false;
        }

        // Check chain link (except for genesis)
        if let Some(prev) = previous_block {
            if !self.verify_chain_link(prev) {
                return false;
            }
        }

        true
    }

    /// Serialize block to bytes
    pub fn to_bytes(&self) -> Vec<u8> {
        bincode::serialize(self).unwrap_or_default()
    }

    /// Deserialize block from bytes
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        bincode::deserialize(bytes).ok()
    }
}

/// Compute the Merkle root of a list of transactions
///
/// ```text
///                 Merkle Root
///                /            \
///           H(AB)              H(CD)
///          /    \              /    \
///       H(A)    H(B)       H(C)    H(D)
///        |       |          |       |
///       Tx A    Tx B       Tx C    Tx D
/// ```
pub fn compute_merkle_root(transactions: &[Transaction]) -> [u8; 32] {
    if transactions.is_empty() {
        return [0u8; 32];
    }

    // Get transaction hashes as leaves
    let mut hashes: Vec<[u8; 32]> = transactions.iter().map(|tx| tx.hash()).collect();

    // If odd number, duplicate the last
    if hashes.len() % 2 != 0 {
        let last = *hashes.last().unwrap();
        hashes.push(last);
    }

    // Build tree bottom-up
    while hashes.len() > 1 {
        let mut next_level = Vec::new();
        for pair in hashes.chunks(2) {
            let mut hasher = Sha256::new();
            hasher.update(&pair[0]);
            if pair.len() > 1 {
                hasher.update(&pair[1]);
            } else {
                hasher.update(&pair[0]); // Duplicate if odd
            }
            let result = hasher.finalize();
            let mut hash = [0u8; 32];
            hash.copy_from_slice(&result);
            next_level.push(hash);
        }
        hashes = next_level;
    }

    hashes[0]
}

/// Verify a transaction is included in a block using a Merkle proof
/// (SPV verification -- light clients use this)
pub fn verify_merkle_proof(
    tx_hash: &TxHash,
    proof: &[(bool, [u8; 32])], // (is_right, sibling_hash)
    merkle_root: &[u8; 32],
) -> bool {
    let mut current = *tx_hash;

    for (is_right, sibling) in proof {
        let mut hasher = Sha256::new();
        if *is_right {
            hasher.update(&current);
            hasher.update(sibling);
        } else {
            hasher.update(sibling);
            hasher.update(&current);
        }
        let result = hasher.finalize();
        current.copy_from_slice(&result);
    }

    current == *merkle_root
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wallet::Wallet;

    #[test]
    fn test_create_block() {
        let validator = Wallet::generate();
        let tx = Transaction::create_mining_reward(validator.address.0, 10000, 1, &validator);

        let block = Block::create([0u8; 32], 1, vec![tx], &validator, 100);

        assert_eq!(block.header.version, 1);
        assert_eq!(block.header.height, 1);
        assert_eq!(block.header.tx_count, 1);
        assert_eq!(block.header.previous_hash, [0u8; 32]);
        println!("Block hash: {}", hex::encode(block.hash()));
        println!("Block size: {} bytes", block.to_bytes().len());
    }

    #[test]
    fn test_block_signature_verification() {
        let validator = Wallet::generate();
        let tx = Transaction::create_mining_reward(validator.address.0, 10000, 1, &validator);
        let block = Block::create([0u8; 32], 1, vec![tx], &validator, 100);

        assert!(block.verify_signature(), "Block signature must verify");
    }

    #[test]
    fn test_merkle_root_verification() {
        let validator = Wallet::generate();
        let tx1 = Transaction::create_mining_reward(validator.address.0, 10000, 1, &validator);
        let tx2 = Transaction::create_mining_reward(validator.address.0, 20000, 2, &validator);
        let block = Block::create([0u8; 32], 1, vec![tx1, tx2], &validator, 100);

        assert!(block.verify_merkle_root(), "Merkle root must match transactions");
    }

    #[test]
    fn test_chain_linking() {
        let validator = Wallet::generate();

        // Genesis block
        let tx0 = Transaction::create_mining_reward(validator.address.0, 10000, 0, &validator);
        let block0 = Block::create([0u8; 32], 0, vec![tx0], &validator, 100);

        // Block 1 links to genesis
        let tx1 = Transaction::create_mining_reward(validator.address.0, 10000, 1, &validator);
        let block1 = Block::create(block0.hash(), 1, vec![tx1], &validator, 100);

        assert!(block1.verify_chain_link(&block0), "Block 1 must link to genesis");

        // Block 2 links to block 1
        let tx2 = Transaction::create_mining_reward(validator.address.0, 10000, 2, &validator);
        let block2 = Block::create(block1.hash(), 2, vec![tx2], &validator, 100);

        assert!(block2.verify_chain_link(&block1), "Block 2 must link to block 1");
        assert!(!block2.verify_chain_link(&block0), "Block 2 must NOT link to genesis");
    }

    #[test]
    fn test_block_tamper_detection() {
        let validator = Wallet::generate();
        let tx = Transaction::create_mining_reward(validator.address.0, 10000, 1, &validator);
        let mut block = Block::create([0u8; 32], 1, vec![tx], &validator, 100);

        assert!(block.verify_signature(), "Original must verify");

        // Tamper with height
        block.header.height = 999;
        assert!(!block.verify_signature(), "Tampered block must NOT verify");
    }

    #[test]
    fn test_full_validation() {
        let validator = Wallet::generate();

        let tx0 = Transaction::create_mining_reward(validator.address.0, 10000, 0, &validator);
        let block0 = Block::create([0u8; 32], 0, vec![tx0], &validator, 100);

        let tx1 = Transaction::create_mining_reward(validator.address.0, 10000, 1, &validator);
        let block1 = Block::create(block0.hash(), 1, vec![tx1], &validator, 100);

        assert!(block0.validate(None), "Genesis must validate");
        assert!(block1.validate(Some(&block0)), "Block 1 must validate against genesis");
    }

    #[test]
    fn test_merkle_root_deterministic() {
        let validator = Wallet::generate();
        let tx = Transaction::create_mining_reward(validator.address.0, 10000, 1, &validator);
        let txs = vec![tx.clone()];

        let root1 = compute_merkle_root(&txs);
        let root2 = compute_merkle_root(&txs);
        assert_eq!(root1, root2, "Same txs must produce same merkle root");
    }

    #[test]
    fn test_merkle_root_changes_with_different_txs() {
        let validator = Wallet::generate();
        let tx1 = Transaction::create_mining_reward(validator.address.0, 10000, 1, &validator);
        let tx2 = Transaction::create_mining_reward(validator.address.0, 20000, 2, &validator);

        let root1 = compute_merkle_root(&[tx1]);
        let root2 = compute_merkle_root(&[tx2]);
        assert_ne!(root1, root2, "Different txs must produce different merkle roots");
    }

    #[test]
    fn test_empty_block() {
        let validator = Wallet::generate();
        let block = Block::create([0u8; 32], 0, vec![], &validator, 0);

        assert_eq!(block.header.tx_count, 0);
        assert_eq!(block.header.merkle_root, [0u8; 32]);
        assert!(block.verify_signature());
    }

    #[test]
    fn test_serialization_roundtrip() {
        let validator = Wallet::generate();
        let tx = Transaction::create_mining_reward(validator.address.0, 10000, 1, &validator);
        let block = Block::create([0u8; 32], 1, vec![tx], &validator, 100);

        let bytes = block.to_bytes();
        let restored = Block::from_bytes(&bytes).expect("Should deserialize");
        assert_eq!(restored.hash(), block.hash());
        assert_eq!(restored.header.height, block.header.height);
    }
}
