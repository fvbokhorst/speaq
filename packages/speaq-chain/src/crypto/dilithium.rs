//! Dilithium-3 Post-Quantum Digital Signatures (FIPS 204 / ML-DSA-65)
//!
//! Used for signing ALL transactions on the SPEAQ Chain.
//! Quantum-resistant: secure against both classical and quantum computers.
//!
//! Library: pqcrypto-dilithium (NIST reference implementation wrapper)

use pqcrypto_dilithium::dilithium3;
use pqcrypto_traits::sign::{PublicKey, SecretKey, SignedMessage, DetachedSignature};
use serde::{Deserialize, Serialize};

/// A Dilithium-3 signing keypair
#[derive(Clone)]
pub struct SigningKeyPair {
    pub public_key: dilithium3::PublicKey,
    pub secret_key: dilithium3::SecretKey,
}

/// Serializable public key (for storage and transmission)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicKeyBytes(pub Vec<u8>);

/// Serializable signature
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignatureBytes(pub Vec<u8>);

/// Generate a new Dilithium-3 signing keypair
pub fn generate_keypair() -> SigningKeyPair {
    let (pk, sk) = dilithium3::keypair();
    SigningKeyPair {
        public_key: pk,
        secret_key: sk,
    }
}

/// Sign a message with Dilithium-3
pub fn sign(message: &[u8], secret_key: &dilithium3::SecretKey) -> SignatureBytes {
    let sig = dilithium3::detached_sign(message, secret_key);
    SignatureBytes(sig.as_bytes().to_vec())
}

/// Verify a Dilithium-3 signature
pub fn verify(
    message: &[u8],
    signature: &SignatureBytes,
    public_key: &dilithium3::PublicKey,
) -> bool {
    let sig = match dilithium3::DetachedSignature::from_bytes(&signature.0) {
        Ok(s) => s,
        Err(_) => return false,
    };
    dilithium3::verify_detached_signature(&sig, message, public_key).is_ok()
}

/// Export public key to bytes
pub fn export_public_key(pk: &dilithium3::PublicKey) -> PublicKeyBytes {
    PublicKeyBytes(pk.as_bytes().to_vec())
}

/// Import public key from bytes
pub fn import_public_key(bytes: &PublicKeyBytes) -> Option<dilithium3::PublicKey> {
    dilithium3::PublicKey::from_bytes(&bytes.0).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keygen() {
        let kp = generate_keypair();
        let pk_bytes = export_public_key(&kp.public_key);
        assert!(!pk_bytes.0.is_empty());
        println!("Dilithium-3 public key size: {} bytes", pk_bytes.0.len());
    }

    #[test]
    fn test_sign_and_verify() {
        let kp = generate_keypair();
        let message = b"SPEAQ Chain transaction: send 1.5 QC";

        let signature = sign(message, &kp.secret_key);
        assert!(!signature.0.is_empty());
        println!("Dilithium-3 signature size: {} bytes", signature.0.len());

        // Valid signature should verify
        assert!(verify(message, &signature, &kp.public_key));

        // Wrong message should NOT verify
        assert!(!verify(b"tampered message", &signature, &kp.public_key));

        // Wrong key should NOT verify
        let other_kp = generate_keypair();
        assert!(!verify(message, &signature, &other_kp.public_key));
    }

    #[test]
    fn test_export_import_public_key() {
        let kp = generate_keypair();
        let exported = export_public_key(&kp.public_key);
        let imported = import_public_key(&exported).expect("Import should succeed");

        // Sign with original, verify with imported
        let message = b"key round-trip test";
        let signature = sign(message, &kp.secret_key);
        assert!(verify(message, &signature, &imported));
    }
}
