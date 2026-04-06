//! SPEAQ Chain Transaction Structure
//!
//! Based on PRD Section 4: Confidential Transactions
//!
//! Privacy features FULLY INTEGRATED:
//! - CLSAG ring signatures: sender hidden among 11 decoys
//! - Pedersen commitments: amounts cryptographically hidden
//! - Bulletproofs: proves amount >= 0 without revealing it
//! - Amount encryption: only recipient can see the amount
//! - Dilithium-3 quantum signature on every transaction

use crate::crypto::{clsag, dilithium, pedersen, rangeproof};
use crate::wallet::Wallet;
use curve25519_dalek::constants::RISTRETTO_BASEPOINT_POINT as G;
use curve25519_dalek::ristretto::RistrettoPoint;
use curve25519_dalek::scalar::Scalar;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Transaction type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TxType {
    Transfer,
    Mining,
    Stake,
    Coinbase,
}

/// Reference to a previous transaction output
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct OutputReference {
    pub tx_hash: [u8; 32],
    pub output_index: u32,
}

/// Transaction input with CLSAG ring signature
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxInput {
    /// Ring members: 11 possible sources (1 real + 10 decoys)
    pub ring_members: Vec<OutputReference>,
    /// Key image: prevents double-spending (computed via CLSAG)
    pub key_image: [u8; 32],
    /// CLSAG ring signature proving ownership of one input
    pub ring_signature: Option<clsag::RingSignature>,
}

/// Transaction output with Pedersen commitment + range proof
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxOutput {
    /// Stealth address: one-time public key for the recipient
    pub stealth_address: [u8; 32],
    /// Pedersen commitment: hides the amount (C = v*G + r*H)
    pub commitment: pedersen::Commitment,
    /// Encrypted amount: only the recipient can decrypt
    pub encrypted_amount: [u8; 8],
    /// Bulletproof range proof: proves amount >= 0
    pub range_proof: Option<rangeproof::RangeProofBytes>,
}

/// A complete SPEAQ Chain transaction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub version: u8,
    pub tx_type: TxType,
    pub inputs: Vec<TxInput>,
    pub outputs: Vec<TxOutput>,
    pub fee: u64,
    pub extra: Vec<u8>,
    pub quantum_signature: dilithium::SignatureBytes,
    pub timestamp: u64,
}

pub type TxHash = [u8; 32];

impl Transaction {
    /// Compute the transaction hash
    pub fn hash(&self) -> TxHash {
        let mut hasher = Sha256::new();
        hasher.update(&[self.version]);
        hasher.update(&[self.tx_type as u8]);
        hasher.update(&self.fee.to_le_bytes());
        hasher.update(&self.timestamp.to_le_bytes());

        for input in &self.inputs {
            hasher.update(&input.key_image);
            for rm in &input.ring_members {
                hasher.update(&rm.tx_hash);
                hasher.update(&rm.output_index.to_le_bytes());
            }
        }

        for output in &self.outputs {
            hasher.update(&output.stealth_address);
            hasher.update(&output.commitment.point);
            hasher.update(&output.encrypted_amount);
        }

        hasher.update(&self.extra);

        let result = hasher.finalize();
        let mut hash = [0u8; 32];
        hash.copy_from_slice(&result);
        hash
    }

    /// Create a confidential transfer with REAL privacy crypto
    ///
    /// - Amount hidden via Pedersen commitment
    /// - Amount proven >= 0 via Bulletproof
    /// - Amount encrypted for recipient
    /// - Sender hidden via CLSAG ring signature
    /// - Transaction signed with Dilithium-3 (quantum-safe)
    pub fn create_confidential_transfer(
        ring_members: Vec<OutputReference>,
        ring_pubkeys: &[RistrettoPoint],
        sender_secret: &Scalar,
        sender_ring_index: usize,
        recipient_address: [u8; 32],
        amount_sparks: u64,
        shared_secret: &[u8; 32],
        wallet: &Wallet,
    ) -> Option<Self> {
        // 1. Compute key image (anti double-spend)
        let (_, key_image) = clsag::compute_key_image(sender_secret);
        let ki_bytes = key_image.compress().to_bytes();

        // 2. Create Bulletproof range proof (includes Pedersen commitment)
        // The range proof generates its own commitment with the blinding factor
        let blinding = pedersen::random_blinding();
        let proven = rangeproof::prove(amount_sparks, &blinding)?;

        // Use the commitment FROM the range proof (ensures they match)
        let commitment = pedersen::Commitment { point: proven.commitment };

        // 4. Encrypt amount for recipient
        let encrypted_amount = pedersen::encrypt_amount(amount_sparks, shared_secret);

        // 5. Build output
        let output = TxOutput {
            stealth_address: recipient_address,
            commitment,
            encrypted_amount,
            range_proof: Some(proven.proof),
        };

        // 6. Build input (ring signature added after tx hash)
        let input = TxInput {
            ring_members,
            key_image: ki_bytes,
            ring_signature: None, // Set after computing tx hash
        };

        let mut tx = Transaction {
            version: 1,
            tx_type: TxType::Transfer,
            inputs: vec![input],
            outputs: vec![output],
            fee: 0,
            extra: vec![],
            quantum_signature: dilithium::SignatureBytes(vec![]),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        };

        // 7. Create CLSAG ring signature over the tx hash
        let tx_hash = tx.hash();
        let ring_sig = clsag::sign(&tx_hash, ring_pubkeys, sender_secret, sender_ring_index)?;
        tx.inputs[0].ring_signature = Some(ring_sig);

        // 8. Sign with Dilithium-3 (quantum protection)
        let final_hash = tx.hash();
        tx.quantum_signature = wallet.sign(&final_hash);

        Some(tx)
    }

    /// Create a mining reward transaction
    pub fn create_mining_reward(
        miner_address: [u8; 32],
        amount_sparks: u64,
        block_height: u64,
        wallet: &Wallet,
    ) -> Self {
        let blinding = pedersen::random_blinding();
        let commitment = pedersen::commit(amount_sparks, &blinding);

        let output = TxOutput {
            stealth_address: miner_address,
            commitment,
            encrypted_amount: amount_sparks.to_le_bytes(),
            range_proof: None, // Mining rewards don't need range proofs (amount is public)
        };

        let mut extra = Vec::new();
        extra.extend_from_slice(&block_height.to_le_bytes());

        let mut tx = Transaction {
            version: 1,
            tx_type: TxType::Mining,
            inputs: vec![],
            outputs: vec![output],
            fee: 0,
            extra,
            quantum_signature: dilithium::SignatureBytes(vec![]),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        };

        let tx_hash = tx.hash();
        tx.quantum_signature = wallet.sign(&tx_hash);
        tx
    }

    /// Verify the Dilithium-3 signature
    pub fn verify_signature(&self, public_key: &pqcrypto_dilithium::dilithium3::PublicKey) -> bool {
        let tx_hash = self.hash();
        dilithium::verify(&tx_hash, &self.quantum_signature, public_key)
    }

    /// Verify all ring signatures in inputs
    pub fn verify_ring_signatures(&self, ring_pubkeys: &[RistrettoPoint]) -> bool {
        let tx_hash = self.hash();
        for input in &self.inputs {
            if let Some(ref sig) = input.ring_signature {
                if !clsag::verify(&tx_hash, ring_pubkeys, sig) {
                    return false;
                }
            }
        }
        true
    }

    /// Verify all range proofs in outputs
    pub fn verify_range_proofs(&self) -> bool {
        for output in &self.outputs {
            if let Some(ref proof) = output.range_proof {
                let proven = rangeproof::ProvenCommitment {
                    commitment: output.commitment.point,
                    proof: proof.clone(),
                };
                if !rangeproof::verify(&proven) {
                    return false;
                }
            }
        }
        true
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        bincode::serialize(self).unwrap_or_default()
    }

    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        bincode::deserialize(bytes).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::clsag::RING_SIZE;

    #[test]
    fn test_mining_reward_with_commitment() {
        let wallet = Wallet::generate();
        let tx = Transaction::create_mining_reward(wallet.address.0, 10000, 1, &wallet);

        assert_eq!(tx.tx_type, TxType::Mining);
        assert!(tx.verify_signature(&wallet.signing.public_key));
        // Mining reward has a real Pedersen commitment now
        assert_ne!(tx.outputs[0].commitment.point, [0u8; 32]);
    }

    #[test]
    fn test_confidential_transfer() {
        let alice = Wallet::generate();
        let bob = Wallet::generate();

        // Create ring of 11 public keys (Alice at position 5)
        let alice_secret = Scalar::random(&mut rand_core::OsRng);
        let alice_pubkey = alice_secret * G;
        let mut ring: Vec<RistrettoPoint> = (0..RING_SIZE)
            .map(|_| Scalar::random(&mut rand_core::OsRng) * G)
            .collect();
        ring[5] = alice_pubkey;

        // Create fake ring member references
        let ring_refs: Vec<OutputReference> = (0..RING_SIZE)
            .map(|i| OutputReference {
                tx_hash: [i as u8; 32],
                output_index: 0,
            })
            .collect();

        let shared_secret = [42u8; 32];

        let tx = Transaction::create_confidential_transfer(
            ring_refs,
            &ring,
            &alice_secret,
            5, // Alice is at position 5
            bob.address.0,
            1_500_000, // 0.015 QC
            &shared_secret,
            &alice,
        )
        .expect("Confidential transfer should succeed");

        // Verify quantum signature
        assert!(tx.verify_signature(&alice.signing.public_key));

        // Verify ring signature (sender hidden among 11)
        assert!(tx.verify_ring_signatures(&ring));

        // Verify range proof (amount >= 0)
        assert!(tx.verify_range_proofs());

        // Commitment is not zeros (amount is hidden)
        assert_ne!(tx.outputs[0].commitment.point, [0u8; 32]);

        // Encrypted amount is not plaintext
        assert_ne!(tx.outputs[0].encrypted_amount, 1_500_000u64.to_le_bytes());

        // But recipient CAN decrypt
        let decrypted = pedersen::decrypt_amount(&tx.outputs[0].encrypted_amount, &shared_secret);
        assert_eq!(decrypted, 1_500_000);

        // Key image is set (anti double-spend)
        assert_ne!(tx.inputs[0].key_image, [0u8; 32]);

        println!("Confidential tx size: {} bytes", tx.to_bytes().len());
    }

    #[test]
    fn test_tamper_detection_with_ring_sig() {
        let wallet = Wallet::generate();
        let secret = Scalar::random(&mut rand_core::OsRng);
        let pubkey = secret * G;
        let mut ring: Vec<RistrettoPoint> = (0..RING_SIZE)
            .map(|_| Scalar::random(&mut rand_core::OsRng) * G)
            .collect();
        ring[0] = pubkey;

        let ring_refs: Vec<OutputReference> = (0..RING_SIZE)
            .map(|i| OutputReference { tx_hash: [i as u8; 32], output_index: 0 })
            .collect();

        let mut tx = Transaction::create_confidential_transfer(
            ring_refs, &ring, &secret, 0, [1u8; 32], 1000, &[0u8; 32], &wallet,
        ).unwrap();

        assert!(tx.verify_signature(&wallet.signing.public_key));

        // Tamper with amount
        tx.outputs[0].encrypted_amount = [0xFF; 8];
        assert!(!tx.verify_signature(&wallet.signing.public_key), "Tampered tx must fail");
    }

    #[test]
    fn test_wrong_ring_fails() {
        let wallet = Wallet::generate();
        let secret = Scalar::random(&mut rand_core::OsRng);
        let pubkey = secret * G;
        let mut ring: Vec<RistrettoPoint> = (0..RING_SIZE)
            .map(|_| Scalar::random(&mut rand_core::OsRng) * G)
            .collect();
        ring[3] = pubkey;

        let ring_refs: Vec<OutputReference> = (0..RING_SIZE)
            .map(|i| OutputReference { tx_hash: [i as u8; 32], output_index: 0 })
            .collect();

        let tx = Transaction::create_confidential_transfer(
            ring_refs, &ring, &secret, 3, [1u8; 32], 1000, &[0u8; 32], &wallet,
        ).unwrap();

        // Verify with correct ring works
        assert!(tx.verify_ring_signatures(&ring));

        // Verify with wrong ring fails
        let wrong_ring: Vec<RistrettoPoint> = (0..RING_SIZE)
            .map(|_| Scalar::random(&mut rand_core::OsRng) * G)
            .collect();
        assert!(!tx.verify_ring_signatures(&wrong_ring));
    }

    #[test]
    fn test_recipient_can_decrypt_amount() {
        let wallet = Wallet::generate();
        let secret = Scalar::random(&mut rand_core::OsRng);
        let mut ring: Vec<RistrettoPoint> = (0..RING_SIZE)
            .map(|_| Scalar::random(&mut rand_core::OsRng) * G)
            .collect();
        ring[0] = secret * G;

        let ring_refs: Vec<OutputReference> = (0..RING_SIZE)
            .map(|i| OutputReference { tx_hash: [i as u8; 32], output_index: 0 })
            .collect();

        let shared = [99u8; 32];
        let amount = 5_000_000u64; // 0.05 QC

        let tx = Transaction::create_confidential_transfer(
            ring_refs, &ring, &secret, 0, [1u8; 32], amount, &shared, &wallet,
        ).unwrap();

        // Recipient decrypts
        let decrypted = pedersen::decrypt_amount(&tx.outputs[0].encrypted_amount, &shared);
        assert_eq!(decrypted, amount);

        // Wrong key cannot decrypt
        let wrong = pedersen::decrypt_amount(&tx.outputs[0].encrypted_amount, &[0u8; 32]);
        assert_ne!(wrong, amount);
    }

    #[test]
    fn test_serialization_roundtrip() {
        let wallet = Wallet::generate();
        let tx = Transaction::create_mining_reward(wallet.address.0, 10000, 1, &wallet);
        let bytes = tx.to_bytes();
        let restored = Transaction::from_bytes(&bytes).expect("Should deserialize");
        assert_eq!(restored.hash(), tx.hash());
    }
}
