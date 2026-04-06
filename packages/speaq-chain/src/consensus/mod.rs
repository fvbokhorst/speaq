//! SPEAQ Chain Consensus Engine -- Proof of Contribution (DPoC)
//!
//! Based on PRD Section 5: Consensus
//!
//! How it works:
//! 1. Validators earn contribution scores by helping the network
//! 2. Top 21 validators are selected (with geographic diversity)
//! 3. Block producer is chosen via weighted random selection
//! 4. Finality: 2/3 majority (14/21 validators must confirm)
//! 5. Block interval: 30 seconds
//!
//! This is NOT Proof of Work (no wasted energy).
//! This is NOT pure Proof of Stake (no rich-get-richer).
//! This is Proof of Contribution: you earn by HELPING.

use crate::block::{Block, BlockHash, BLOCK_INTERVAL_SECS};
use crate::crypto::dilithium;
use crate::wallet::{Wallet, WalletAddress};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Maximum active validators
pub const MAX_VALIDATORS: usize = 21;

/// Minimum active days to be eligible
pub const MIN_ACTIVE_DAYS: u64 = 7;

/// Maximum validators per geographic region
pub const MAX_PER_REGION: usize = 5;

/// Finality threshold: 2/3 of validators must confirm
pub const FINALITY_THRESHOLD: usize = 14; // 14 out of 21

/// Geographic region
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Region {
    Europe,
    NorthAmerica,
    SouthAmerica,
    Africa,
    Asia,
    Oceania,
    Unknown,
}

/// Validator information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Validator {
    /// Wallet address of the validator
    pub address: WalletAddress,
    /// Dilithium-3 public key for block signing
    pub signing_pubkey: dilithium::PublicKeyBytes,
    /// Geographic region
    pub region: Region,
    /// Contribution scores
    pub messages_relayed: u64,
    pub proofs_validated: u64,
    pub storage_mb: u64,
    pub mesh_minutes: u64,
    pub translations: u64,
    pub onboarded_users: u64,
    pub uptime_hours: u64,
    pub total_hours: u64,
    /// Status
    pub active_days: u64,
    pub slashed: bool,
    /// Computed contribution score
    pub contribution_score: u64,
}

/// Block confirmation by a validator
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockConfirmation {
    pub block_hash: BlockHash,
    pub validator_address: WalletAddress,
    pub signature: dilithium::SignatureBytes,
}

impl Validator {
    /// Calculate contribution score (PRD Section 5.1)
    pub fn calculate_contribution_score(&mut self) {
        let relay_score = self.messages_relayed;
        let validation_score = self.proofs_validated * 2;
        let storage_score = (self.storage_mb * 100) / 200;
        let mesh_score = self.mesh_minutes * 3;
        let translation_score = self.translations * 10;
        let onboarding_score = self.onboarded_users * 5;
        let uptime_score = self.uptime_hours / 10;

        let base = relay_score + validation_score + storage_score
            + mesh_score + translation_score + onboarding_score
            + uptime_score;

        // Geographic scarcity bonus
        let geo_multiplier = self.geo_scarcity_factor();

        // Quality bonus based on uptime percentage
        let quality = if self.total_hours > 0 {
            (self.uptime_hours * 100) / self.total_hours
        } else {
            0
        };
        let quality_multiplier = if quality > 99 {
            120
        } else if quality > 95 {
            110
        } else if quality > 90 {
            100
        } else {
            80
        };

        self.contribution_score = (base * geo_multiplier * quality_multiplier) / 10000;
    }

    /// Geographic scarcity factor (fewer nodes in region = higher bonus)
    fn geo_scarcity_factor(&self) -> u64 {
        match self.region {
            Region::Africa => 150,      // Underrepresented = high bonus
            Region::SouthAmerica => 140,
            Region::Oceania => 130,
            Region::Asia => 110,
            Region::Europe => 100,      // Well represented = standard
            Region::NorthAmerica => 100,
            Region::Unknown => 80,      // Unknown = low bonus
        }
    }

    /// Check if validator is eligible
    pub fn is_eligible(&self) -> bool {
        self.active_days >= MIN_ACTIVE_DAYS
            && self.contribution_score > 0
            && !self.slashed
    }
}

/// Select the top 21 validators with geographic diversity (PRD Section 5.2)
pub fn select_validators(all_validators: &[Validator]) -> Vec<Validator> {
    // Step 1: Filter eligible validators
    let mut eligible: Vec<Validator> = all_validators
        .iter()
        .filter(|v| v.is_eligible())
        .cloned()
        .collect();

    // Step 2: Sort by contribution score (highest first)
    eligible.sort_by(|a, b| b.contribution_score.cmp(&a.contribution_score));

    // Step 3: Select top 21 with geographic diversity (max 5 per region)
    let mut selected = Vec::new();

    for validator in &eligible {
        if selected.len() >= MAX_VALIDATORS {
            break;
        }

        // Count how many from this region already selected
        let region_count = selected
            .iter()
            .filter(|v: &&Validator| v.region == validator.region)
            .count();

        if region_count >= MAX_PER_REGION {
            continue; // Skip: too many from this region
        }

        selected.push(validator.clone());
    }

    selected
}

/// Choose the block producer via weighted random selection (PRD Section 5.2)
pub fn select_block_producer(
    validators: &[Validator],
    block_height: u64,
    previous_hash: &BlockHash,
) -> Option<usize> {
    if validators.is_empty() {
        return None;
    }

    // Deterministic seed from block height + previous hash
    let mut hasher = Sha256::new();
    hasher.update(b"SPEAQ_BLOCK_PRODUCER_v1");
    hasher.update(&block_height.to_le_bytes());
    hasher.update(previous_hash);
    let seed = hasher.finalize();
    let seed_value = u64::from_le_bytes(seed[0..8].try_into().unwrap());

    // Weighted random: higher contribution score = higher chance
    let total_score: u64 = validators.iter().map(|v| v.contribution_score).sum();
    if total_score == 0 {
        // Fallback: round-robin
        return Some((block_height as usize) % validators.len());
    }

    let target = seed_value % total_score;
    let mut cumulative = 0u64;

    for (i, validator) in validators.iter().enumerate() {
        cumulative += validator.contribution_score;
        if cumulative > target {
            return Some(i);
        }
    }

    Some(validators.len() - 1)
}

/// Check if a block has reached finality (2/3 confirmations)
pub fn check_finality(confirmations: &[BlockConfirmation], validators: &[Validator]) -> bool {
    let valid_confirmations = confirmations
        .iter()
        .filter(|conf| {
            validators
                .iter()
                .any(|v| v.address == conf.validator_address)
        })
        .count();

    valid_confirmations >= FINALITY_THRESHOLD
}

/// Calculate block reward based on halving schedule
/// Halving every 2,100,000 QC mined
pub fn calculate_block_reward(total_mined_sparks: u64) -> u64 {
    let total_mined_qc = total_mined_sparks / 100_000_000;
    let halvings = total_mined_qc / 2_100_000;

    // Initial reward: 50 QC per block = 5,000,000,000 Sparks
    let initial_reward: u64 = 5_000_000_000;

    if halvings >= 64 {
        return 0; // All QC mined
    }

    initial_reward >> halvings
}

/// Slash a malicious validator
pub fn slash_validator(validator: &mut Validator, reason: &str) {
    validator.slashed = true;
    validator.contribution_score = 0;
    // In production: also confiscate stake
    eprintln!(
        "SLASHED validator {} for: {}",
        validator.address, reason
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_validator(
        score: u64,
        region: Region,
        days: u64,
    ) -> Validator {
        let wallet = Wallet::generate();
        Validator {
            address: wallet.address,
            signing_pubkey: dilithium::export_public_key(&wallet.signing.public_key),
            region,
            messages_relayed: score * 10,
            proofs_validated: score * 5,
            storage_mb: score,
            mesh_minutes: 0,
            translations: 0,
            onboarded_users: score / 10,
            uptime_hours: 720,
            total_hours: 730,
            active_days: days,
            slashed: false,
            contribution_score: score,
        }
    }

    #[test]
    fn test_contribution_score_calculation() {
        let mut v = create_test_validator(0, Region::Europe, 30);
        v.messages_relayed = 1000;
        v.proofs_validated = 500;
        v.storage_mb = 100;
        v.uptime_hours = 720;
        v.total_hours = 730;

        v.calculate_contribution_score();
        assert!(v.contribution_score > 0, "Score must be positive");
        println!("Contribution score: {}", v.contribution_score);
    }

    #[test]
    fn test_geographic_bonus() {
        let mut africa = create_test_validator(0, Region::Africa, 30);
        let mut europe = create_test_validator(0, Region::Europe, 30);

        // Same stats
        africa.messages_relayed = 1000;
        europe.messages_relayed = 1000;
        africa.uptime_hours = 720;
        europe.uptime_hours = 720;
        africa.total_hours = 730;
        europe.total_hours = 730;

        africa.calculate_contribution_score();
        europe.calculate_contribution_score();

        assert!(
            africa.contribution_score > europe.contribution_score,
            "Africa must get higher score (underrepresented region)"
        );
    }

    #[test]
    fn test_validator_selection_top_21() {
        let validators: Vec<Validator> = (0..50)
            .map(|i| create_test_validator(100 - i, Region::Europe, 30))
            .collect();

        let selected = select_validators(&validators);
        assert!(selected.len() <= MAX_VALIDATORS);
        // Due to MAX_PER_REGION = 5, only 5 from Europe
        assert_eq!(selected.len(), MAX_PER_REGION);
    }

    #[test]
    fn test_validator_selection_geographic_diversity() {
        let mut validators = Vec::new();
        let regions = [
            Region::Europe,
            Region::NorthAmerica,
            Region::Africa,
            Region::Asia,
            Region::SouthAmerica,
        ];

        for (i, region) in regions.iter().enumerate() {
            for j in 0..6 {
                validators.push(create_test_validator(
                    100 - (i as u64 * 6 + j),
                    region.clone(),
                    30,
                ));
            }
        }

        let selected = select_validators(&validators);
        assert_eq!(selected.len(), MAX_VALIDATORS);

        // Check no region has more than 5
        for region in &regions {
            let count = selected.iter().filter(|v| v.region == *region).count();
            assert!(count <= MAX_PER_REGION, "Region {:?} has {} (max {})", region, count, MAX_PER_REGION);
        }
    }

    #[test]
    fn test_ineligible_validators_filtered() {
        let mut validators = Vec::new();

        // Eligible
        validators.push(create_test_validator(100, Region::Europe, 30));

        // Too few days
        validators.push(create_test_validator(100, Region::Africa, 3));

        // Slashed
        let mut slashed = create_test_validator(100, Region::Asia, 30);
        slashed.slashed = true;
        validators.push(slashed);

        // Zero score
        validators.push(create_test_validator(0, Region::NorthAmerica, 30));

        let selected = select_validators(&validators);
        assert_eq!(selected.len(), 1, "Only 1 eligible validator");
    }

    #[test]
    fn test_block_producer_selection_deterministic() {
        let validators: Vec<Validator> = (0..5)
            .map(|i| create_test_validator(100 + i * 10, Region::Europe, 30))
            .collect();

        let prev_hash = [1u8; 32];
        let idx1 = select_block_producer(&validators, 100, &prev_hash);
        let idx2 = select_block_producer(&validators, 100, &prev_hash);
        assert_eq!(idx1, idx2, "Same inputs must produce same producer");
    }

    #[test]
    fn test_block_producer_changes_with_height() {
        let validators: Vec<Validator> = (0..10)
            .map(|i| create_test_validator(100 + i * 10, Region::Europe, 30))
            .collect();

        let prev_hash = [1u8; 32];
        let mut producers = std::collections::HashSet::new();

        for height in 0..100 {
            if let Some(idx) = select_block_producer(&validators, height, &prev_hash) {
                producers.insert(idx);
            }
        }

        assert!(producers.len() > 1, "Different heights should produce different validators");
    }

    #[test]
    fn test_finality_threshold() {
        let validators: Vec<Validator> = (0..21)
            .map(|i| create_test_validator(100 + i, Region::Europe, 30))
            .collect();

        let block_hash = [1u8; 32];

        // 13 confirmations: NOT finalized
        let confs_13: Vec<BlockConfirmation> = validators[..13]
            .iter()
            .map(|v| BlockConfirmation {
                block_hash,
                validator_address: v.address.clone(),
                signature: dilithium::SignatureBytes(vec![]),
            })
            .collect();
        assert!(!check_finality(&confs_13, &validators), "13/21 should NOT be final");

        // 14 confirmations: finalized
        let confs_14: Vec<BlockConfirmation> = validators[..14]
            .iter()
            .map(|v| BlockConfirmation {
                block_hash,
                validator_address: v.address.clone(),
                signature: dilithium::SignatureBytes(vec![]),
            })
            .collect();
        assert!(check_finality(&confs_14, &validators), "14/21 MUST be final");
    }

    #[test]
    fn test_block_reward_halving() {
        let initial = calculate_block_reward(0);
        assert_eq!(initial, 5_000_000_000, "Initial reward = 50 QC");

        // After first halving (2,100,000 QC mined = 210,000,000,000,000 Sparks)
        let after_first = calculate_block_reward(210_000_000_000_000);
        assert_eq!(after_first, 2_500_000_000, "After 1st halving = 25 QC");

        // After second halving
        let after_second = calculate_block_reward(420_000_000_000_000);
        assert_eq!(after_second, 1_250_000_000, "After 2nd halving = 12.5 QC");

        // Far future: reward approaches 0
        let far_future = calculate_block_reward(u64::MAX);
        assert_eq!(far_future, 0, "Eventually reward = 0");
    }

    #[test]
    fn test_slash_validator() {
        let mut v = create_test_validator(100, Region::Europe, 30);
        assert!(v.is_eligible());

        slash_validator(&mut v, "produced invalid block");
        assert!(v.slashed);
        assert_eq!(v.contribution_score, 0);
        assert!(!v.is_eligible());
    }
}
