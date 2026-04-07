//! Genesis Block -- The First Block of SPEAQ Chain
//!
//! The genesis block is hardcoded and identical for all nodes.
//! It contains no transactions (or a single coinbase).
//! Previous hash is all zeros.
//! Height is 0.
//!
//! "By the people, for the people." -- Frank van Bokhorst, 2026

use super::{Block, BlockHeader};
use crate::crypto::dilithium;
use crate::transaction::Transaction;
use crate::wallet::Wallet;

/// The SPEAQ Chain motto, embedded in the genesis block
pub const GENESIS_MOTTO: &str = "By the people, for the people. - SPEAQ Chain Genesis, April 2026";

/// Create the genesis block
///
/// The genesis block is special:
/// - Height: 0
/// - Previous hash: all zeros (no previous block)
/// - Contains a single coinbase transaction with the motto
/// - Signed by the genesis validator
pub fn create_genesis_block(genesis_validator: &Wallet) -> Block {
    // Create coinbase transaction with embedded motto
    let mut coinbase = Transaction::create_mining_reward(
        genesis_validator.address.0,
        0, // Genesis has no reward
        0, // Block height 0
        genesis_validator,
    );
    // Embed the motto in the extra field
    coinbase.extra = GENESIS_MOTTO.as_bytes().to_vec();
    // Re-sign with updated extra
    let tx_hash = coinbase.hash();
    coinbase.quantum_signature = genesis_validator.sign(&tx_hash);

    Block::create(
        [0u8; 32], // Previous hash: all zeros
        0,         // Height: 0
        vec![coinbase],
        genesis_validator,
        0, // No contribution score for genesis
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_genesis_block() {
        let validator = Wallet::generate();
        let genesis = create_genesis_block(&validator);

        // Genesis properties
        assert_eq!(genesis.header.height, 0);
        assert_eq!(genesis.header.previous_hash, [0u8; 32]);
        assert_eq!(genesis.header.version, 1);
        assert_eq!(genesis.header.tx_count, 1);

        // Signature must verify
        assert!(genesis.verify_signature(), "Genesis signature must verify");

        // Merkle root must verify
        assert!(genesis.verify_merkle_root(), "Genesis merkle root must verify");

        // Full validation (no previous block)
        assert!(genesis.validate(None), "Genesis must validate");

        // Motto is embedded
        let motto_bytes = GENESIS_MOTTO.as_bytes();
        assert_eq!(
            genesis.transactions[0].extra, motto_bytes,
            "Genesis must contain the motto"
        );

        println!("Genesis block hash: {}", hex::encode(genesis.hash()));
        println!("Genesis block size: {} bytes", genesis.to_bytes().len());
        println!("Genesis motto: {}", GENESIS_MOTTO);
    }

    #[test]
    fn test_genesis_is_chain_root() {
        let validator = Wallet::generate();
        let genesis = create_genesis_block(&validator);

        // Block 1 can link to genesis
        let tx1 = Transaction::create_mining_reward(validator.address.0, 10000, 1, &validator);
        let block1 = Block::create(genesis.hash(), 1, vec![tx1], &validator, 100);

        assert!(block1.verify_chain_link(&genesis), "Block 1 must link to genesis");
        assert!(block1.validate(Some(&genesis)), "Block 1 must validate against genesis");
    }

    #[test]
    fn test_build_chain_from_genesis() {
        let validator = Wallet::generate();

        // Build a 5-block chain
        let genesis = create_genesis_block(&validator);
        let mut chain = vec![genesis];

        for i in 1..5 {
            let tx = Transaction::create_mining_reward(
                validator.address.0,
                10000,
                i as u64,
                &validator,
            );
            let prev_hash = chain.last().unwrap().hash();
            let block = Block::create(prev_hash, i as u64, vec![tx], &validator, i as u64 * 10);
            chain.push(block);
        }

        // Verify the entire chain
        assert!(chain[0].validate(None), "Genesis must validate");
        for i in 1..chain.len() {
            assert!(
                chain[i].validate(Some(&chain[i - 1])),
                "Block {} must validate against block {}",
                i,
                i - 1
            );
        }

        println!("Chain of {} blocks validated successfully", chain.len());
        for (i, block) in chain.iter().enumerate() {
            println!(
                "  Block {}: hash={}, txs={}",
                i,
                hex::encode(&block.hash()[..8]),
                block.header.tx_count
            );
        }
    }
}
