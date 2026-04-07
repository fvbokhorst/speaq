//! SPEAQ Chain Persistent Storage -- RocksDB
//!
//! Stores blockchain data on disk. All data survives node restart.
//! RocksDB is used by Bitcoin, Ethereum, CockroachDB.
//!
//! Column families:
//! - blocks: height -> serialized block
//! - transactions: tx_hash -> serialized tx
//! - utxos: output_ref -> serialized utxo
//! - key_images: key_image -> block_height (spent tracking)
//! - metadata: key -> value (chain tip, total mined, etc.)

use crate::block::Block;
use crate::chain::UtxoEntry;
use crate::transaction::{OutputReference, Transaction};
use rocksdb::{DB, Options, ColumnFamilyDescriptor};
use std::path::Path;

const CF_BLOCKS: &str = "blocks";
const CF_TRANSACTIONS: &str = "transactions";
const CF_UTXOS: &str = "utxos";
const CF_KEY_IMAGES: &str = "key_images";
const CF_METADATA: &str = "metadata";

/// Persistent blockchain storage
pub struct BlockchainDB {
    db: DB,
}

impl BlockchainDB {
    /// Open or create database at path
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, String> {
        let mut opts = Options::default();
        opts.create_if_missing(true);
        opts.create_missing_column_families(true);

        let cf_descriptors = vec![
            ColumnFamilyDescriptor::new(CF_BLOCKS, Options::default()),
            ColumnFamilyDescriptor::new(CF_TRANSACTIONS, Options::default()),
            ColumnFamilyDescriptor::new(CF_UTXOS, Options::default()),
            ColumnFamilyDescriptor::new(CF_KEY_IMAGES, Options::default()),
            ColumnFamilyDescriptor::new(CF_METADATA, Options::default()),
        ];

        let db = DB::open_cf_descriptors(&opts, path, cf_descriptors)
            .map_err(|e| e.to_string())?;

        Ok(BlockchainDB { db })
    }

    /// Store a block
    pub fn put_block(&self, height: u64, block: &Block) -> Result<(), String> {
        let cf = self.db.cf_handle(CF_BLOCKS).ok_or("CF not found")?;
        let key = height.to_le_bytes();
        let value = block.to_bytes();
        self.db.put_cf(&cf, key, value).map_err(|e| e.to_string())
    }

    /// Get a block by height
    pub fn get_block(&self, height: u64) -> Result<Option<Block>, String> {
        let cf = self.db.cf_handle(CF_BLOCKS).ok_or("CF not found")?;
        let key = height.to_le_bytes();
        match self.db.get_cf(&cf, key).map_err(|e| e.to_string())? {
            Some(bytes) => Ok(Block::from_bytes(&bytes)),
            None => Ok(None),
        }
    }

    /// Store a transaction
    pub fn put_transaction(&self, tx_hash: &[u8; 32], tx: &Transaction) -> Result<(), String> {
        let cf = self.db.cf_handle(CF_TRANSACTIONS).ok_or("CF not found")?;
        let value = tx.to_bytes();
        self.db.put_cf(&cf, tx_hash, value).map_err(|e| e.to_string())
    }

    /// Mark a key image as spent
    pub fn mark_key_image_spent(&self, key_image: &[u8; 32], block_height: u64) -> Result<(), String> {
        let cf = self.db.cf_handle(CF_KEY_IMAGES).ok_or("CF not found")?;
        self.db.put_cf(&cf, key_image, block_height.to_le_bytes()).map_err(|e| e.to_string())
    }

    /// Check if key image is spent
    pub fn is_key_image_spent(&self, key_image: &[u8; 32]) -> Result<bool, String> {
        let cf = self.db.cf_handle(CF_KEY_IMAGES).ok_or("CF not found")?;
        self.db.get_cf(&cf, key_image)
            .map(|v| v.is_some())
            .map_err(|e| e.to_string())
    }

    /// Store metadata
    pub fn put_metadata(&self, key: &str, value: &[u8]) -> Result<(), String> {
        let cf = self.db.cf_handle(CF_METADATA).ok_or("CF not found")?;
        self.db.put_cf(&cf, key.as_bytes(), value).map_err(|e| e.to_string())
    }

    /// Get metadata
    pub fn get_metadata(&self, key: &str) -> Result<Option<Vec<u8>>, String> {
        let cf = self.db.cf_handle(CF_METADATA).ok_or("CF not found")?;
        self.db.get_cf(&cf, key.as_bytes()).map_err(|e| e.to_string())
    }

    /// Store chain tip height
    pub fn set_tip_height(&self, height: u64) -> Result<(), String> {
        self.put_metadata("tip_height", &height.to_le_bytes())
    }

    /// Get chain tip height
    pub fn get_tip_height(&self) -> Result<u64, String> {
        match self.get_metadata("tip_height")? {
            Some(bytes) if bytes.len() == 8 => {
                Ok(u64::from_le_bytes(bytes.try_into().unwrap()))
            }
            _ => Ok(0),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::block::genesis::create_genesis_block;
    use crate::wallet::Wallet;

    fn temp_db() -> BlockchainDB {
        let dir = tempfile::tempdir().unwrap();
        BlockchainDB::open(dir.path()).unwrap()
    }

    #[test]
    fn test_open_database() {
        let _db = temp_db();
    }

    #[test]
    fn test_store_and_retrieve_block() {
        let db = temp_db();
        let wallet = Wallet::generate();
        let genesis = create_genesis_block(&wallet);

        db.put_block(0, &genesis).unwrap();
        let retrieved = db.get_block(0).unwrap().unwrap();
        assert_eq!(retrieved.hash(), genesis.hash());
    }

    #[test]
    fn test_key_image_tracking() {
        let db = temp_db();
        let ki = [42u8; 32];

        assert!(!db.is_key_image_spent(&ki).unwrap());
        db.mark_key_image_spent(&ki, 1).unwrap();
        assert!(db.is_key_image_spent(&ki).unwrap());
    }

    #[test]
    fn test_metadata() {
        let db = temp_db();
        db.set_tip_height(42).unwrap();
        assert_eq!(db.get_tip_height().unwrap(), 42);
    }

    #[test]
    fn test_nonexistent_block_returns_none() {
        let db = temp_db();
        assert!(db.get_block(999).unwrap().is_none());
    }
}
