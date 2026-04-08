//! SPEAQ Chain Node
//! Quantum-resistant blockchain node with CLI interface.
//! "By the people, for the people."

use clap::{Parser, Subcommand};
use std::path::PathBuf;
use tracing_subscriber;

mod node;

/// SPEAQ Chain - Quantum-Resistant Blockchain Node
#[derive(Parser)]
#[command(name = "speaq-node")]
#[command(version = "1.0.0")]
#[command(about = "SPEAQ Chain node - quantum-resistant blockchain")]
struct Cli {
    /// Data directory (default: ~/.speaq/)
    #[arg(long, default_value_os_t = default_data_dir())]
    data_dir: PathBuf,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize a new network (creates genesis block)
    Init,

    /// Join an existing network (copies genesis from another node)
    Join {
        /// Data directory of the node to copy genesis from
        #[arg(long)]
        genesis_from: PathBuf,
    },

    /// Start the node (P2P + REST API)
    Start {
        /// P2P listen port
        #[arg(long, default_value_t = 9333)]
        p2p_port: u16,

        /// REST API listen port
        #[arg(long, default_value_t = 9334)]
        api_port: u16,

        /// API-only mode (no P2P, for Cloud Run)
        #[arg(long, default_value_t = false)]
        api_only: bool,

        /// Bootstrap peer addresses (multiaddr format)
        #[arg(long)]
        peers: Vec<String>,
    },

    /// Show node status (chain height, peers, wallet)
    Status,

    /// Wallet operations
    Wallet {
        #[command(subcommand)]
        action: WalletCommands,
    },
}

#[derive(Subcommand)]
enum WalletCommands {
    /// Create a new wallet
    Create {
        /// Display name for this wallet
        #[arg(long)]
        name: Option<String>,
    },

    /// Show wallet balance
    Balance,

    /// Show wallet address
    Address,

    /// Send Q-Credits
    Send {
        /// Recipient address (SQ1...)
        #[arg(long)]
        to: String,

        /// Amount in QC
        #[arg(long)]
        amount: f64,
    },
}

fn default_data_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".speaq")
}

#[tokio::main]
async fn main() {
    // Initialize logging
    tracing_subscriber::fmt::init();

    let cli = Cli::parse();

    match cli.command {
        Commands::Init => {
            node::handle_init(&cli.data_dir).await;
        }
        Commands::Join { genesis_from } => {
            node::handle_join(&cli.data_dir, &genesis_from).await;
        }
        Commands::Start { p2p_port, api_port, api_only, peers } => {
            if api_only {
                node::handle_start_api_only(&cli.data_dir, api_port).await;
            } else {
                node::handle_start(&cli.data_dir, p2p_port, api_port, peers).await;
            }
        }
        Commands::Status => {
            node::handle_status(&cli.data_dir).await;
        }
        Commands::Wallet { action } => {
            match action {
                WalletCommands::Create { name } => {
                    node::handle_wallet_create(&cli.data_dir, name).await;
                }
                WalletCommands::Balance => {
                    node::handle_wallet_balance(&cli.data_dir).await;
                }
                WalletCommands::Address => {
                    node::handle_wallet_address(&cli.data_dir).await;
                }
                WalletCommands::Send { to, amount } => {
                    node::handle_wallet_send(&cli.data_dir, &to, amount).await;
                }
            }
        }
    }
}
