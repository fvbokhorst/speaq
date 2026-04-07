//! SPHINCS+ Post-Quantum Hash-Based Signatures (FIPS 205 / SLH-DSA)
//!
//! Backup signature scheme for blocks. If Dilithium is ever broken,
//! SPHINCS+ provides a completely independent second signature.
//! Hash-based = mathematically impossible to break (relies only on hash functions).
//!
//! Library: pqcrypto-sphincsplus (NIST FIPS 205 reference implementation)

use pqcrypto_sphincsplus::sphincsshake256fsimple as sphincs;
use pqcrypto_traits::sign::{PublicKey, SecretKey, DetachedSignature};
use serde::{Deserialize, Serialize};

#[derive(Clone)]
pub struct SphincsKeyPair {
    pub public_key: sphincs::PublicKey,
    pub secret_key: sphincs::SecretKey,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SphincsPublicKeyBytes(pub Vec<u8>);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SphincsSignatureBytes(pub Vec<u8>);

pub fn generate_keypair() -> SphincsKeyPair {
    let (pk, sk) = sphincs::keypair();
    SphincsKeyPair {
        public_key: pk,
        secret_key: sk,
    }
}

pub fn sign(message: &[u8], secret_key: &sphincs::SecretKey) -> SphincsSignatureBytes {
    let sig = sphincs::detached_sign(message, secret_key);
    SphincsSignatureBytes(sig.as_bytes().to_vec())
}

pub fn verify(
    message: &[u8],
    signature: &SphincsSignatureBytes,
    public_key: &sphincs::PublicKey,
) -> bool {
    let sig = match sphincs::DetachedSignature::from_bytes(&signature.0) {
        Ok(s) => s,
        Err(_) => return false,
    };
    sphincs::verify_detached_signature(&sig, message, public_key).is_ok()
}

pub fn export_public_key(pk: &sphincs::PublicKey) -> SphincsPublicKeyBytes {
    SphincsPublicKeyBytes(pk.as_bytes().to_vec())
}

pub fn import_public_key(bytes: &SphincsPublicKeyBytes) -> Option<sphincs::PublicKey> {
    sphincs::PublicKey::from_bytes(&bytes.0).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sphincs_keygen() {
        let kp = generate_keypair();
        let pk_bytes = export_public_key(&kp.public_key);
        assert!(!pk_bytes.0.is_empty());
        println!("SPHINCS+ public key size: {} bytes", pk_bytes.0.len());
    }

    #[test]
    fn test_sphincs_sign_and_verify() {
        let kp = generate_keypair();
        let message = b"SPEAQ block header backup signature";
        let sig = sign(message, &kp.secret_key);
        println!("SPHINCS+ signature size: {} bytes", sig.0.len());

        assert!(verify(message, &sig, &kp.public_key));
        assert!(!verify(b"tampered", &sig, &kp.public_key));

        let other = generate_keypair();
        assert!(!verify(message, &sig, &other.public_key));
    }
}
