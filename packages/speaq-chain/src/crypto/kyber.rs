//! Kyber-768 Post-Quantum Key Encapsulation (FIPS 203 / ML-KEM-768)
//!
//! Used for wallet address generation and key exchange.
//! Quantum-resistant: secure against both classical and quantum computers.
//!
//! Library: pqcrypto-kyber (NIST reference implementation wrapper)

use pqcrypto_kyber::kyber768;
use pqcrypto_traits::kem::{PublicKey, SecretKey, Ciphertext, SharedSecret};
use serde::{Deserialize, Serialize};

/// A Kyber-768 key encapsulation keypair
#[derive(Clone)]
pub struct KemKeyPair {
    pub public_key: kyber768::PublicKey,
    pub secret_key: kyber768::SecretKey,
}

/// Serializable public key
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KemPublicKeyBytes(pub Vec<u8>);

/// Serializable ciphertext
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KemCiphertextBytes(pub Vec<u8>);

/// Serializable shared secret
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KemSharedSecretBytes(pub Vec<u8>);

/// Generate a new Kyber-768 KEM keypair
pub fn generate_keypair() -> KemKeyPair {
    let (pk, sk) = kyber768::keypair();
    KemKeyPair {
        public_key: pk,
        secret_key: sk,
    }
}

/// Encapsulate: create a shared secret using recipient's public key
/// Returns (ciphertext, shared_secret)
pub fn encapsulate(
    public_key: &kyber768::PublicKey,
) -> (KemCiphertextBytes, KemSharedSecretBytes) {
    let (ss, ct) = kyber768::encapsulate(&public_key);
    (
        KemCiphertextBytes(ct.as_bytes().to_vec()),
        KemSharedSecretBytes(ss.as_bytes().to_vec()),
    )
}

/// Decapsulate: recover shared secret using own secret key
pub fn decapsulate(
    ciphertext: &KemCiphertextBytes,
    secret_key: &kyber768::SecretKey,
) -> Option<KemSharedSecretBytes> {
    let ct = kyber768::Ciphertext::from_bytes(&ciphertext.0).ok()?;
    let ss = kyber768::decapsulate(&ct, secret_key);
    Some(KemSharedSecretBytes(ss.as_bytes().to_vec()))
}

/// Export public key to bytes
pub fn export_public_key(pk: &kyber768::PublicKey) -> KemPublicKeyBytes {
    KemPublicKeyBytes(pk.as_bytes().to_vec())
}

/// Import public key from bytes
pub fn import_public_key(bytes: &KemPublicKeyBytes) -> Option<kyber768::PublicKey> {
    kyber768::PublicKey::from_bytes(&bytes.0).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keygen() {
        let kp = generate_keypair();
        let pk_bytes = export_public_key(&kp.public_key);
        assert!(!pk_bytes.0.is_empty());
        println!("Kyber-768 public key size: {} bytes", pk_bytes.0.len());
    }

    #[test]
    fn test_encapsulate_decapsulate() {
        let alice = generate_keypair();

        // Bob encapsulates with Alice's public key
        let (ciphertext, bob_secret) = encapsulate(&alice.public_key);
        assert!(!ciphertext.0.is_empty());
        assert!(!bob_secret.0.is_empty());
        println!("Kyber-768 ciphertext size: {} bytes", ciphertext.0.len());
        println!("Kyber-768 shared secret size: {} bytes", bob_secret.0.len());

        // Alice decapsulates with her secret key
        let alice_secret = decapsulate(&ciphertext, &alice.secret_key)
            .expect("Decapsulation should succeed");

        // Shared secrets MUST match
        assert_eq!(
            alice_secret.0, bob_secret.0,
            "Shared secrets must be identical"
        );
    }

    #[test]
    fn test_wrong_key_fails() {
        let alice = generate_keypair();
        let eve = generate_keypair();

        // Bob encapsulates with Alice's public key
        let (ciphertext, bob_secret) = encapsulate(&alice.public_key);

        // Eve tries to decapsulate with her own key -- must get DIFFERENT secret
        let eve_secret = decapsulate(&ciphertext, &eve.secret_key)
            .expect("Decapsulation succeeds but with wrong secret");

        assert_ne!(
            eve_secret.0, bob_secret.0,
            "Eve must NOT get the same shared secret"
        );
    }

    #[test]
    fn test_export_import_roundtrip() {
        let kp = generate_keypair();
        let exported = export_public_key(&kp.public_key);
        let imported = import_public_key(&exported).expect("Import should succeed");

        // Encapsulate with imported key, decapsulate with original
        let (ct, bob_ss) = encapsulate(&imported);
        let alice_ss = decapsulate(&ct, &kp.secret_key).expect("Should work");
        assert_eq!(alice_ss.0, bob_ss.0);
    }
}
