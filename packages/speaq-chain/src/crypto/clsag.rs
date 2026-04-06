//! CLSAG Ring Signatures -- Hide Transaction Sender
//!
//! Compact Linkable Spontaneous Anonymous Group signature.
//! Used by Monero for transaction privacy.
//!
//! Properties:
//! - ANONYMITY: the real signer is hidden among 11 ring members
//! - LINKABILITY: key images prevent double-spending
//! - UNFORGEABILITY: only the real key holder can create a valid signature
//!
//! The signer proves they own ONE of the 11 keys without revealing WHICH one.
//!
//! Library: curve25519-dalek for elliptic curve operations

use curve25519_dalek::constants::RISTRETTO_BASEPOINT_POINT as G;
use curve25519_dalek::ristretto::{CompressedRistretto, RistrettoPoint};
use curve25519_dalek::scalar::Scalar;
use sha2::{Digest, Sha256, Sha512};
use serde::{Deserialize, Serialize};

/// Ring size (number of decoy keys + 1 real key)
pub const RING_SIZE: usize = 11;

/// A CLSAG ring signature
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RingSignature {
    /// Challenge seed
    pub c: [u8; 32],
    /// Response scalars (one per ring member)
    pub s: Vec<[u8; 32]>,
    /// Key image (links to the real key, prevents double-spend)
    pub key_image: [u8; 32],
}

/// Hash to a curve point (domain-separated)
fn hash_to_point(data: &[u8]) -> RistrettoPoint {
    RistrettoPoint::hash_from_bytes::<Sha512>(data)
}

/// Hash multiple inputs to a scalar
fn hash_to_scalar(inputs: &[&[u8]]) -> Scalar {
    let mut hasher = Sha256::new();
    hasher.update(b"SPEAQ_CLSAG_v1");
    for input in inputs {
        hasher.update(input);
    }
    let hash = hasher.finalize();
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(&hash);
    Scalar::from_bytes_mod_order(bytes)
}

/// Compute the key image: I = x * H_p(P)
/// where x is the secret key and P = x*G is the public key
pub fn compute_key_image(secret_key: &Scalar) -> (RistrettoPoint, RistrettoPoint) {
    let public_key = secret_key * G;
    let hp = hash_to_point(public_key.compress().as_bytes());
    let key_image = secret_key * hp;
    (public_key, key_image)
}

/// Sign a message with a CLSAG ring signature
///
/// - `message`: the data to sign
/// - `ring`: public keys of all ring members (must be RING_SIZE)
/// - `secret_key`: the signer's secret key
/// - `real_index`: which ring member is the real signer (0 to RING_SIZE-1)
pub fn sign(
    message: &[u8],
    ring: &[RistrettoPoint],
    secret_key: &Scalar,
    real_index: usize,
) -> Option<RingSignature> {
    if ring.len() != RING_SIZE || real_index >= RING_SIZE {
        return None;
    }

    let (_, key_image) = compute_key_image(secret_key);
    let ki_compressed = key_image.compress();

    // Generate random scalars for decoys
    let mut rng = rand::thread_rng();
    let alpha = Scalar::random(&mut rand_core::OsRng);
    let mut s_scalars: Vec<Scalar> = (0..RING_SIZE).map(|_| Scalar::random(&mut rand_core::OsRng)).collect();

    // Start the ring: compute c[real_index + 1]
    let l_j = alpha * G;
    let hp_j = hash_to_point(ring[real_index].compress().as_bytes());
    let r_j = alpha * hp_j;

    let mut c = vec![Scalar::ZERO; RING_SIZE];
    let next = (real_index + 1) % RING_SIZE;
    c[next] = hash_to_scalar(&[
        message,
        l_j.compress().as_bytes(),
        r_j.compress().as_bytes(),
        ki_compressed.as_bytes(),
    ]);

    // Complete the ring
    for offset in 1..RING_SIZE {
        let i = (real_index + offset) % RING_SIZE;
        let next_i = (i + 1) % RING_SIZE;

        let l_i = s_scalars[i] * G + c[i] * ring[i];
        let hp_i = hash_to_point(ring[i].compress().as_bytes());
        let r_i = s_scalars[i] * hp_i + c[i] * key_image;

        if next_i != next || offset < RING_SIZE - 1 {
            c[next_i] = hash_to_scalar(&[
                message,
                l_i.compress().as_bytes(),
                r_i.compress().as_bytes(),
                ki_compressed.as_bytes(),
            ]);
        }
    }

    // Close the ring: compute s[real_index]
    s_scalars[real_index] = alpha - c[real_index] * secret_key;

    // Serialize
    let c_bytes = c[0].to_bytes();
    let s_bytes: Vec<[u8; 32]> = s_scalars.iter().map(|s| s.to_bytes()).collect();

    Some(RingSignature {
        c: c_bytes,
        s: s_bytes,
        key_image: ki_compressed.to_bytes(),
    })
}

/// Verify a CLSAG ring signature
pub fn verify(
    message: &[u8],
    ring: &[RistrettoPoint],
    signature: &RingSignature,
) -> bool {
    if ring.len() != RING_SIZE || signature.s.len() != RING_SIZE {
        return false;
    }

    let ki = match CompressedRistretto::from_slice(&signature.key_image) {
        Ok(cr) => match cr.decompress() {
            Some(p) => p,
            None => return false,
        },
        Err(_) => return false,
    };

    let mut c_current = Scalar::from_canonical_bytes(signature.c).unwrap_or(Scalar::ZERO);

    // Traverse the ring
    for i in 0..RING_SIZE {
        let s_i = Scalar::from_canonical_bytes(signature.s[i]).unwrap_or(Scalar::ZERO);

        let l_i = s_i * G + c_current * ring[i];
        let hp_i = hash_to_point(ring[i].compress().as_bytes());
        let r_i = s_i * hp_i + c_current * ki;

        c_current = hash_to_scalar(&[
            message,
            l_i.compress().as_bytes(),
            r_i.compress().as_bytes(),
            &signature.key_image,
        ]);
    }

    // The ring must close: final c must equal the starting c
    c_current.to_bytes() == signature.c
}

#[cfg(test)]
mod tests {
    use super::*;

    fn generate_ring_with_signer() -> (Vec<RistrettoPoint>, Scalar, usize) {
        let mut rng = rand::thread_rng();
        let real_index = 5; // Hide in position 5

        let secret_key = Scalar::random(&mut rand_core::OsRng);
        let real_pubkey = secret_key * G;

        // Generate 10 random decoy public keys + insert real at position 5
        let mut ring: Vec<RistrettoPoint> = (0..RING_SIZE)
            .map(|_| Scalar::random(&mut rand_core::OsRng) * G)
            .collect();
        ring[real_index] = real_pubkey;

        (ring, secret_key, real_index)
    }

    #[test]
    fn test_key_image_deterministic() {
        let mut rng = rand::thread_rng();
        let sk = Scalar::random(&mut rand_core::OsRng);
        let (_, ki1) = compute_key_image(&sk);
        let (_, ki2) = compute_key_image(&sk);
        assert_eq!(
            ki1.compress().to_bytes(),
            ki2.compress().to_bytes(),
            "Same key must produce same key image"
        );
    }

    #[test]
    fn test_key_image_unique() {
        let mut rng = rand::thread_rng();
        let sk1 = Scalar::random(&mut rand_core::OsRng);
        let sk2 = Scalar::random(&mut rand_core::OsRng);
        let (_, ki1) = compute_key_image(&sk1);
        let (_, ki2) = compute_key_image(&sk2);
        assert_ne!(
            ki1.compress().to_bytes(),
            ki2.compress().to_bytes(),
            "Different keys must produce different key images"
        );
    }

    #[test]
    fn test_sign_and_verify() {
        let (ring, secret_key, real_index) = generate_ring_with_signer();
        let message = b"send 1.5 QC to SQ1abc123";

        let sig = sign(message, &ring, &secret_key, real_index)
            .expect("Signing should succeed");

        assert!(verify(message, &ring, &sig), "Valid signature must verify");
    }

    #[test]
    fn test_tampered_message_fails() {
        let (ring, secret_key, real_index) = generate_ring_with_signer();
        let message = b"send 1.5 QC";

        let sig = sign(message, &ring, &secret_key, real_index)
            .expect("Signing should succeed");

        assert!(!verify(b"send 999 QC", &ring, &sig), "Tampered message must NOT verify");
    }

    #[test]
    fn test_wrong_ring_fails() {
        let (ring, secret_key, real_index) = generate_ring_with_signer();
        let message = b"send 1.5 QC";

        let sig = sign(message, &ring, &secret_key, real_index)
            .expect("Signing should succeed");

        // Create a different ring
        let mut rng = rand::thread_rng();
        let wrong_ring: Vec<RistrettoPoint> = (0..RING_SIZE)
            .map(|_| Scalar::random(&mut rand_core::OsRng) * G)
            .collect();

        assert!(!verify(message, &wrong_ring, &sig), "Wrong ring must NOT verify");
    }

    #[test]
    fn test_ring_size_11() {
        let (ring, _, _) = generate_ring_with_signer();
        assert_eq!(ring.len(), 11, "Ring must have exactly 11 members");
    }

    #[test]
    fn test_anonymity_different_positions() {
        // The signer can be at any position in the ring
        for pos in 0..RING_SIZE {
            let mut rng = rand::thread_rng();
            let secret_key = Scalar::random(&mut rand_core::OsRng);
            let real_pubkey = secret_key * G;

            let mut ring: Vec<RistrettoPoint> = (0..RING_SIZE)
                .map(|_| Scalar::random(&mut rand_core::OsRng) * G)
                .collect();
            ring[pos] = real_pubkey;

            let sig = sign(b"test", &ring, &secret_key, pos)
                .expect("Signing at any position should work");
            assert!(verify(b"test", &ring, &sig), "Position {} must verify", pos);
        }
    }
}
