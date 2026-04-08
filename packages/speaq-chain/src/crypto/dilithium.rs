//! ML-DSA-65 Post-Quantum Digital Signatures (FIPS 204)
//!
//! Used for signing ALL transactions on the SPEAQ Chain.
//! Quantum-resistant: secure against both classical and quantum computers.
//! Cross-compatible with @noble/post-quantum JavaScript library.
//!
//! Library: fips204 (pure Rust, NIST FIPS 204 final standard)

use fips204::ml_dsa_65;
use fips204::traits::{SerDes, Signer, Verifier};
use serde::{Deserialize, Serialize};

/// ML-DSA-65 key sizes (FIPS 204)
pub const PUBLIC_KEY_SIZE: usize = 1952;
pub const SECRET_KEY_SIZE: usize = 4032;
pub const SIGNATURE_SIZE: usize = 3309;

/// A ML-DSA-65 signing keypair
#[derive(Clone)]
pub struct SigningKeyPair {
    pub public_key: [u8; PUBLIC_KEY_SIZE],
    pub secret_key: [u8; SECRET_KEY_SIZE],
}

/// Serializable public key (for storage and transmission)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicKeyBytes(pub Vec<u8>);

/// Serializable signature
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignatureBytes(pub Vec<u8>);

/// Generate a new ML-DSA-65 signing keypair (FIPS 204)
pub fn generate_keypair() -> SigningKeyPair {
    let (pk, sk) = ml_dsa_65::try_keygen().expect("ML-DSA-65 keygen failed");
    SigningKeyPair {
        public_key: pk.into_bytes(),
        secret_key: sk.into_bytes(),
    }
}

/// Sign a message with ML-DSA-65
pub fn sign(message: &[u8], secret_key: &[u8; SECRET_KEY_SIZE]) -> SignatureBytes {
    let sk = ml_dsa_65::PrivateKey::try_from_bytes(*secret_key)
        .expect("Invalid ML-DSA-65 secret key");
    let sig = sk.try_sign(message, b"").expect("ML-DSA-65 signing failed");
    SignatureBytes(sig.to_vec())
}

/// Verify a ML-DSA-65 signature
pub fn verify(
    message: &[u8],
    signature: &SignatureBytes,
    public_key: &[u8; PUBLIC_KEY_SIZE],
) -> bool {
    let pk = match ml_dsa_65::PublicKey::try_from_bytes(*public_key) {
        Ok(k) => k,
        Err(_) => return false,
    };
    if signature.0.len() != SIGNATURE_SIZE {
        return false;
    }
    let mut sig_array = [0u8; SIGNATURE_SIZE];
    sig_array.copy_from_slice(&signature.0);
    pk.verify(message, &sig_array, b"")
}

/// Export public key to bytes
pub fn export_public_key(pk: &[u8; PUBLIC_KEY_SIZE]) -> PublicKeyBytes {
    PublicKeyBytes(pk.to_vec())
}

/// Import public key from bytes
pub fn import_public_key(bytes: &PublicKeyBytes) -> Option<[u8; PUBLIC_KEY_SIZE]> {
    if bytes.0.len() != PUBLIC_KEY_SIZE {
        return None;
    }
    let mut arr = [0u8; PUBLIC_KEY_SIZE];
    arr.copy_from_slice(&bytes.0);
    // Verify it's a valid key
    ml_dsa_65::PublicKey::try_from_bytes(arr).ok()?;
    Some(arr)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keygen() {
        let kp = generate_keypair();
        let pk_bytes = export_public_key(&kp.public_key);
        assert_eq!(pk_bytes.0.len(), PUBLIC_KEY_SIZE);
        println!("ML-DSA-65 public key size: {} bytes", pk_bytes.0.len());
    }

    #[test]
    fn test_sign_and_verify() {
        let kp = generate_keypair();
        let message = b"SPEAQ Chain transaction: send 1.5 QC";

        let signature = sign(message, &kp.secret_key);
        assert_eq!(signature.0.len(), SIGNATURE_SIZE);
        println!("ML-DSA-65 signature size: {} bytes", signature.0.len());

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
