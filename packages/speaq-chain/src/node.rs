//! SPEAQ Node - Command handlers for the CLI
//!
//! Each handler corresponds to a CLI subcommand.
//! Data directory: ~/.speaq/ (configurable)
//! P2P port: 9333, REST API port: 9334

use std::path::{Path, PathBuf};
use std::net::SocketAddr;
use futures::StreamExt;
use speaq_chain::wallet::Wallet;
use speaq_chain::block::genesis::create_genesis_block;
use pqcrypto_traits::sign::SecretKey as SignSecretKey;
use pqcrypto_traits::kem::SecretKey as KemSecretKey;
use tracing::error;

const WALLET_FILE: &str = "wallet.json";
const NODE_CONFIG_FILE: &str = "node.json";

/// Serializable wallet data (keys are large, store as hex)
#[derive(serde::Serialize, serde::Deserialize)]
struct WalletData {
    address: String,
    signing_pk: String,
    signing_sk: String,
    sphincs_pk: String,
    sphincs_sk: String,
    kem_pk: String,
    kem_sk: String,
    created_at: u64,
}

/// Node configuration
#[derive(serde::Serialize, serde::Deserialize)]
struct NodeConfig {
    initialized: bool,
    genesis_hash: String,
    chain_height: u64,
    p2p_port: u16,
    api_port: u16,
}

// ============================================================================
// INIT
// ============================================================================

pub async fn handle_init(data_dir: &Path) {
    println!();
    println!("  SPEAQ Chain Node - Initialization");
    println!("  \"By the people, for the people.\"");
    println!();

    // Check if already initialized
    let config_path = data_dir.join(NODE_CONFIG_FILE);
    if config_path.exists() {
        println!("  [!] Node already initialized at {}", data_dir.display());
        println!("  [!] Delete {} to reinitialize.", data_dir.display());
        return;
    }

    // Create data directory
    if let Err(e) = std::fs::create_dir_all(data_dir) {
        error!("Failed to create data directory: {}", e);
        println!("  [ERROR] Failed to create {}: {}", data_dir.display(), e);
        return;
    }
    println!("  [1/4] Data directory: {}", data_dir.display());

    // Generate wallet
    println!("  [2/4] Generating quantum-resistant wallet...");
    println!("         Dilithium-3 (FIPS 204) signing keypair");
    println!("         SPHINCS+ (FIPS 205) backup signing keypair");
    println!("         Kyber-768 (FIPS 203) key encapsulation keypair");
    let wallet = Wallet::generate();
    println!("         Address: {}", wallet.address);

    // Save wallet
    let wallet_data = serialize_wallet(&wallet);
    let wallet_path = data_dir.join(WALLET_FILE);
    match serde_json::to_string_pretty(&wallet_data) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&wallet_path, json) {
                error!("Failed to save wallet: {}", e);
                println!("  [ERROR] Failed to save wallet: {}", e);
                return;
            }
        }
        Err(e) => {
            error!("Failed to serialize wallet: {}", e);
            return;
        }
    }
    println!("  [3/4] Wallet saved to {}", wallet_path.display());

    // Create genesis block and store in RocksDB
    println!("  [4/5] Creating genesis block...");
    let genesis = create_genesis_block(&wallet);
    let genesis_hash = hex::encode(genesis.hash());
    println!("         Genesis hash: {}", genesis_hash);
    println!("         Motto: \"By the people, for the people.\"");
    println!("         Transactions: {}", genesis.header.tx_count);

    // Store genesis block in RocksDB
    println!("  [5/5] Storing genesis block in RocksDB...");
    let db_path = data_dir.join("chaindata");
    match speaq_chain::storage::BlockchainDB::open(&db_path) {
        Ok(db) => {
            if let Err(e) = db.put_block(0, &genesis) {
                println!("  [ERROR] Failed to store genesis block: {}", e);
                return;
            }
            if let Err(e) = db.set_tip_height(0) {
                println!("  [ERROR] Failed to set tip height: {}", e);
                return;
            }
            if let Err(e) = db.put_metadata("total_mined_sparks", &0u64.to_le_bytes()) {
                println!("  [ERROR] Failed to set total mined: {}", e);
                return;
            }
            println!("         RocksDB: {}", db_path.display());
        }
        Err(e) => {
            println!("  [ERROR] Failed to open RocksDB: {}", e);
            return;
        }
    }

    // Save node config
    let config = NodeConfig {
        initialized: true,
        genesis_hash: genesis_hash.clone(),
        chain_height: 0,
        p2p_port: 9333,
        api_port: 9334,
    };
    match serde_json::to_string_pretty(&config) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&config_path, json) {
                error!("Failed to save config: {}", e);
                println!("  [ERROR] Failed to save config: {}", e);
                return;
            }
        }
        Err(e) => {
            error!("Failed to serialize config: {}", e);
            return;
        }
    }

    println!();
    println!("  Node initialized successfully.");
    println!();
    println!("  Next steps:");
    println!("    speaq-node start                    Start the node");
    println!("    speaq-node status                   Check node status");
    println!("    speaq-node wallet balance            Check wallet balance");
    println!();
}

// ============================================================================
// JOIN (join existing network by copying genesis from another node)
// ============================================================================

pub async fn handle_join(data_dir: &Path, genesis_from: &Path) {
    println!();
    println!("  SPEAQ Chain Node - Join Network");
    println!("  \"By the people, for the people.\"");
    println!();

    // Check if already initialized
    let config_path = data_dir.join(NODE_CONFIG_FILE);
    if config_path.exists() {
        println!("  [!] Node already initialized at {}", data_dir.display());
        return;
    }

    // Check source node exists
    let source_config_path = genesis_from.join(NODE_CONFIG_FILE);
    let source_db_path = genesis_from.join("chaindata");
    if !source_config_path.exists() {
        println!("  [ERROR] Source node not found at {}", genesis_from.display());
        return;
    }

    // Read source config for genesis hash
    let source_config = match load_config(genesis_from) {
        Some(c) => c,
        None => { println!("  [ERROR] Failed to read source config"); return; }
    };

    // Create data directory
    std::fs::create_dir_all(data_dir).ok();
    println!("  [1/4] Data directory: {}", data_dir.display());

    // Generate own wallet (each node has its own identity)
    println!("  [2/4] Generating quantum-resistant wallet...");
    let wallet = Wallet::generate();
    println!("         Address: {}", wallet.address);

    // Save wallet
    let wallet_data = serialize_wallet(&wallet);
    let wallet_path = data_dir.join(WALLET_FILE);
    let json = serde_json::to_string_pretty(&wallet_data).unwrap();
    std::fs::write(&wallet_path, json).ok();
    println!("  [3/4] Wallet saved");

    // Copy genesis block from source RocksDB
    println!("  [4/4] Copying genesis block from source...");
    let source_db = match speaq_chain::storage::BlockchainDB::open(&source_db_path) {
        Ok(d) => d,
        Err(e) => { println!("  [ERROR] Failed to open source RocksDB: {}", e); return; }
    };
    let genesis = match source_db.get_block(0) {
        Ok(Some(b)) => b,
        _ => { println!("  [ERROR] No genesis block in source"); return; }
    };
    drop(source_db); // Close source DB

    // Store genesis in our own RocksDB
    let db_path = data_dir.join("chaindata");
    let db = match speaq_chain::storage::BlockchainDB::open(&db_path) {
        Ok(d) => d,
        Err(e) => { println!("  [ERROR] Failed to create RocksDB: {}", e); return; }
    };
    db.put_block(0, &genesis).ok();
    db.set_tip_height(0).ok();
    db.put_metadata("total_mined_sparks", &0u64.to_le_bytes()).ok();
    println!("         Genesis hash: {}", source_config.genesis_hash);

    // Save config with SAME genesis hash
    let config = NodeConfig {
        initialized: true,
        genesis_hash: source_config.genesis_hash,
        chain_height: 0,
        p2p_port: 9333,
        api_port: 9334,
    };
    let json = serde_json::to_string_pretty(&config).unwrap();
    std::fs::write(data_dir.join(NODE_CONFIG_FILE), json).ok();

    println!();
    println!("  Joined network successfully.");
    println!("  Same genesis block as source node.");
    println!();
    println!("  Next: speaq-node start --peers /ip4/127.0.0.1/tcp/9333");
    println!();
}

// ============================================================================
// START
// ============================================================================

// API-only mode for Cloud Run (no P2P, just REST API + block production)
pub async fn handle_start_api_only(data_dir: &Path, api_port: u16) {
    let config = match load_config(data_dir) {
        Some(c) => c,
        None => { println!("  [ERROR] Node not initialized. Run: speaq-node init"); return; }
    };

    println!("  SPEAQ Chain Node - API Only Mode");
    println!("  API port: {}", api_port);
    println!("  Genesis: {}...", &config.genesis_hash[..16]);

    let db_path = data_dir.join("chaindata");
    let db = match speaq_chain::storage::BlockchainDB::open(&db_path) {
        Ok(d) => d,
        Err(e) => { println!("  [ERROR] Failed to open RocksDB: {}", e); return; }
    };
    let tip_height = db.get_tip_height().unwrap_or(0);
    let total_mined: u64 = db.get_metadata("total_mined_sparks")
        .ok().flatten()
        .and_then(|b| if b.len() == 8 { Some(u64::from_le_bytes(b.try_into().unwrap())) } else { None })
        .unwrap_or(0);

    let chain_height = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(tip_height));
    let peer_count = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let blocks_received = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
    let txs_received = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));

    let api_addr: SocketAddr = ([0, 0, 0, 0], api_port).into();
    let _api = tokio::spawn(start_api_server_with_state(
        api_addr, data_dir.to_path_buf(), "api-only".to_string(), config.genesis_hash,
        peer_count, chain_height, blocks_received, txs_received,
    ));
    println!("  REST API listening on http://0.0.0.0:{}", api_port);
    println!("  Node running in API-only mode. Press Ctrl+C to stop.");

    // Block production timer
    use speaq_chain::consensus::calculate_block_reward;
    use speaq_chain::transaction::Transaction;

    let wallet = match load_wallet(data_dir) {
        Some(w) => w,
        None => { println!("  [WARN] No wallet, running without block production"); tokio::signal::ctrl_c().await.ok(); return; }
    };

    let mut current_height = tip_height;
    let mut current_prev_hash: [u8; 32] = if let Ok(Some(b)) = db.get_block(tip_height) { b.hash() } else { [0u8; 32] };
    let mut current_mined = total_mined;
    let mut timer = tokio::time::interval(std::time::Duration::from_secs(speaq_chain::block::BLOCK_INTERVAL_SECS));
    timer.tick().await;

    loop {
        tokio::select! {
            _ = timer.tick() => {
                let next = current_height + 1;
                let reward = calculate_block_reward(current_mined);
                if reward > 0 {
                    let coinbase = Transaction::create_mining_reward(wallet.address.0, reward, next, &wallet);
                    let block = speaq_chain::block::Block::create(current_prev_hash, next, vec![coinbase], &wallet, 100);
                    if block.verify_signature() && block.verify_merkle_root() {
                        db.put_block(next, &block).ok();
                        db.set_tip_height(next).ok();
                        current_mined += reward;
                        db.put_metadata("total_mined_sparks", &current_mined.to_le_bytes()).ok();
                        current_prev_hash = block.hash();
                        current_height = next;
                        println!("  [MINE] Block {} | {:.8} QC | total {:.8} QC",
                            next, reward as f64 / 100_000_000.0, current_mined as f64 / 100_000_000.0);
                    }
                }
            }
            _ = tokio::signal::ctrl_c() => { println!("  Shutting down..."); break; }
        }
    }
}

pub async fn handle_start(data_dir: &Path, p2p_port: u16, api_port: u16, peers: Vec<String>) {
    use speaq_chain::network::{create_swarm, subscribe_to_topics, TOPIC_BLOCKS, TOPIC_TRANSACTIONS, NetworkMessage};
    use libp2p::{swarm::SwarmEvent, Multiaddr};
    use libp2p::gossipsub;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};

    // Check initialization
    let config = match load_config(data_dir) {
        Some(c) => c,
        None => {
            println!("  [ERROR] Node not initialized. Run: speaq-node init");
            return;
        }
    };

    println!();
    println!("  SPEAQ Chain Node - Starting");
    println!("  \"By the people, for the people.\"");
    println!();
    println!("  Chain height: {}", config.chain_height);
    println!("  Genesis: {}...", &config.genesis_hash[..16]);
    println!("  P2P port: {}", p2p_port);
    println!("  API port: {}", api_port);
    println!("  Peers: {}", if peers.is_empty() { "none (standalone)".to_string() } else { peers.join(", ") });
    println!();

    // Load wallet
    let wallet = match load_wallet(data_dir) {
        Some(w) => w,
        None => {
            println!("  [ERROR] No wallet found. Run: speaq-node init");
            return;
        }
    };
    println!("  Wallet: {}", wallet.address);

    // Create P2P swarm
    let mut swarm = match create_swarm() {
        Ok(s) => s,
        Err(e) => {
            println!("  [ERROR] Failed to create P2P swarm: {}", e);
            return;
        }
    };

    // Listen on P2P port
    let listen_addr: Multiaddr = format!("/ip4/0.0.0.0/tcp/{}", p2p_port).parse().unwrap();
    if let Err(e) = swarm.listen_on(listen_addr) {
        println!("  [ERROR] Failed to listen on port {}: {}", p2p_port, e);
        return;
    }
    let peer_id = *swarm.local_peer_id();
    println!("  P2P PeerId: {}", peer_id);
    println!("  P2P listening on /ip4/0.0.0.0/tcp/{}", p2p_port);

    // Subscribe to topics
    if let Err(e) = subscribe_to_topics(&mut swarm) {
        println!("  [ERROR] Failed to subscribe to topics: {}", e);
        return;
    }
    println!("  Subscribed to: {}, {}", TOPIC_BLOCKS, TOPIC_TRANSACTIONS);

    // Connect to bootstrap peers
    for peer_addr in &peers {
        match peer_addr.parse::<Multiaddr>() {
            Ok(addr) => {
                println!("  Connecting to peer: {}", addr);
                if let Err(e) = swarm.dial(addr) {
                    println!("  [WARN] Failed to dial peer: {}", e);
                }
            }
            Err(e) => {
                println!("  [WARN] Invalid peer address '{}': {}", peer_addr, e);
            }
        }
    }

    // Open RocksDB and load chain state
    let db_path = data_dir.join("chaindata");
    let db = match speaq_chain::storage::BlockchainDB::open(&db_path) {
        Ok(d) => d,
        Err(e) => {
            println!("  [ERROR] Failed to open RocksDB: {}", e);
            return;
        }
    };
    let tip_height = db.get_tip_height().unwrap_or(0);
    let total_mined_sparks: u64 = db.get_metadata("total_mined_sparks")
        .ok().flatten()
        .and_then(|b| if b.len() == 8 { Some(u64::from_le_bytes(b.try_into().unwrap())) } else { None })
        .unwrap_or(0);
    println!("  RocksDB loaded: height={}, mined={} Sparks", tip_height, total_mined_sparks);

    // Get previous block hash for block production
    let prev_hash: [u8; 32] = if let Ok(Some(tip_block)) = db.get_block(tip_height) {
        tip_block.hash()
    } else {
        [0u8; 32]
    };

    // Shared state for API
    let peer_count = Arc::new(AtomicUsize::new(0));
    let chain_height = Arc::new(AtomicU64::new(tip_height));
    let blocks_received = Arc::new(AtomicU64::new(0));
    let txs_received = Arc::new(AtomicU64::new(0));

    // Start REST API server with shared state
    let api_addr: SocketAddr = ([0, 0, 0, 0], api_port).into();
    let api_peer_count = peer_count.clone();
    let api_chain_height = chain_height.clone();
    let api_blocks = blocks_received.clone();
    let api_txs = txs_received.clone();
    let api_peer_id = peer_id.to_string();
    let api_genesis = config.genesis_hash.clone();
    let api_data_dir = data_dir.to_path_buf();
    let _api_handle = tokio::spawn(start_api_server_with_state(
        api_addr, api_data_dir, api_peer_id, api_genesis,
        api_peer_count, api_chain_height, api_blocks, api_txs,
    ));
    println!("  REST API listening on http://0.0.0.0:{}", api_port);

    // Register this node as a validator
    use speaq_chain::consensus::{Validator, Region, calculate_block_reward, select_block_producer};
    use speaq_chain::crypto::dilithium;

    let my_validator = Validator {
        address: wallet.address.clone(),
        signing_pubkey: dilithium::export_public_key(&wallet.signing.public_key),
        region: Region::Europe, // TODO: detect from IP
        messages_relayed: 0,
        proofs_validated: 0,
        storage_mb: 0,
        mesh_minutes: 0,
        translations: 0,
        onboarded_users: 0,
        uptime_hours: 1,
        total_hours: 1,
        active_days: 30,
        slashed: false,
        contribution_score: 100, // Initial score
    };

    // Validator registry: starts with just this node, peers register when they connect
    let mut validators: Vec<Validator> = vec![my_validator.clone()];
    let my_address = wallet.address.clone();
    let my_signing_pk = dilithium::export_public_key(&wallet.signing.public_key);

    println!("  Validator registered: {} (score: {})", my_address, 100);
    println!();
    println!("  Node is running. Press Ctrl+C to stop.");
    println!("  -----------------------------------------");

    // Block production state
    let mut current_height = tip_height;
    let mut current_prev_hash = prev_hash;
    let mut current_mined_sparks = total_mined_sparks;
    let mut block_timer = tokio::time::interval(std::time::Duration::from_secs(
        speaq_chain::block::BLOCK_INTERVAL_SECS
    ));
    block_timer.tick().await; // Skip first immediate tick

    // Event loop: process P2P events + block production + Ctrl+C
    loop {
        tokio::select! {
            // Block production timer (every 30 seconds)
            _ = block_timer.tick() => {
                use speaq_chain::transaction::Transaction;

                let next_height = current_height + 1;
                let reward = calculate_block_reward(current_mined_sparks);

                if reward == 0 {
                    println!("  [SLOT {}] Max supply reached. No more rewards.", next_height);
                } else {
                    // Sort validators by pubkey so all nodes have same order
                    validators.sort_by(|a, b| a.signing_pubkey.0.cmp(&b.signing_pubkey.0));
                    // Determine who should produce this block
                    let producer_idx = select_block_producer(&validators, next_height, &current_prev_hash);

                    let is_my_turn = match producer_idx {
                        Some(idx) => validators[idx].signing_pubkey.0 == my_signing_pk.0,
                        None => validators.len() == 1, // Solo node fallback
                    };

                    if is_my_turn {
                        // I am the selected producer for this slot
                        let coinbase = Transaction::create_mining_reward(
                            wallet.address.0,
                            reward,
                            next_height,
                            &wallet,
                        );

                        let block = speaq_chain::block::Block::create(
                            current_prev_hash,
                            next_height,
                            vec![coinbase],
                            &wallet,
                            my_validator.contribution_score,
                        );

                        // Verify before storing
                        if !block.verify_signature() || !block.verify_merkle_root() {
                            println!("  [SLOT {}] Block FAILED verification -- NOT stored", next_height);
                            continue;
                        }

                        // Store in RocksDB
                        let block_hash = hex::encode(&block.hash()[..8]);
                        if let Err(e) = db.put_block(next_height, &block) {
                            println!("  [SLOT {}] Failed to store block: {}", next_height, e);
                            continue;
                        }
                        db.set_tip_height(next_height).ok();
                        current_mined_sparks += reward;
                        db.put_metadata("total_mined_sparks", &current_mined_sparks.to_le_bytes()).ok();

                        // Update state
                        current_prev_hash = block.hash();
                        current_height = next_height;
                        chain_height.store(next_height, Ordering::Relaxed);

                        let reward_qc = reward as f64 / 100_000_000.0;
                        let total_validators = validators.len();
                        println!("  [SLOT {}] PRODUCED block | hash={}... | reward={:.8} QC | validators={} | total={:.8} QC",
                            next_height, block_hash, reward_qc, total_validators,
                            current_mined_sparks as f64 / 100_000_000.0);

                        // Broadcast to peers
                        if peer_count.load(Ordering::Relaxed) > 0 {
                            if let Err(e) = speaq_chain::network::broadcast_block(&mut swarm, &block) {
                                println!("  [SLOT {}] Broadcast failed: {}", next_height, e);
                            }
                        }
                    } else {
                        // Not my turn -- waiting for block from selected producer
                        let producer_addr = producer_idx
                            .map(|i| validators[i].address.to_string_short())
                            .unwrap_or_else(|| "unknown".to_string());
                        println!("  [SLOT {}] Waiting for block from {}", next_height, producer_addr);
                    }
                }
            }
            event = swarm.select_next_some() => {
                match event {
                    SwarmEvent::NewListenAddr { address, .. } => {
                        println!("  [P2P] Listening on {}/p2p/{}", address, peer_id);
                    }
                    SwarmEvent::ConnectionEstablished { peer_id: pid, .. } => {
                        peer_count.fetch_add(1, Ordering::Relaxed);
                        println!("  [P2P] Connected to peer: {} (total: {})", pid, peer_count.load(Ordering::Relaxed));
                        // Announce ourselves as validator to the new peer
                        let announce = NetworkMessage::ValidatorAnnounce {
                            address: wallet.address.0,
                            signing_pubkey: my_signing_pk.0.clone(),
                            contribution_score: my_validator.contribution_score,
                        };
                        if let Ok(bytes) = bincode::serialize(&announce) {
                            let topic = libp2p::gossipsub::IdentTopic::new(speaq_chain::network::TOPIC_BLOCKS);
                            swarm.behaviour_mut().gossipsub.publish(topic, bytes).ok();
                        }
                    }
                    SwarmEvent::ConnectionClosed { peer_id: pid, .. } => {
                        peer_count.fetch_sub(1, Ordering::Relaxed);
                        println!("  [P2P] Disconnected from peer: {} (total: {})", pid, peer_count.load(Ordering::Relaxed));
                    }
                    SwarmEvent::Behaviour(speaq_chain::network::SpeaqBehaviourEvent::Gossipsub(
                        gossipsub::Event::Message { message, .. }
                    )) => {
                        // Decode incoming GossipSub message
                        if let Ok(net_msg) = bincode::deserialize::<NetworkMessage>(&message.data) {
                            match net_msg {
                                NetworkMessage::NewBlock(data) => {
                                    blocks_received.fetch_add(1, Ordering::Relaxed);
                                    // Deserialize and validate received block
                                    match speaq_chain::block::Block::from_bytes(&data) {
                                        Some(block) => {
                                            let bh = block.header.height;
                                            let bhash = hex::encode(&block.hash()[..8]);

                                            // Check height is next expected
                                            if bh != current_height + 1 {
                                                println!("  [P2P] Block {} rejected: expected height {}", bh, current_height + 1);
                                            }
                                            // Verify signatures (Dilithium + SPHINCS+)
                                            else if !block.verify_signature() {
                                                println!("  [P2P] Block {} rejected: invalid signature", bh);
                                            }
                                            // Verify merkle root
                                            else if !block.verify_merkle_root() {
                                                println!("  [P2P] Block {} rejected: invalid merkle root", bh);
                                            }
                                            // Verify links to our chain tip
                                            else if block.header.previous_hash != current_prev_hash {
                                                println!("  [P2P] Block {} rejected: previous hash mismatch", bh);
                                            }
                                            // All checks passed -- store it
                                            else {
                                                if let Err(e) = db.put_block(bh, &block) {
                                                    println!("  [P2P] Block {} store failed: {}", bh, e);
                                                } else {
                                                    db.set_tip_height(bh).ok();
                                                    // Track mined sparks from received blocks
                                                    let block_reward = calculate_block_reward(current_mined_sparks);
                                                    current_mined_sparks += block_reward;
                                                    db.put_metadata("total_mined_sparks", &current_mined_sparks.to_le_bytes()).ok();
                                                    current_prev_hash = block.hash();
                                                    current_height = bh;
                                                    chain_height.store(bh, Ordering::Relaxed);

                                                    // Register block producer as validator if not known
                                                    let producer_pk = block.header.validator_pubkey.clone();
                                                    if !validators.iter().any(|v| v.signing_pubkey.0 == producer_pk.0) {
                                                        // Derive address from signing public key
                                                        use sha2::{Sha256, Digest};
                                                        let mut hasher = Sha256::new();
                                                        hasher.update(&producer_pk.0);
                                                        let hash = hasher.finalize();
                                                        let mut addr_bytes = [0u8; 32];
                                                        addr_bytes.copy_from_slice(&hash);
                                                        let peer_validator = Validator {
                                                            address: speaq_chain::wallet::WalletAddress(addr_bytes),
                                                            signing_pubkey: producer_pk,
                                                            region: Region::Unknown,
                                                            messages_relayed: 0,
                                                            proofs_validated: 0,
                                                            storage_mb: 0,
                                                            mesh_minutes: 0,
                                                            translations: 0,
                                                            onboarded_users: 0,
                                                            uptime_hours: 1,
                                                            total_hours: 1,
                                                            active_days: 30,
                                                            slashed: false,
                                                            contribution_score: block.header.contribution_score,
                                                        };
                                                        validators.push(peer_validator);
                                                        println!("  [P2P] New validator registered (total: {})", validators.len());
                                                    }

                                                    println!("  [P2P] Block {} accepted | hash={}... | txs={} | validators={}",
                                                        bh, bhash, block.header.tx_count, validators.len());
                                                }
                                            }
                                        }
                                        None => {
                                            println!("  [P2P] Received invalid block data ({} bytes)", data.len());
                                        }
                                    }
                                }
                                NetworkMessage::NewTransaction(data) => {
                                    txs_received.fetch_add(1, Ordering::Relaxed);
                                    println!("  [P2P] Received transaction ({} bytes) -- queued", data.len());
                                }
                                NetworkMessage::ValidatorAnnounce { address, signing_pubkey, contribution_score } => {
                                    let pk = dilithium::PublicKeyBytes(signing_pubkey);
                                    if !validators.iter().any(|v| v.signing_pubkey.0 == pk.0) {
                                        let peer_validator = Validator {
                                            address: speaq_chain::wallet::WalletAddress(address),
                                            signing_pubkey: pk,
                                            region: Region::Unknown,
                                            messages_relayed: 0,
                                            proofs_validated: 0,
                                            storage_mb: 0,
                                            mesh_minutes: 0,
                                            translations: 0,
                                            onboarded_users: 0,
                                            uptime_hours: 1,
                                            total_hours: 1,
                                            active_days: 30,
                                            slashed: false,
                                            contribution_score,
                                        };
                                        validators.push(peer_validator);
                                        println!("  [P2P] Validator announced (total: {})", validators.len());
                                        // Re-announce ALL known validators so new peer learns about the network
                                        for v in &validators {
                                            let re_announce = NetworkMessage::ValidatorAnnounce {
                                                address: v.address.0,
                                                signing_pubkey: v.signing_pubkey.0.clone(),
                                                contribution_score: v.contribution_score,
                                            };
                                            if let Ok(bytes) = bincode::serialize(&re_announce) {
                                                let topic = libp2p::gossipsub::IdentTopic::new(speaq_chain::network::TOPIC_BLOCKS);
                                                swarm.behaviour_mut().gossipsub.publish(topic, bytes).ok();
                                            }
                                        }
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    _ => {}
                }
            }
            _ = tokio::signal::ctrl_c() => {
                println!("\n  Shutting down...");
                println!("  Chain height: {}", current_height);
                println!("  Total mined: {:.8} QC", current_mined_sparks as f64 / 100_000_000.0);
                println!("  Peers: {}", peer_count.load(Ordering::Relaxed));
                println!("  Blocks received: {}", blocks_received.load(Ordering::Relaxed));
                println!("  Transactions received: {}", txs_received.load(Ordering::Relaxed));
                // Update config with current chain height
                let mut cfg = load_config(data_dir).unwrap_or(NodeConfig {
                    initialized: true,
                    genesis_hash: config.genesis_hash.clone(),
                    chain_height: current_height,
                    p2p_port,
                    api_port,
                });
                cfg.chain_height = current_height;
                if let Ok(json) = serde_json::to_string_pretty(&cfg) {
                    std::fs::write(data_dir.join(NODE_CONFIG_FILE), json).ok();
                }
                break;
            }
        }
    }
}

// ============================================================================
// STATUS
// ============================================================================

pub async fn handle_status(data_dir: &Path) {
    let config = match load_config(data_dir) {
        Some(c) => c,
        None => {
            println!("  [ERROR] Node not initialized. Run: speaq-node init");
            return;
        }
    };

    let wallet = load_wallet(data_dir);

    println!();
    println!("  SPEAQ Chain Node - Status");
    println!("  -------------------------");
    println!("  Data directory:  {}", data_dir.display());
    println!("  Initialized:     {}", config.initialized);
    println!("  Chain height:    {}", config.chain_height);
    println!("  Genesis hash:    {}...", &config.genesis_hash[..16]);
    println!("  P2P port:        {}", config.p2p_port);
    println!("  API port:        {}", config.api_port);
    if let Some(w) = wallet {
        println!("  Wallet address:  {}", w.address);
    } else {
        println!("  Wallet:          not created");
    }
    println!();
}

// ============================================================================
// WALLET
// ============================================================================

pub async fn handle_wallet_create(data_dir: &Path, name: Option<String>) {
    let wallet_path = data_dir.join(WALLET_FILE);
    if wallet_path.exists() {
        println!("  [!] Wallet already exists at {}", wallet_path.display());
        println!("  [!] Address: {}", load_wallet(data_dir).map(|w| w.address.to_string_full()).unwrap_or_default());
        return;
    }

    // Create data directory if needed
    std::fs::create_dir_all(data_dir).ok();

    println!("  Generating quantum-resistant wallet...");
    let wallet = Wallet::generate();

    let wallet_data = serialize_wallet(&wallet);
    match serde_json::to_string_pretty(&wallet_data) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&wallet_path, json) {
                println!("  [ERROR] Failed to save wallet: {}", e);
                return;
            }
        }
        Err(e) => {
            println!("  [ERROR] Failed to serialize wallet: {}", e);
            return;
        }
    }

    println!();
    println!("  Wallet created successfully.");
    println!("  Address: {}", wallet.address.to_string_full());
    if let Some(n) = name {
        println!("  Name: {}", n);
    }
    println!("  Saved to: {}", wallet_path.display());
    println!();
    println!("  IMPORTANT: Back up {} - it contains your private keys.", wallet_path.display());
    println!();
}

pub async fn handle_wallet_balance(data_dir: &Path) {
    let wallet = match load_wallet(data_dir) {
        Some(w) => w,
        None => {
            println!("  [ERROR] No wallet found. Run: speaq-node wallet create");
            return;
        }
    };

    // TODO: Read actual balance from chain state
    println!();
    println!("  Wallet Balance");
    println!("  Address: {}", wallet.address);
    println!("  Balance: 0.00000000 QC");
    println!("  (Chain not synced - balance will update after node start)");
    println!();
}

pub async fn handle_wallet_address(data_dir: &Path) {
    let wallet = match load_wallet(data_dir) {
        Some(w) => w,
        None => {
            println!("  [ERROR] No wallet found. Run: speaq-node wallet create");
            return;
        }
    };

    println!("{}", wallet.address.to_string_full());
}

pub async fn handle_wallet_send(data_dir: &Path, to: &str, amount: f64) {
    let wallet = match load_wallet(data_dir) {
        Some(w) => w,
        None => {
            println!("  [ERROR] No wallet found. Run: speaq-node wallet create");
            return;
        }
    };

    // Validate recipient address
    if !to.starts_with("SQ1") {
        println!("  [ERROR] Invalid address. Must start with SQ1.");
        return;
    }

    if amount <= 0.0 {
        println!("  [ERROR] Amount must be positive.");
        return;
    }

    // TODO: Create and broadcast transaction when node is running
    println!();
    println!("  Send Q-Credits");
    println!("  From:   {}", wallet.address);
    println!("  To:     {}", to);
    println!("  Amount: {:.8} QC", amount);
    println!();
    println!("  [!] Transaction creation requires a running node.");
    println!("  [!] Start the node first: speaq-node start");
    println!();
}

// ============================================================================
// REST API
// ============================================================================

async fn start_api_server_with_state(
    addr: SocketAddr,
    data_dir: PathBuf,
    peer_id: String,
    genesis_hash: String,
    peer_count: std::sync::Arc<std::sync::atomic::AtomicUsize>,
    chain_height: std::sync::Arc<std::sync::atomic::AtomicU64>,
    blocks_received: std::sync::Arc<std::sync::atomic::AtomicU64>,
    txs_received: std::sync::Arc<std::sync::atomic::AtomicU64>,
) {
    use axum::{Router, Json, routing::{get, post}, http::StatusCode};
    use tower_http::cors::CorsLayer;
    use std::sync::atomic::Ordering;
    use std::sync::{Arc, Mutex};
    use speaq_chain::crypto::dilithium;
    use sha2::Digest;

    let data_dir_balance = data_dir.clone();

    let pc = peer_count.clone();
    let ch = chain_height.clone();
    let br = blocks_received.clone();
    let tr = txs_received.clone();
    let pid = peer_id.clone();
    let gh = genesis_hash.clone();

    // Shared mempool for pending transactions
    let mempool: Arc<Mutex<Vec<serde_json::Value>>> = Arc::new(Mutex::new(Vec::new()));
    let mempool_submit = mempool.clone();
    let mempool_list = mempool.clone();

    let app = Router::new()
        .route("/api/health", get(|| async {
            Json(serde_json::json!({ "status": "ok", "chain": "SPEAQ", "version": "1.0.0" }))
        }))
        .route("/api/status", get(move || async move {
            Json(serde_json::json!({
                "chain": "SPEAQ",
                "version": "1.0.0",
                "peer_id": pid,
                "genesis_hash": gh,
                "chain_height": ch.load(Ordering::Relaxed),
                "connected_peers": pc.load(Ordering::Relaxed),
                "blocks_received": br.load(Ordering::Relaxed),
                "txs_received": tr.load(Ordering::Relaxed),
            }))
        }))
        .route("/api/wallet/balance", get(move || async move {
            let wallet = load_wallet(&data_dir_balance);
            match wallet {
                Some(w) => Json(serde_json::json!({
                    "address": w.address.to_string_full(),
                    "balance": 0.0,
                    "balance_sparks": 0,
                })),
                None => Json(serde_json::json!({ "error": "no wallet" })),
            }
        }))
        .route("/api/mempool", get(move || async move {
            let pool = mempool_list.lock().unwrap();
            Json(serde_json::json!({ "pending": pool.len(), "transactions": *pool }))
        }))
        .route("/api/transaction", post(move |Json(body): Json<serde_json::Value>| async move {
            // Validate required fields
            let from = body.get("from").and_then(|v| v.as_str()).unwrap_or("");
            let to = body.get("to").and_then(|v| v.as_str()).unwrap_or("");
            let amount = body.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let public_key_hex = body.get("publicKey").and_then(|v| v.as_str()).unwrap_or("");
            let signature_hex = body.get("signature").and_then(|v| v.as_str()).unwrap_or("");
            let message_hex = body.get("message").and_then(|v| v.as_str()).unwrap_or("");

            // Basic validation
            if from.is_empty() || to.is_empty() || amount <= 0.0 || public_key_hex.is_empty() || signature_hex.is_empty() || message_hex.is_empty() {
                return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Missing required fields: from, to, amount, publicKey, signature, message" })));
            }

            if !from.starts_with("SQ1") || !to.starts_with("SQ1") {
                return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Addresses must start with SQ1" })));
            }

            // Verify ML-DSA-65 signature
            let pk_bytes = match hex::decode(public_key_hex) {
                Ok(b) if b.len() == dilithium::PUBLIC_KEY_SIZE => b,
                _ => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Invalid public key" }))),
            };
            let sig_bytes = match hex::decode(signature_hex) {
                Ok(b) if b.len() == dilithium::SIGNATURE_SIZE => b,
                _ => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Invalid signature" }))),
            };
            let msg_bytes = match hex::decode(message_hex) {
                Ok(b) => b,
                _ => return (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "error": "Invalid message" }))),
            };

            let mut pk_arr = [0u8; dilithium::PUBLIC_KEY_SIZE];
            pk_arr.copy_from_slice(&pk_bytes);
            let sig = dilithium::SignatureBytes(sig_bytes);

            if !dilithium::verify(&msg_bytes, &sig, &pk_arr) {
                return (StatusCode::FORBIDDEN, Json(serde_json::json!({ "error": "Invalid signature -- transaction rejected" })));
            }

            // Signature valid -- add to mempool
            let tx_id = hex::encode(&sha2::Sha256::digest(msg_bytes.as_slice())[..16]);
            let tx = serde_json::json!({
                "id": tx_id,
                "from": from,
                "to": to,
                "amount": amount,
                "publicKey": public_key_hex,
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "status": "pending",
            });

            {
                let mut pool = mempool_submit.lock().unwrap();
                pool.push(tx.clone());
                println!("  [TX] Accepted: {} -> {} | {:.8} QC | sig verified | mempool={}", from, to, amount, pool.len());
            }

            (StatusCode::OK, Json(serde_json::json!({ "status": "accepted", "txId": tx_id, "message": "Transaction verified and added to mempool" })))
        }))
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.ok();
}

// ============================================================================
// HELPERS
// ============================================================================

fn load_config(data_dir: &Path) -> Option<NodeConfig> {
    let path = data_dir.join(NODE_CONFIG_FILE);
    let json = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&json).ok()
}

fn load_wallet(data_dir: &Path) -> Option<Wallet> {
    let path = data_dir.join(WALLET_FILE);
    let json = std::fs::read_to_string(path).ok()?;
    let data: WalletData = serde_json::from_str(&json).ok()?;
    deserialize_wallet(&data)
}

fn serialize_wallet(wallet: &Wallet) -> WalletData {
    use speaq_chain::crypto::{dilithium, kyber, sphincs};

    WalletData {
        address: wallet.address.to_string_full(),
        signing_pk: hex::encode(&dilithium::export_public_key(&wallet.signing.public_key).0),
        signing_sk: hex::encode(&wallet.signing.secret_key),
        sphincs_pk: hex::encode(&sphincs::export_public_key(&wallet.sphincs.public_key).0),
        sphincs_sk: hex::encode(SignSecretKey::as_bytes(&wallet.sphincs.secret_key)),
        kem_pk: hex::encode(&kyber::export_public_key(&wallet.kem.public_key).0),
        kem_sk: hex::encode(KemSecretKey::as_bytes(&wallet.kem.secret_key)),
        created_at: wallet.created_at,
    }
}

fn deserialize_wallet(data: &WalletData) -> Option<Wallet> {
    use pqcrypto_sphincsplus::sphincsshake256fsimple as sphincs_lib;
    use pqcrypto_kyber::kyber768;
    use pqcrypto_traits::sign::PublicKey as SignPubTrait;
    use pqcrypto_traits::kem::PublicKey as KemPubTrait;
    use speaq_chain::crypto::{dilithium, kyber, sphincs};
    use speaq_chain::wallet::WalletAddress;

    // Decode hex to bytes
    let signing_pk_bytes = hex::decode(&data.signing_pk).ok()?;
    let signing_sk_bytes = hex::decode(&data.signing_sk).ok()?;
    let sphincs_pk_bytes = hex::decode(&data.sphincs_pk).ok()?;
    let sphincs_sk_bytes = hex::decode(&data.sphincs_sk).ok()?;
    let kem_pk_bytes = hex::decode(&data.kem_pk).ok()?;
    let kem_sk_bytes = hex::decode(&data.kem_sk).ok()?;

    // Reconstruct ML-DSA-65 keys from bytes
    if signing_pk_bytes.len() != dilithium::PUBLIC_KEY_SIZE { return None; }
    if signing_sk_bytes.len() != dilithium::SECRET_KEY_SIZE { return None; }
    let mut signing_pk = [0u8; dilithium::PUBLIC_KEY_SIZE];
    signing_pk.copy_from_slice(&signing_pk_bytes);
    let mut signing_sk = [0u8; dilithium::SECRET_KEY_SIZE];
    signing_sk.copy_from_slice(&signing_sk_bytes);

    // Reconstruct SPHINCS+ and Kyber keys
    let sphincs_pk = sphincs_lib::PublicKey::from_bytes(&sphincs_pk_bytes).ok()?;
    let sphincs_sk = sphincs_lib::SecretKey::from_bytes(&sphincs_sk_bytes).ok()?;
    let kem_pk = kyber768::PublicKey::from_bytes(&kem_pk_bytes).ok()?;
    let kem_sk = kyber768::SecretKey::from_bytes(&kem_sk_bytes).ok()?;

    let address = WalletAddress::from_string(&data.address)?;

    Some(Wallet {
        signing: dilithium::SigningKeyPair {
            public_key: signing_pk,
            secret_key: signing_sk,
        },
        sphincs: sphincs::SphincsKeyPair {
            public_key: sphincs_pk,
            secret_key: sphincs_sk,
        },
        kem: kyber::KemKeyPair {
            public_key: kem_pk,
            secret_key: kem_sk,
        },
        address,
        created_at: data.created_at,
    })
}
