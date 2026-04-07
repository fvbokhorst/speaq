//! SPEAQ Node - Command handlers for the CLI
//!
//! Each handler corresponds to a CLI subcommand.
//! Data directory: ~/.speaq/ (configurable)
//! P2P port: 9333, REST API port: 9334

use std::path::{Path, PathBuf};
use std::net::SocketAddr;
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
    println!("  \"Van en voor de people.\"");
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

    // Create genesis block
    println!("  [4/4] Creating genesis block...");
    let genesis = create_genesis_block(&wallet);
    let genesis_hash = hex::encode(genesis.hash());
    println!("         Genesis hash: {}", genesis_hash);
    println!("         Motto: \"Van en voor de people.\"");
    println!("         Transactions: {}", genesis.header.tx_count);

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
// START
// ============================================================================

pub async fn handle_start(data_dir: &Path, p2p_port: u16, api_port: u16, peers: Vec<String>) {
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
    println!("  \"Van en voor de people.\"");
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
            println!("  [ERROR] No wallet found. Run: speaq-node wallet create");
            return;
        }
    };
    println!("  Wallet: {}", wallet.address);

    // Start REST API server
    let api_addr: SocketAddr = ([0, 0, 0, 0], api_port).into();
    let _api_handle = tokio::spawn(start_api_server(api_addr, data_dir.to_path_buf()));
    println!("  REST API listening on http://0.0.0.0:{}", api_port);

    println!();
    println!("  Node is running. Press Ctrl+C to stop.");
    println!();

    // Keep running until Ctrl+C
    tokio::signal::ctrl_c().await.ok();
    println!("\n  Shutting down...");
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

async fn start_api_server(addr: SocketAddr, data_dir: PathBuf) {
    use axum::{Router, Json, routing::get};
    use tower_http::cors::CorsLayer;

    let data_dir_status = data_dir.clone();
    let data_dir_balance = data_dir.clone();

    let app = Router::new()
        .route("/api/health", get(|| async {
            Json(serde_json::json!({ "status": "ok", "chain": "SPEAQ", "version": "1.0.0" }))
        }))
        .route("/api/status", get(move || async move {
            let config = load_config(&data_dir_status);
            match config {
                Some(c) => Json(serde_json::json!({
                    "initialized": c.initialized,
                    "chain_height": c.chain_height,
                    "genesis_hash": c.genesis_hash,
                    "p2p_port": c.p2p_port,
                    "api_port": c.api_port,
                })),
                None => Json(serde_json::json!({ "error": "not initialized" })),
            }
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
        signing_sk: hex::encode(SignSecretKey::as_bytes(&wallet.signing.secret_key)),
        sphincs_pk: hex::encode(&sphincs::export_public_key(&wallet.sphincs.public_key).0),
        sphincs_sk: hex::encode(SignSecretKey::as_bytes(&wallet.sphincs.secret_key)),
        kem_pk: hex::encode(&kyber::export_public_key(&wallet.kem.public_key).0),
        kem_sk: hex::encode(KemSecretKey::as_bytes(&wallet.kem.secret_key)),
        created_at: wallet.created_at,
    }
}

fn deserialize_wallet(_data: &WalletData) -> Option<Wallet> {
    // TODO: Implement full key deserialization from hex
    // Full implementation requires pqcrypto key import functions
    // For now, wallet is regenerated on each load -- keys are saved for backup
    None
}
