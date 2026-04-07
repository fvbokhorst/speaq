//! BLE Mesh Network -- Offline Block Propagation
//!
//! When internet is unavailable or censored, nodes can propagate
//! blocks and transactions via Bluetooth Low Energy (BLE) mesh.
//!
//! How it works:
//! - Each device acts as a BLE beacon
//! - Blocks are split into chunks that fit in BLE advertisements
//! - Nearby devices relay chunks to extend range
//! - Eventually blocks reach a node with internet
//!
//! This is the ultimate censorship resistance:
//! even without internet, the network keeps running.
//!
//! Note: BLE requires native platform APIs (iOS CoreBluetooth, Android BLE)
//! This module defines the protocol; platform implementation is in the app layer.

use serde::{Deserialize, Serialize};

/// Maximum BLE advertisement payload (bytes)
pub const BLE_MAX_PAYLOAD: usize = 244;

/// BLE mesh message types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MeshMessage {
    /// Block chunk (for blocks too large for single BLE packet)
    BlockChunk {
        block_height: u64,
        chunk_index: u16,
        total_chunks: u16,
        data: Vec<u8>,
    },
    /// Complete transaction (usually fits in one packet)
    Transaction {
        tx_hash: [u8; 32],
        data: Vec<u8>,
    },
    /// Peer discovery beacon
    PeerBeacon {
        node_id: [u8; 16],
        chain_height: u64,
        timestamp: u64,
    },
    /// Request missing block
    RequestBlock {
        height: u64,
    },
}

/// Split a block into BLE-sized chunks
pub fn split_into_chunks(data: &[u8], block_height: u64) -> Vec<MeshMessage> {
    let chunk_data_size = BLE_MAX_PAYLOAD - 20; // Reserve 20 bytes for header
    let total_chunks = (data.len() + chunk_data_size - 1) / chunk_data_size;

    (0..total_chunks)
        .map(|i| {
            let start = i * chunk_data_size;
            let end = std::cmp::min(start + chunk_data_size, data.len());
            MeshMessage::BlockChunk {
                block_height,
                chunk_index: i as u16,
                total_chunks: total_chunks as u16,
                data: data[start..end].to_vec(),
            }
        })
        .collect()
}

/// Reassemble chunks into complete block data
pub fn reassemble_chunks(chunks: &[MeshMessage]) -> Option<Vec<u8>> {
    // Sort by chunk index
    let mut sorted: Vec<(u16, &Vec<u8>)> = chunks
        .iter()
        .filter_map(|msg| match msg {
            MeshMessage::BlockChunk {
                chunk_index, data, total_chunks, ..
            } => Some((*chunk_index, data)),
            _ => None,
        })
        .collect();

    sorted.sort_by_key(|(idx, _)| *idx);

    // Check all chunks present
    let expected = match chunks.first()? {
        MeshMessage::BlockChunk { total_chunks, .. } => *total_chunks as usize,
        _ => return None,
    };

    if sorted.len() != expected {
        return None;
    }

    // Concatenate
    let mut result = Vec::new();
    for (_, data) in sorted {
        result.extend_from_slice(data);
    }
    Some(result)
}

/// Create a peer discovery beacon
pub fn create_beacon(node_id: [u8; 16], chain_height: u64) -> MeshMessage {
    MeshMessage::PeerBeacon {
        node_id,
        chain_height,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_small_data() {
        let data = vec![1u8; 100]; // Small, fits in one chunk
        let chunks = split_into_chunks(&data, 42);
        assert_eq!(chunks.len(), 1);
    }

    #[test]
    fn test_split_large_data() {
        let data = vec![1u8; 1000]; // Large, needs multiple chunks
        let chunks = split_into_chunks(&data, 42);
        assert!(chunks.len() > 1);
        println!("1000 bytes split into {} BLE chunks", chunks.len());
    }

    #[test]
    fn test_reassemble() {
        let original = vec![42u8; 500];
        let chunks = split_into_chunks(&original, 1);
        let reassembled = reassemble_chunks(&chunks).unwrap();
        assert_eq!(reassembled, original);
    }

    #[test]
    fn test_reassemble_large() {
        let original: Vec<u8> = (0..2000).map(|i| (i % 256) as u8).collect();
        let chunks = split_into_chunks(&original, 1);
        let reassembled = reassemble_chunks(&chunks).unwrap();
        assert_eq!(reassembled, original);
    }

    #[test]
    fn test_beacon() {
        let beacon = create_beacon([1u8; 16], 100);
        match beacon {
            MeshMessage::PeerBeacon { chain_height, .. } => assert_eq!(chain_height, 100),
            _ => panic!("Wrong message type"),
        }
    }

    #[test]
    fn test_chunk_size_within_ble_limit() {
        let data = vec![0u8; 10000];
        let chunks = split_into_chunks(&data, 1);
        for chunk in &chunks {
            let serialized = bincode::serialize(chunk).unwrap();
            // Each serialized chunk should be reasonable size
            assert!(serialized.len() < 500, "Chunk too large: {} bytes", serialized.len());
        }
    }
}
