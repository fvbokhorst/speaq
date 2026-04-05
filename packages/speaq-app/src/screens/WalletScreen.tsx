/**
 * SPEAQ - Wallet Screen
 * Q-Credits: send, receive, transaction history
 * Phase 5: Quantum Pay
 */

import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, TextInput, Alert,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { colors } from "../theme/brand";
import { getIdentity } from "../services/speaq";
import { walletService, Transaction, Project, LinkedWallet } from "../services/wallet";

interface Props {
  onOpenChat: (contactId: string, contactName: string) => void;
  onOpenTransactions: () => void;
}

export default function WalletScreen({ onOpenChat, onOpenTransactions }: Props) {
  const [balance, setBalance] = useState(walletService.getBalance());
  const [transactions, setTransactions] = useState<Transaction[]>(walletService.getTransactions());
  const [projects, setProjects] = useState<Project[]>(walletService.getProjects());
  const [linkedWallets, setLinkedWallets] = useState<LinkedWallet[]>(walletService.getLinkedWallets());
  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showLinkWallet, setShowLinkWallet] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [walletType, setWalletType] = useState<LinkedWallet["type"]>("monero");
  const [walletAddress, setWalletAddress] = useState("");
  const [walletLabel, setWalletLabel] = useState("");
  const identity = getIdentity();

  function handleSend() {
    const amount = parseFloat(sendAmount);
    if (!sendTo.trim() || isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid", "Enter a valid SPEAQ ID and amount.");
      return;
    }
    if (amount > balance) {
      Alert.alert("Insufficient", "Not enough Q-Credits.");
      return;
    }

    walletService.send(sendTo.trim(), amount, sendNote.trim());
    setBalance(walletService.getBalance());
    setTransactions(walletService.getTransactions());
    setShowSend(false);
    setSendTo("");
    setSendAmount("");
    setSendNote("");
    Alert.alert("Sent", `${amount.toFixed(2)} QC sent.`);
  }

  function handleCreateProject() {
    if (!projectName.trim()) return;
    walletService.createProject(projectName.trim(), projectDesc.trim());
    setProjects(walletService.getProjects());
    setProjectName("");
    setProjectDesc("");
    setShowNewProject(false);
  }

  function handleProjectAction(project: Project) {
    Alert.alert(project.name, `Balance: ${project.balance.toFixed(2)} QC`, [
      { text: "Fund", onPress: () => {
        Alert.prompt("Fund Project", `How many QC to add? (Available: ${balance.toFixed(2)})`, [
          { text: "Cancel", style: "cancel" },
          { text: "Fund", onPress: (val) => {
            const amount = parseFloat(val || "0");
            if (amount > 0 && walletService.fundProject(project.id, amount)) {
              setBalance(walletService.getBalance());
              setProjects(walletService.getProjects());
              setTransactions(walletService.getTransactions());
            }
          }},
        ], "plain-text", "", "decimal-pad");
      }},
      { text: "Withdraw", onPress: () => {
        Alert.prompt("Withdraw", `How many QC to withdraw? (Project: ${project.balance.toFixed(2)})`, [
          { text: "Cancel", style: "cancel" },
          { text: "Withdraw", onPress: (val) => {
            const amount = parseFloat(val || "0");
            if (amount > 0 && walletService.withdrawFromProject(project.id, amount)) {
              setBalance(walletService.getBalance());
              setProjects(walletService.getProjects());
              setTransactions(walletService.getTransactions());
            }
          }},
        ], "plain-text", "", "decimal-pad");
      }},
      { text: "Delete", style: "destructive", onPress: () => {
        walletService.deleteProject(project.id);
        setBalance(walletService.getBalance());
        setProjects(walletService.getProjects());
      }},
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function handleLinkWallet() {
    if (!walletAddress.trim()) return;
    walletService.linkWallet(walletType, walletAddress.trim(), walletLabel.trim() || walletType.toUpperCase());
    setLinkedWallets(walletService.getLinkedWallets());
    setWalletAddress("");
    setWalletLabel("");
    setShowLinkWallet(false);
  }

  function handleUnlinkWallet(id: string) {
    walletService.unlinkWallet(id);
    setLinkedWallets(walletService.getLinkedWallets());
  }

  const WALLET_TYPES: { key: LinkedWallet["type"]; label: string; color: string }[] = [
    { key: "monero", label: "Monero (XMR)", color: "#FF6600" },
    { key: "bitcoin", label: "Bitcoin (BTC)", color: "#F7931A" },
    { key: "ethereum", label: "Ethereum (ETH)", color: "#627EEA" },
    { key: "usdt", label: "USDT (Tether)", color: "#26A17B" },
  ];

  function formatDate(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  const renderTransaction = ({ item }: { item: Transaction }) => (
    <View style={st.txRow}>
      <View style={[st.txIcon, item.type === "receive" ? st.txIn : st.txOut]}>
        <Text style={st.txIconText}>{item.type === "receive" ? "+" : "-"}</Text>
      </View>
      <View style={st.txInfo}>
        <Text style={st.txPeer} numberOfLines={1}>{item.peer}</Text>
        {item.note ? <Text style={st.txNote} numberOfLines={1}>{item.note}</Text> : null}
      </View>
      <View style={st.txRight}>
        <Text style={[st.txAmount, item.type === "receive" ? st.txAmountIn : st.txAmountOut]}>
          {item.type === "receive" ? "+" : "-"}{item.amount.toFixed(2)} QC
        </Text>
        <Text style={st.txTime}>{formatDate(item.timestamp)}</Text>
      </View>
    </View>
  );

  return (
    <View style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <Text style={st.title}>Wallet</Text>
        <Text style={st.headerSub}>Quantum Pay</Text>
      </View>

      <ScrollView style={st.scrollArea} contentContainerStyle={st.scrollContent}>
        {/* Balance Card */}
        <View style={st.balanceCard}>
          <Text style={st.balanceLabel}>Q-Credits Balance</Text>
          <Text style={st.balanceAmount}>{balance.toFixed(2)}</Text>
          <Text style={st.balanceUsd}>~ ${balance.toFixed(2)} USD</Text>
          <View style={st.balanceActions}>
            <TouchableOpacity style={st.actionBtn} onPress={() => setShowSend(true)}>
              <Text style={st.actionIcon}>S</Text>
              <Text style={st.actionLabel}>Send</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.actionBtn} onPress={() => setShowReceive(true)}>
              <Text style={st.actionIcon}>R</Text>
              <Text style={st.actionLabel}>Receive</Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* Projects */}
        <View style={st.sectionRow}>
          <Text style={st.sectionTitle}>Projects</Text>
          <TouchableOpacity onPress={() => setShowNewProject(true)}>
            <Text style={st.sectionAdd}>+ New</Text>
          </TouchableOpacity>
        </View>
        {projects.length === 0 ? (
          <View style={st.emptySmall}>
            <Text style={st.emptySub}>No projects yet. Create one to allocate Q-Credits.</Text>
          </View>
        ) : (
          projects.map((p) => (
            <TouchableOpacity key={p.id} style={st.projectCard} onPress={() => handleProjectAction(p)}>
              <View style={st.projectInfo}>
                <Text style={st.projectName}>{p.name}</Text>
                {p.description ? <Text style={st.projectDesc} numberOfLines={1}>{p.description}</Text> : null}
              </View>
              <Text style={st.projectBalance}>{p.balance.toFixed(2)} QC</Text>
            </TouchableOpacity>
          ))
        )}

        {/* Linked Wallets */}
        <View style={st.sectionRow}>
          <Text style={st.sectionTitle}>Linked Wallets</Text>
          <TouchableOpacity onPress={() => setShowLinkWallet(true)}>
            <Text style={st.sectionAdd}>+ Link</Text>
          </TouchableOpacity>
        </View>
        {linkedWallets.length === 0 ? (
          <View style={st.emptySmall}>
            <Text style={st.emptySub}>Link a Monero, Bitcoin, or Ethereum wallet to convert Q-Credits.</Text>
          </View>
        ) : (
          linkedWallets.map((w) => (
            <View key={w.id} style={st.walletCard}>
              <View style={[st.walletDot, { backgroundColor: WALLET_TYPES.find((t) => t.key === w.type)?.color || colors.voice.gold }]} />
              <View style={st.walletInfo}>
                <Text style={st.walletLabel}>{w.label}</Text>
                <Text style={st.walletAddr} numberOfLines={1}>{w.address}</Text>
              </View>
              <TouchableOpacity onPress={() => handleUnlinkWallet(w.id)}>
                <Text style={st.walletUnlink}>X</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Recent Transactions */}
        <View style={st.sectionRow}>
          <Text style={st.sectionTitle}>Recent</Text>
          <TouchableOpacity onPress={onOpenTransactions}>
            <Text style={st.sectionAdd}>View All</Text>
          </TouchableOpacity>
        </View>
        {transactions.length === 0 ? (
          <View style={st.emptySmall}>
            <Text style={st.emptySub}>No transactions yet</Text>
          </View>
        ) : (
          transactions.slice(0, 3).map((item) => (
            <View key={item.id} style={st.txRow}>
              <View style={[st.txIcon, item.type === "receive" ? st.txIn : st.txOut]}>
                <Text style={st.txIconText}>{item.type === "receive" ? "+" : "-"}</Text>
              </View>
              <View style={st.txInfo}>
                <Text style={st.txPeer} numberOfLines={1}>{item.peer}</Text>
                {item.note ? <Text style={st.txNote} numberOfLines={1}>{item.note}</Text> : null}
              </View>
              <View style={st.txRight}>
                <Text style={[st.txAmount, item.type === "receive" ? st.txAmountIn : st.txAmountOut]}>
                  {item.type === "receive" ? "+" : "-"}{item.amount.toFixed(2)} QC
                </Text>
                <Text style={st.txTime}>{formatDate(item.timestamp)}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Send Modal */}
      <Modal visible={showSend} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>Send Q-Credits</Text>
            <TextInput style={st.modalInput} value={sendTo} onChangeText={setSendTo}
              placeholder="Recipient SPEAQ ID" placeholderTextColor={colors.signal.steel} autoCapitalize="none" />
            <TextInput style={st.modalInput} value={sendAmount} onChangeText={setSendAmount}
              placeholder="Amount (QC)" placeholderTextColor={colors.signal.steel} keyboardType="decimal-pad" />
            <TextInput style={st.modalInput} value={sendNote} onChangeText={setSendNote}
              placeholder="Note (optional)" placeholderTextColor={colors.signal.steel} />
            <View style={st.modalBtns}>
              <TouchableOpacity style={st.cancelBtn} onPress={() => setShowSend(false)}>
                <Text style={st.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.confirmBtn} onPress={handleSend}>
                <Text style={st.confirmText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* New Project Modal */}
      <Modal visible={showNewProject} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>New Project</Text>
            <TextInput style={st.modalInput} value={projectName} onChangeText={setProjectName}
              placeholder="Project name" placeholderTextColor={colors.signal.steel} autoFocus />
            <TextInput style={st.modalInput} value={projectDesc} onChangeText={setProjectDesc}
              placeholder="Description (optional)" placeholderTextColor={colors.signal.steel} />
            <View style={st.modalBtns}>
              <TouchableOpacity style={st.cancelBtn} onPress={() => setShowNewProject(false)}>
                <Text style={st.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.confirmBtn, !projectName.trim() && { opacity: 0.3 }]}
                onPress={handleCreateProject} disabled={!projectName.trim()}>
                <Text style={st.confirmText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Link Wallet Modal */}
      <Modal visible={showLinkWallet} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>Link Crypto Wallet</Text>
            <View style={st.walletTypeRow}>
              {WALLET_TYPES.map((t) => (
                <TouchableOpacity key={t.key}
                  style={[st.walletTypeBtn, walletType === t.key && { borderColor: t.color, backgroundColor: t.color + "20" }]}
                  onPress={() => setWalletType(t.key)}>
                  <Text style={[st.walletTypeTxt, walletType === t.key && { color: t.color }]}>{t.key.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={st.modalInput} value={walletAddress} onChangeText={setWalletAddress}
              placeholder={`${walletType.charAt(0).toUpperCase() + walletType.slice(1)} address`}
              placeholderTextColor={colors.signal.steel} autoCapitalize="none" />
            <TextInput style={st.modalInput} value={walletLabel} onChangeText={setWalletLabel}
              placeholder="Label (optional)" placeholderTextColor={colors.signal.steel} />
            <View style={st.modalBtns}>
              <TouchableOpacity style={st.cancelBtn} onPress={() => setShowLinkWallet(false)}>
                <Text style={st.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.confirmBtn, !walletAddress.trim() && { opacity: 0.3 }]}
                onPress={handleLinkWallet} disabled={!walletAddress.trim()}>
                <Text style={st.confirmText}>Link</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Receive Modal */}
      <Modal visible={showReceive} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>Receive Q-Credits</Text>
            <View style={st.qrBox}>
              <QRCode
                value={`speaq-pay://${identity?.speaqId || "unknown"}`}
                size={180}
                backgroundColor={colors.depth.card}
                color={colors.voice.gold}
              />
            </View>
            <Text style={st.qrId}>{identity?.speaqId || "No ID"}</Text>
            <Text style={st.qrHint}>Share this QR code to receive Q-Credits</Text>
            <TouchableOpacity style={st.cancelBtn} onPress={() => setShowReceive(false)}>
              <Text style={st.cancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.depth.void },
  header: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  title: { color: colors.signal.white, fontSize: 28, fontWeight: "700", fontFamily: "Georgia" },
  headerSub: { fontSize: 11, color: colors.quantum.teal, letterSpacing: 2, textTransform: "uppercase", marginTop: 2 },

  balanceCard: { margin: 16, padding: 24, backgroundColor: colors.depth.card, borderRadius: 20, borderWidth: 1, borderColor: colors.voice.gold, alignItems: "center" },
  balanceLabel: { color: colors.signal.steel, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  balanceAmount: { color: colors.voice.gold, fontSize: 48, fontWeight: "700", fontFamily: "Georgia", marginTop: 8 },
  balanceUsd: { color: colors.signal.steel, fontSize: 14, marginTop: 4 },
  balanceActions: { flexDirection: "row", gap: 24, marginTop: 20 },
  actionBtn: { alignItems: "center", backgroundColor: colors.depth.elevated, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border.subtle },
  actionIcon: { color: colors.voice.gold, fontSize: 18, fontWeight: "600" },
  actionLabel: { color: colors.signal.steel, fontSize: 10, marginTop: 4 },

  scrollArea: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, marginTop: 20, marginBottom: 8 },
  sectionTitle: { color: colors.signal.white, fontSize: 16, fontWeight: "600" },
  sectionAdd: { color: colors.voice.gold, fontSize: 13, fontWeight: "600" },

  emptySmall: { paddingHorizontal: 24, paddingVertical: 12 },
  emptySub: { color: colors.signal.steel, fontSize: 12 },

  projectCard: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8, padding: 16, backgroundColor: colors.depth.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border.subtle },
  projectInfo: { flex: 1 },
  projectName: { color: colors.signal.white, fontSize: 15, fontWeight: "600" },
  projectDesc: { color: colors.signal.steel, fontSize: 11, marginTop: 2 },
  projectBalance: { color: colors.voice.gold, fontSize: 16, fontWeight: "700", fontFamily: "Georgia" },

  walletCard: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8, padding: 14, backgroundColor: colors.depth.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border.subtle },
  walletDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  walletInfo: { flex: 1 },
  walletLabel: { color: colors.signal.white, fontSize: 14, fontWeight: "500" },
  walletAddr: { color: colors.signal.steel, fontSize: 10, fontFamily: "Courier", marginTop: 2 },
  walletUnlink: { color: colors.signal.red, fontSize: 16, fontWeight: "600", paddingHorizontal: 8 },
  walletTypeRow: { flexDirection: "row", gap: 8, marginBottom: 12, width: "100%" },
  walletTypeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border.subtle, alignItems: "center" },
  walletTypeTxt: { color: colors.signal.steel, fontSize: 10, fontWeight: "600" },
  txRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  txIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 12 },
  txIn: { backgroundColor: "rgba(34,197,94,0.15)" },
  txOut: { backgroundColor: "rgba(239,68,68,0.15)" },
  txIconText: { fontSize: 18, fontWeight: "600", color: colors.signal.white },
  txInfo: { flex: 1 },
  txPeer: { color: colors.signal.white, fontSize: 14, fontWeight: "500" },
  txNote: { color: colors.signal.steel, fontSize: 11, marginTop: 2 },
  txRight: { alignItems: "flex-end" },
  txAmount: { fontSize: 14, fontWeight: "600" },
  txAmountIn: { color: "#22C55E" },
  txAmountOut: { color: colors.signal.red },
  txTime: { color: colors.signal.steel, fontSize: 10, marginTop: 2 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center" },
  modalBox: { width: 300, backgroundColor: colors.depth.card, borderRadius: 20, padding: 28, borderWidth: 1, borderColor: colors.border.subtle, alignItems: "center" },
  modalTitle: { color: colors.signal.white, fontSize: 18, fontWeight: "600", marginBottom: 16 },
  modalInput: { width: "100%", backgroundColor: colors.depth.elevated, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: colors.signal.white, fontSize: 15, marginBottom: 12 },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 4, width: "100%" },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border.subtle, alignItems: "center" },
  cancelText: { color: colors.signal.steel, fontSize: 14 },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.voice.gold, alignItems: "center" },
  confirmText: { color: colors.depth.void, fontSize: 14, fontWeight: "600" },

  qrBox: { padding: 16, backgroundColor: colors.depth.elevated, borderRadius: 16, marginBottom: 16 },
  qrId: { color: colors.voice.gold, fontSize: 14, fontFamily: "Courier", marginBottom: 8 },
  qrHint: { color: colors.signal.steel, fontSize: 11, textAlign: "center", marginBottom: 16 },
});
