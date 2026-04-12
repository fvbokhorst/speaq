//! SPEAQ Wallet Address Generation
//!
//! Address = SHA-256(dilithium_public_key || kyber_public_key)
//! Displayed as: SQ1 + hex (e.g., SQ1a3b4c5d6e7f...)
//!
//! SQ1 prefix identifies SPEAQ Chain addresses (like BTC's bc1)

use crate::crypto::{dilithium, kyber, sphincs};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// A SPEAQ wallet address (32 bytes, displayed as SQ1 + hex)
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct WalletAddress(pub [u8; 32]);

impl WalletAddress {
    /// Display as SQ1 + first 20 bytes hex (40 chars)
    pub fn to_string_short(&self) -> String {
        format!("SQ1{}", hex::encode(&self.0[..20]))
    }

    /// Display as SQ1 + full 32 bytes hex (64 chars)
    pub fn to_string_full(&self) -> String {
        format!("SQ1{}", hex::encode(&self.0))
    }

    /// Parse from SQ1 hex string
    pub fn from_string(s: &str) -> Option<Self> {
        if !s.starts_with("SQ1") {
            return None;
        }
        let hex_str = &s[3..];
        let bytes = hex::decode(hex_str).ok()?;
        if bytes.len() != 32 {
            return None;
        }
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&bytes);
        Some(WalletAddress(arr))
    }
}

impl std::fmt::Display for WalletAddress {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.to_string_short())
    }
}

/// A complete SPEAQ wallet
#[derive(Clone)]
pub struct Wallet {
    /// Dilithium-3 signing keypair (primary, for signing transactions)
    pub signing: dilithium::SigningKeyPair,
    /// SPHINCS+ signing keypair (backup, for dual signing blocks)
    pub sphincs: sphincs::SphincsKeyPair,
    /// Kyber-768 KEM keypair (for receiving stealth payments)
    pub kem: kyber::KemKeyPair,
    /// Derived wallet address
    pub address: WalletAddress,
    /// Creation timestamp (Unix seconds)
    pub created_at: u64,
}

impl Wallet {
    /// Generate a new wallet with fresh quantum-resistant keypairs
    pub fn generate() -> Self {
        let signing = dilithium::generate_keypair();
        let sphincs_kp = sphincs::generate_keypair();
        let kem = kyber::generate_keypair();
        let address = Self::derive_address(&signing, &kem);
        let created_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        Wallet {
            signing,
            sphincs: sphincs_kp,
            kem,
            address,
            created_at,
        }
    }

    /// Derive address from public keys: SHA-256(signing_pk || kem_pk)
    fn derive_address(
        signing: &dilithium::SigningKeyPair,
        kem: &kyber::KemKeyPair,
    ) -> WalletAddress {
        let sign_pk_bytes = dilithium::export_public_key(&signing.public_key);
        let kem_pk_bytes = kyber::export_public_key(&kem.public_key);

        let mut hasher = Sha256::new();
        hasher.update(&sign_pk_bytes.0);
        hasher.update(&kem_pk_bytes.0);
        let result = hasher.finalize();

        let mut addr = [0u8; 32];
        addr.copy_from_slice(&result);
        WalletAddress(addr)
    }

    /// Sign data with this wallet's Dilithium-3 key
    pub fn sign(&self, data: &[u8]) -> dilithium::SignatureBytes {
        dilithium::sign(data, &self.signing.secret_key)
    }

    /// Verify a signature against this wallet's public key
    pub fn verify(&self, data: &[u8], signature: &dilithium::SignatureBytes) -> bool {
        dilithium::verify(data, signature, &self.signing.public_key)
    }

    /// Export public keys for sharing (wallet address card)
    pub fn export_public_info(&self) -> WalletPublicInfo {
        WalletPublicInfo {
            address: self.address.clone(),
            signing_public_key: dilithium::export_public_key(&self.signing.public_key),
            kem_public_key: kyber::export_public_key(&self.kem.public_key),
            created_at: self.created_at,
        }
    }
}

/// Public information that can be shared (no private keys)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletPublicInfo {
    pub address: WalletAddress,
    pub signing_public_key: dilithium::PublicKeyBytes,
    pub kem_public_key: kyber::KemPublicKeyBytes,
    pub created_at: u64,
}

impl WalletPublicInfo {
    /// Verify that the address matches the public keys
    pub fn verify_address(&self) -> bool {
        let mut hasher = Sha256::new();
        hasher.update(&self.signing_public_key.0);
        hasher.update(&self.kem_public_key.0);
        let result = hasher.finalize();

        let mut expected = [0u8; 32];
        expected.copy_from_slice(&result);
        self.address.0 == expected
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wallet_generation() {
        let wallet = Wallet::generate();
        println!("Wallet address: {}", wallet.address);
        println!("Full address: {}", wallet.address.to_string_full());
        assert!(wallet.address.to_string_short().starts_with("SQ1"));
        assert_eq!(wallet.address.to_string_short().len(), 3 + 40); // SQ1 + 40 hex chars
    }

    #[test]
    fn test_unique_addresses() {
        let w1 = Wallet::generate();
        let w2 = Wallet::generate();
        assert_ne!(w1.address, w2.address, "Two wallets must have different addresses");
    }

    #[test]
    fn test_sign_and_verify() {
        let wallet = Wallet::generate();
        let data = b"send 1.5 QC to SQ1abc123";

        let sig = wallet.sign(data);
        assert!(wallet.verify(data, &sig), "Signature must verify");
        assert!(!wallet.verify(b"tampered", &sig), "Tampered data must NOT verify");
    }

    #[test]
    fn test_cross_wallet_rejection() {
        let alice = Wallet::generate();
        let bob = Wallet::generate();
        let data = b"send 1.5 QC";

        let sig = alice.sign(data);
        assert!(alice.verify(data, &sig), "Alice's sig verifies with Alice's key");
        assert!(!bob.verify(data, &sig), "Alice's sig must NOT verify with Bob's key");
    }

    #[test]
    fn test_public_info_export() {
        let wallet = Wallet::generate();
        let info = wallet.export_public_info();

        assert!(info.verify_address(), "Exported address must match public keys");
        assert_eq!(info.address, wallet.address);
    }

    #[test]
    fn test_address_parse_roundtrip() {
        let wallet = Wallet::generate();
        let full_str = wallet.address.to_string_full();
        let parsed = WalletAddress::from_string(&full_str).expect("Should parse");
        assert_eq!(parsed, wallet.address);
    }

    #[test]
    fn test_address_format() {
        let wallet = Wallet::generate();
        let addr = wallet.address.to_string_short();
        assert!(addr.starts_with("SQ1"), "Address must start with SQ1");
        println!("Example SPEAQ address: {}", addr);
    }

    #[test]
    fn test_kem_key_exchange() {
        let alice = Wallet::generate();

        // Bob encapsulates with Alice's public KEM key
        let (ct, bob_secret) = kyber::encapsulate(&alice.kem.public_key);

        // Alice decapsulates with her private KEM key
        let alice_secret = kyber::decapsulate(&ct, &alice.kem.secret_key)
            .expect("Decapsulation should succeed");

        // Shared secrets must match (for stealth address derivation)
        assert_eq!(alice_secret.0, bob_secret.0, "Shared secrets must match");
    }
}
