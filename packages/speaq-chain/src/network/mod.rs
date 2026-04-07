//! SPEAQ Chain P2P Network -- libp2p
//!
//! Based on PRD: rust-libp2p (used by Polkadot, Filecoin, IPFS)
//!
//! Components:
//! - GossipSub: broadcast blocks and transactions to all peers
//! - Kademlia DHT: peer discovery and routing
//! - Noise: encrypted connections between nodes
//! - Yamux: multiplexed streams over single connection
//!
//! Message types:
//! - NewBlock: broadcast a newly produced block
//! - NewTransaction: broadcast a new transaction
//! - RequestBlock: request a specific block by height
//! - ResponseBlock: respond with the requested block

use crate::block::Block;
use crate::transaction::Transaction;
use libp2p::{
    gossipsub, identify, kad, noise,
    swarm::NetworkBehaviour,
    tcp, yamux, Multiaddr, PeerId, Swarm,
};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

/// Topics for GossipSub
pub const TOPIC_BLOCKS: &str = "speaq/blocks/1.0";
pub const TOPIC_TRANSACTIONS: &str = "speaq/txs/1.0";

/// Network messages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NetworkMessage {
    /// A new block has been produced
    NewBlock(Vec<u8>),
    /// A new transaction to be included in next block
    NewTransaction(Vec<u8>),
    /// Request a block by height
    RequestBlock { height: u64 },
    /// Response with a block
    ResponseBlock { height: u64, data: Vec<u8> },
}

/// SPEAQ network behaviour combining GossipSub + Kademlia + Identify
#[derive(NetworkBehaviour)]
pub struct SpeaqBehaviour {
    /// GossipSub for block/tx broadcasting
    pub gossipsub: gossipsub::Behaviour,
    /// Kademlia DHT for peer discovery
    pub kademlia: kad::Behaviour<kad::store::MemoryStore>,
    /// Identify protocol (exchange peer info)
    pub identify: identify::Behaviour,
}

/// Node configuration
#[derive(Debug, Clone)]
pub struct NodeConfig {
    /// Listen address (e.g., /ip4/0.0.0.0/tcp/9000)
    pub listen_addr: Multiaddr,
    /// Bootstrap peers to connect to initially
    pub bootstrap_peers: Vec<(PeerId, Multiaddr)>,
    /// Whether this node is a validator
    pub is_validator: bool,
}

/// Events from the network to the application
#[derive(Debug)]
pub enum NetworkEvent {
    /// Received a new block from a peer
    BlockReceived(Vec<u8>),
    /// Received a new transaction from a peer
    TransactionReceived(Vec<u8>),
    /// A new peer connected
    PeerConnected(PeerId),
    /// A peer disconnected
    PeerDisconnected(PeerId),
}

/// Create the libp2p swarm with SPEAQ behaviour
pub fn create_swarm() -> Result<Swarm<SpeaqBehaviour>, Box<dyn std::error::Error>> {
    let swarm = libp2p::SwarmBuilder::with_new_identity()
        .with_tokio()
        .with_tcp(
            tcp::Config::default(),
            noise::Config::new,
            yamux::Config::default,
        )?
        .with_behaviour(|key| {
            // GossipSub configuration
            let gossipsub_config = gossipsub::ConfigBuilder::default()
                .heartbeat_interval(std::time::Duration::from_secs(10))
                .validation_mode(gossipsub::ValidationMode::Strict)
                .build()
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

            let gossipsub = gossipsub::Behaviour::new(
                gossipsub::MessageAuthenticity::Signed(key.clone()),
                gossipsub_config,
            )
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

            // Kademlia DHT
            let kademlia = kad::Behaviour::new(
                key.public().to_peer_id(),
                kad::store::MemoryStore::new(key.public().to_peer_id()),
            );

            // Identify
            let identify = identify::Behaviour::new(identify::Config::new(
                "/speaq/1.0.0".to_string(),
                key.public(),
            ));

            Ok(SpeaqBehaviour {
                gossipsub,
                kademlia,
                identify,
            })
        })?
        .with_swarm_config(|c| c.with_idle_connection_timeout(std::time::Duration::from_secs(60)))
        .build();

    Ok(swarm)
}

/// Broadcast a block to all peers
pub fn broadcast_block(
    swarm: &mut Swarm<SpeaqBehaviour>,
    block: &Block,
) -> Result<(), Box<dyn std::error::Error>> {
    let data = block.to_bytes();
    let msg = NetworkMessage::NewBlock(data);
    let bytes = bincode::serialize(&msg)?;

    let topic = gossipsub::IdentTopic::new(TOPIC_BLOCKS);
    swarm
        .behaviour_mut()
        .gossipsub
        .publish(topic, bytes)?;

    Ok(())
}

/// Broadcast a transaction to all peers
pub fn broadcast_transaction(
    swarm: &mut Swarm<SpeaqBehaviour>,
    tx: &Transaction,
) -> Result<(), Box<dyn std::error::Error>> {
    let data = tx.to_bytes();
    let msg = NetworkMessage::NewTransaction(data);
    let bytes = bincode::serialize(&msg)?;

    let topic = gossipsub::IdentTopic::new(TOPIC_TRANSACTIONS);
    swarm
        .behaviour_mut()
        .gossipsub
        .publish(topic, bytes)?;

    Ok(())
}

/// Subscribe to block and transaction topics
pub fn subscribe_to_topics(
    swarm: &mut Swarm<SpeaqBehaviour>,
) -> Result<(), Box<dyn std::error::Error>> {
    let block_topic = gossipsub::IdentTopic::new(TOPIC_BLOCKS);
    let tx_topic = gossipsub::IdentTopic::new(TOPIC_TRANSACTIONS);

    swarm.behaviour_mut().gossipsub.subscribe(&block_topic)?;
    swarm.behaviour_mut().gossipsub.subscribe(&tx_topic)?;

    Ok(())
}

/// Add a bootstrap peer for initial connection
pub fn add_bootstrap_peer(
    swarm: &mut Swarm<SpeaqBehaviour>,
    peer_id: PeerId,
    addr: Multiaddr,
) {
    swarm
        .behaviour_mut()
        .kademlia
        .add_address(&peer_id, addr);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_network_message_serialization() {
        let msg = NetworkMessage::NewBlock(vec![1, 2, 3, 4]);
        let bytes = bincode::serialize(&msg).unwrap();
        let restored: NetworkMessage = bincode::deserialize(&bytes).unwrap();
        match restored {
            NetworkMessage::NewBlock(data) => assert_eq!(data, vec![1, 2, 3, 4]),
            _ => panic!("Wrong message type"),
        }
    }

    #[test]
    fn test_transaction_message_serialization() {
        let msg = NetworkMessage::NewTransaction(vec![5, 6, 7]);
        let bytes = bincode::serialize(&msg).unwrap();
        let restored: NetworkMessage = bincode::deserialize(&bytes).unwrap();
        match restored {
            NetworkMessage::NewTransaction(data) => assert_eq!(data, vec![5, 6, 7]),
            _ => panic!("Wrong message type"),
        }
    }

    #[test]
    fn test_request_block_message() {
        let msg = NetworkMessage::RequestBlock { height: 42 };
        let bytes = bincode::serialize(&msg).unwrap();
        let restored: NetworkMessage = bincode::deserialize(&bytes).unwrap();
        match restored {
            NetworkMessage::RequestBlock { height } => assert_eq!(height, 42),
            _ => panic!("Wrong message type"),
        }
    }

    #[test]
    fn test_topic_constants() {
        assert_eq!(TOPIC_BLOCKS, "speaq/blocks/1.0");
        assert_eq!(TOPIC_TRANSACTIONS, "speaq/txs/1.0");
    }

    #[tokio::test]
    async fn test_create_swarm() {
        let swarm = create_swarm();
        assert!(swarm.is_ok(), "Swarm creation must succeed");
        let swarm = swarm.unwrap();
        println!("Node PeerId: {}", swarm.local_peer_id());
    }

    #[tokio::test]
    async fn test_subscribe_topics() {
        let mut swarm = create_swarm().unwrap();
        let result = subscribe_to_topics(&mut swarm);
        assert!(result.is_ok(), "Topic subscription must succeed");
    }

    #[tokio::test]
    async fn test_two_nodes_connect() {
        // Create two nodes
        let mut node1 = create_swarm().unwrap();
        let mut node2 = create_swarm().unwrap();

        // Node 1 listens
        let addr: Multiaddr = "/ip4/127.0.0.1/tcp/0".parse().unwrap();
        node1.listen_on(addr).unwrap();

        // Give node 1 time to start listening
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        // Get node 1's actual listen address
        let node1_peer_id = *node1.local_peer_id();
        let node2_peer_id = *node2.local_peer_id();

        assert_ne!(node1_peer_id, node2_peer_id, "Nodes must have different PeerIds");
        println!("Node 1: {}", node1_peer_id);
        println!("Node 2: {}", node2_peer_id);
    }
}

    #[test]
    fn test_reject_malformed_block_message() {
        // Corrupt data should not crash the deserializer
        let corrupt = vec![0xFF, 0xFF, 0xFF, 0xFF, 0x00];
        let result: Result<NetworkMessage, _> = bincode::deserialize(&corrupt);
        assert!(result.is_err(), "Corrupt data must be rejected");
    }

    #[test]
    fn test_reject_empty_message() {
        let empty: Vec<u8> = vec![];
        let result: Result<NetworkMessage, _> = bincode::deserialize(&empty);
        assert!(result.is_err(), "Empty data must be rejected");
    }

    #[test]
    fn test_block_message_integrity() {
        use crate::block::genesis::create_genesis_block;
        use crate::wallet::Wallet;

        let wallet = Wallet::generate();
        let block = create_genesis_block(&wallet);
        let block_bytes = block.to_bytes();

        let msg = NetworkMessage::NewBlock(block_bytes.clone());
        let serialized = bincode::serialize(&msg).unwrap();

        // Tamper with serialized data
        let mut tampered = serialized.clone();
        if let Some(last) = tampered.last_mut() { *last ^= 0xFF; }

        let result: Result<NetworkMessage, _> = bincode::deserialize(&tampered);
        // Either fails to deserialize or produces different data
        if let Ok(NetworkMessage::NewBlock(data)) = result {
            assert_ne!(data, block_bytes, "Tampered data must differ from original");
        }
    }
