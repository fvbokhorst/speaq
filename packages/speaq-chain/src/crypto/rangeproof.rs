//! Bulletproofs Range Proofs -- Prove Amount >= 0
//!
//! Without range proofs, an attacker could create a Pedersen commitment
//! to a NEGATIVE amount (e.g., -1000 QC) and the homomorphic balance
//! check would still pass. This would create money from nothing.
//!
//! Bulletproofs prove that a committed value is in range [0, 2^64)
//! WITHOUT revealing the actual value. The proof is ~700 bytes.
//!
//! Library: bulletproofs crate (pure Rust, Ristretto-based)

use bulletproofs::{BulletproofGens, PedersenGens, RangeProof};
use curve25519_dalek::scalar::Scalar;
use merlin::Transcript;
use serde::{Deserialize, Serialize};

/// Range proof data (serialized, ~700 bytes)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RangeProofBytes(pub Vec<u8>);

/// Committed value with its range proof
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvenCommitment {
    /// The Pedersen commitment (compressed point)
    pub commitment: [u8; 32],
    /// The range proof (~700 bytes)
    pub proof: RangeProofBytes,
}

/// Generate a range proof for a value
///
/// Proves that `value` is in [0, 2^64) without revealing `value`.
/// Returns the commitment and proof.
pub fn prove(value: u64, blinding: &Scalar) -> Option<ProvenCommitment> {
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(64, 1);

    let mut transcript = Transcript::new(b"SPEAQ_RangeProof_v1");

    let (proof, commitment) = RangeProof::prove_single(
        &bp_gens,
        &pc_gens,
        &mut transcript,
        value,
        blinding,
        64, // 64-bit range
    )
    .ok()?;

    Some(ProvenCommitment {
        commitment: commitment.to_bytes(),
        proof: RangeProofBytes(proof.to_bytes()),
    })
}

/// Verify a range proof
///
/// Returns true if the committed value is proven to be in [0, 2^64).
/// The verifier does NOT learn the actual value.
pub fn verify(proven: &ProvenCommitment) -> bool {
    let pc_gens = PedersenGens::default();
    let bp_gens = BulletproofGens::new(64, 1);

    let mut transcript = Transcript::new(b"SPEAQ_RangeProof_v1");

    let proof = match RangeProof::from_bytes(&proven.proof.0) {
        Ok(p) => p,
        Err(_) => return false,
    };

    let commitment = match curve25519_dalek::ristretto::CompressedRistretto::from_slice(
        &proven.commitment,
    ) {
        Ok(c) => c,
        Err(_) => return false,
    };

    proof
        .verify_single(&bp_gens, &pc_gens, &mut transcript, &commitment, 64)
        .is_ok()
}

/// Prove multiple values at once (batch proof, more efficient)
pub fn prove_batch(values: &[(u64, Scalar)]) -> Option<Vec<ProvenCommitment>> {
    // For simplicity, prove each individually
    // Production: use RangeProof::prove_multiple for batch efficiency
    values
        .iter()
        .map(|(v, b)| prove(*v, b))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prove_and_verify() {
        let value = 1_500_000u64; // 0.015 QC in Sparks
        let blinding = Scalar::random(&mut rand_core::OsRng);

        let proven = prove(value, &blinding).expect("Proof should succeed");
        assert!(!proven.proof.0.is_empty());
        println!("Range proof size: {} bytes", proven.proof.0.len());
        println!("Commitment size: {} bytes", proven.commitment.len());

        assert!(verify(&proven), "Valid proof must verify");
    }

    #[test]
    fn test_zero_amount() {
        let blinding = Scalar::random(&mut rand_core::OsRng);
        let proven = prove(0, &blinding).expect("Zero amount should work");
        assert!(verify(&proven), "Zero amount proof must verify");
    }

    #[test]
    fn test_max_amount() {
        let blinding = Scalar::random(&mut rand_core::OsRng);
        // Max supply: 21_000_000 QC = 2_100_000_000_000_000 Sparks
        let proven = prove(2_100_000_000_000_000, &blinding).expect("Max amount should work");
        assert!(verify(&proven), "Max amount proof must verify");
    }

    #[test]
    fn test_tampered_proof_fails() {
        let blinding = Scalar::random(&mut rand_core::OsRng);
        let mut proven = prove(1000, &blinding).expect("Proof should succeed");

        // Tamper with the proof
        if let Some(byte) = proven.proof.0.last_mut() {
            *byte ^= 0xFF;
        }

        assert!(!verify(&proven), "Tampered proof must NOT verify");
    }

    #[test]
    fn test_tampered_commitment_fails() {
        let blinding = Scalar::random(&mut rand_core::OsRng);
        let mut proven = prove(1000, &blinding).expect("Proof should succeed");

        // Tamper with the commitment
        proven.commitment[0] ^= 0xFF;

        assert!(!verify(&proven), "Tampered commitment must NOT verify");
    }

    #[test]
    fn test_different_values_different_proofs() {
        let b1 = Scalar::random(&mut rand_core::OsRng);
        let b2 = Scalar::random(&mut rand_core::OsRng);

        let p1 = prove(100, &b1).expect("Proof 1");
        let p2 = prove(200, &b2).expect("Proof 2");

        assert_ne!(p1.commitment, p2.commitment, "Different values = different commitments");
        assert!(verify(&p1), "Proof 1 must verify");
        assert!(verify(&p2), "Proof 2 must verify");
    }

    #[test]
    fn test_proof_cannot_be_reused() {
        let b1 = Scalar::random(&mut rand_core::OsRng);
        let b2 = Scalar::random(&mut rand_core::OsRng);

        let p1 = prove(100, &b1).expect("Proof 1");

        // Try to use proof from value 100 with commitment for value 200
        let p2 = prove(200, &b2).expect("Proof 2");
        let fake = ProvenCommitment {
            commitment: p2.commitment,
            proof: p1.proof.clone(),
        };

        assert!(!verify(&fake), "Proof from different value must NOT verify");
    }
}
