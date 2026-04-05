/**
 * SPEAQ - Mining Screen
 * Proof of Contribution dashboard
 * Earn Q-Credits by helping the network
 */

import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch,
} from "react-native";
import { colors } from "../theme/brand";
import { t } from "../services/i18n";
import {
  loadMining, isMiningActive, startMining, stopMining,
  toggleMiningType, getMiningStats, getMiningRewards, getEstimatedDaily,
  getRewardRates, MiningType, MiningReward, MiningStats,
} from "../services/mining";

interface Props {
  onBack: () => void;
}

const TYPE_INFO: Record<MiningType, { icon: string; name: string; desc: string }> = {
  relay: { icon: "R", name: "Relay Mining", desc: "Relay encrypted messages for others" },
  mesh: { icon: "M", name: "Mesh Mining", desc: "Act as Bluetooth/WiFi mesh node" },
  bridge: { icon: "B", name: "Bridge Mining", desc: "Cash-to-Q-Credits agent" },
  validation: { icon: "V", name: "Validation Mining", desc: "Validate transaction proofs" },
  storage: { icon: "S", name: "Storage Mining", desc: "Store encrypted data fragments" },
  translation: { icon: "T", name: "Translation Mining", desc: "Translate app to new language" },
  onboarding: { icon: "O", name: "Onboarding Mining", desc: "Bring new active users" },
};

export default function MiningScreen({ onBack }: Props) {
  const [active, setActive] = useState(isMiningActive());
  const [stats, setStats] = useState<MiningStats>(getMiningStats());
  const [rewards, setRewards] = useState<MiningReward[]>(getMiningRewards());
  const [estimated, setEstimated] = useState(getEstimatedDaily());

  useEffect(() => {
    loadMining().then(() => {
      setActive(isMiningActive());
      setStats(getMiningStats());
      setRewards(getMiningRewards());
      setEstimated(getEstimatedDaily());
    });
    // Refresh stats every 10 seconds
    const interval = setInterval(() => {
      setStats(getMiningStats());
      setRewards(getMiningRewards());
      setEstimated(getEstimatedDaily());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  async function handleToggleMining() {
    if (active) {
      await stopMining();
    } else {
      await startMining();
    }
    setActive(isMiningActive());
    setStats(getMiningStats());
    setEstimated(getEstimatedDaily());
  }

  function handleToggleType(type: MiningType) {
    toggleMiningType(type);
    setStats(getMiningStats());
    setEstimated(getEstimatedDaily());
  }

  function formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  const rates = getRewardRates();

  return (
    <View style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={onBack} style={st.backBtn}>
          <Text style={st.backText}>{"<"}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>Mining</Text>
          <Text style={st.subtitle}>Proof of Contribution</Text>
        </View>
      </View>

      <ScrollView style={st.scroll} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Mining Toggle */}
        <View style={st.toggleCard}>
          <View style={st.toggleRow}>
            <View>
              <Text style={st.toggleLabel}>{active ? "Mining Active" : "Mining Paused"}</Text>
              <Text style={st.toggleSub}>{active ? "Earning Q-Credits for the network" : "Tap to start earning"}</Text>
            </View>
            <Switch
              value={active}
              onValueChange={handleToggleMining}
              trackColor={{ false: colors.depth.elevated, true: colors.voice.gold }}
              thumbColor={colors.signal.white}
            />
          </View>
          {active && (
            <View style={st.pulseRow}>
              <View style={st.pulseDot} />
              <Text style={st.pulseText}>Mining...</Text>
            </View>
          )}
        </View>

        {/* Stats Cards */}
        <View style={st.statsRow}>
          <View style={st.statCard}>
            <Text style={st.statValue}>{stats.todayEarned.toFixed(2)}</Text>
            <Text style={st.statLabel}>Today (QC)</Text>
          </View>
          <View style={st.statCard}>
            <Text style={st.statValue}>{stats.totalEarned.toFixed(2)}</Text>
            <Text style={st.statLabel}>Total (QC)</Text>
          </View>
          <View style={st.statCard}>
            <Text style={st.statValue}>{estimated.toFixed(2)}</Text>
            <Text style={st.statLabel}>Est. Daily</Text>
          </View>
        </View>

        {/* Level & Streak */}
        <View style={st.levelRow}>
          <View style={st.levelCard}>
            <Text style={st.levelValue}>Lv {stats.level}</Text>
            <Text style={st.levelLabel}>Miner Level</Text>
            <View style={st.levelBar}>
              <View style={[st.levelFill, { width: `${Math.min(100, (stats.level / 10) * 100)}%` }]} />
            </View>
          </View>
          <View style={st.levelCard}>
            <Text style={st.levelValue}>{stats.streak}</Text>
            <Text style={st.levelLabel}>Day Streak</Text>
          </View>
        </View>

        {/* Network Stats */}
        <View style={st.networkCard}>
          <Text style={st.networkTitle}>Your Contribution</Text>
          <View style={st.networkRow}>
            <Text style={st.networkLabel}>Messages Relayed</Text>
            <Text style={st.networkValue}>{stats.relayCount}</Text>
          </View>
          <View style={st.networkRow}>
            <Text style={st.networkLabel}>Proofs Validated</Text>
            <Text style={st.networkValue}>{stats.validationCount}</Text>
          </View>
          <View style={st.networkRow}>
            <Text style={st.networkLabel}>Storage Used</Text>
            <Text style={st.networkValue}>{stats.storageUsedMB.toFixed(1)} MB</Text>
          </View>
          <View style={st.networkRow}>
            <Text style={st.networkLabel}>Users Onboarded</Text>
            <Text style={st.networkValue}>{stats.onboardedUsers}</Text>
          </View>
        </View>

        {/* Mining Types */}
        <Text style={st.sectionTitle}>Mining Types</Text>
        {(Object.keys(TYPE_INFO) as MiningType[]).map((type) => {
          const info = TYPE_INFO[type];
          const rate = rates[type];
          const isActive = stats.activeTypes.includes(type);
          return (
            <TouchableOpacity key={type} style={[st.typeCard, isActive && st.typeCardActive]} onPress={() => handleToggleType(type)}>
              <View style={[st.typeIcon, isActive && st.typeIconActive]}>
                <Text style={st.typeIconText}>{info.icon}</Text>
              </View>
              <View style={st.typeInfo}>
                <Text style={[st.typeName, isActive && st.typeNameActive]}>{info.name}</Text>
                <Text style={st.typeDesc}>{info.desc}</Text>
                <Text style={st.typeRate}>{rate.perAction} QC/action -- cap {rate.dailyCap} QC/day</Text>
              </View>
              <View style={[st.typeCheck, isActive && st.typeCheckActive]}>
                {isActive && <Text style={st.typeCheckMark}>V</Text>}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Recent Rewards */}
        <Text style={st.sectionTitle}>Recent Rewards</Text>
        {rewards.length === 0 ? (
          <Text style={st.emptyText}>No rewards yet. Start mining to earn Q-Credits.</Text>
        ) : (
          rewards.slice(0, 20).map((r) => (
            <View key={r.id} style={st.rewardRow}>
              <View style={st.rewardDot} />
              <View style={st.rewardInfo}>
                <Text style={st.rewardDesc}>{r.description}</Text>
                <Text style={st.rewardTime}>{formatTime(r.timestamp)}</Text>
              </View>
              <Text style={st.rewardAmount}>+{r.amount.toFixed(2)} QC</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.depth.void },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 60, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginRight: 8 },
  backText: { color: colors.voice.gold, fontSize: 20, fontWeight: "600" },
  title: { color: colors.signal.white, fontSize: 24, fontWeight: "700", fontFamily: "Georgia" },
  subtitle: { color: colors.quantum.teal, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 },
  scroll: { flex: 1 },

  toggleCard: { margin: 16, padding: 20, backgroundColor: colors.depth.card, borderRadius: 16, borderWidth: 1, borderColor: colors.voice.gold },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  toggleLabel: { color: colors.signal.white, fontSize: 18, fontWeight: "600" },
  toggleSub: { color: colors.signal.steel, fontSize: 12, marginTop: 2 },
  pulseRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E", marginRight: 8 },
  pulseText: { color: "#22C55E", fontSize: 12, fontWeight: "500" },

  statsRow: { flexDirection: "row", paddingHorizontal: 12, gap: 8 },
  statCard: { flex: 1, backgroundColor: colors.depth.card, borderRadius: 12, padding: 16, alignItems: "center", borderWidth: 1, borderColor: colors.border.subtle },
  statValue: { color: colors.voice.gold, fontSize: 22, fontWeight: "700", fontFamily: "Georgia" },
  statLabel: { color: colors.signal.steel, fontSize: 10, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 },

  levelRow: { flexDirection: "row", paddingHorizontal: 12, gap: 8, marginTop: 8 },
  levelCard: { flex: 1, backgroundColor: colors.depth.card, borderRadius: 12, padding: 16, alignItems: "center", borderWidth: 1, borderColor: colors.border.subtle },
  levelValue: { color: colors.signal.white, fontSize: 18, fontWeight: "700" },
  levelLabel: { color: colors.signal.steel, fontSize: 10, marginTop: 4 },
  levelBar: { width: "100%", height: 4, backgroundColor: colors.depth.elevated, borderRadius: 2, marginTop: 8 },
  levelFill: { height: 4, backgroundColor: colors.voice.gold, borderRadius: 2 },

  networkCard: { margin: 16, marginBottom: 8, padding: 16, backgroundColor: colors.depth.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border.subtle },
  networkTitle: { color: colors.signal.white, fontSize: 14, fontWeight: "600", marginBottom: 12 },
  networkRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  networkLabel: { color: colors.signal.steel, fontSize: 13 },
  networkValue: { color: colors.signal.white, fontSize: 13, fontWeight: "500" },

  sectionTitle: { color: colors.signal.white, fontSize: 16, fontWeight: "600", paddingHorizontal: 16, marginTop: 16, marginBottom: 8 },
  emptyText: { color: colors.signal.steel, fontSize: 12, paddingHorizontal: 16, paddingBottom: 16 },

  typeCard: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8, padding: 14, backgroundColor: colors.depth.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border.subtle },
  typeCardActive: { borderColor: colors.voice.gold, backgroundColor: "rgba(212,168,83,0.05)" },
  typeIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.depth.elevated, alignItems: "center", justifyContent: "center", marginRight: 12 },
  typeIconActive: { backgroundColor: "rgba(212,168,83,0.15)" },
  typeIconText: { color: colors.voice.gold, fontSize: 16, fontWeight: "600" },
  typeInfo: { flex: 1 },
  typeName: { color: colors.signal.white, fontSize: 14, fontWeight: "500" },
  typeNameActive: { color: colors.voice.gold },
  typeDesc: { color: colors.signal.steel, fontSize: 11, marginTop: 2 },
  typeRate: { color: colors.quantum.teal, fontSize: 10, marginTop: 3 },
  typeCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border.subtle, alignItems: "center", justifyContent: "center" },
  typeCheckActive: { borderColor: colors.voice.gold, backgroundColor: colors.voice.gold },
  typeCheckMark: { color: colors.depth.void, fontSize: 14, fontWeight: "700" },

  rewardRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  rewardDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22C55E", marginRight: 12 },
  rewardInfo: { flex: 1 },
  rewardDesc: { color: colors.signal.white, fontSize: 13 },
  rewardTime: { color: colors.signal.steel, fontSize: 10, marginTop: 2 },
  rewardAmount: { color: "#22C55E", fontSize: 13, fontWeight: "600" },
});
