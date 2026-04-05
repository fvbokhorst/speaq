/**
 * SPEAQ - Wallet Screen
 * Q-Credits: send, receive, transaction history
 * Phase 5: Quantum Pay
 */

import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, Modal, TextInput, Alert,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { colors } from "../theme/brand";
import { getIdentity } from "../services/speaq";
import { walletService, Transaction } from "../services/wallet";

interface Props {
  onOpenChat: (contactId: string, contactName: string) => void;
}

export default function WalletScreen({ onOpenChat }: Props) {
  const [balance, setBalance] = useState(walletService.getBalance());
  const [transactions, setTransactions] = useState<Transaction[]>(walletService.getTransactions());
  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendNote, setSendNote] = useState("");
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

      {/* Transactions */}
      <Text style={st.sectionTitle}>Transactions</Text>
      {transactions.length === 0 ? (
        <View style={st.empty}>
          <Text style={st.emptyTitle}>No transactions yet</Text>
          <Text style={st.emptySub}>Send or receive Q-Credits to get started</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          renderItem={renderTransaction}
          keyExtractor={(item) => item.id}
          style={st.txList}
        />
      )}

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

  sectionTitle: { color: colors.signal.white, fontSize: 16, fontWeight: "600", paddingHorizontal: 24, marginTop: 16, marginBottom: 8 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 100 },
  emptyTitle: { color: colors.signal.white, fontSize: 16, fontWeight: "500", marginBottom: 4 },
  emptySub: { color: colors.signal.steel, fontSize: 12 },

  txList: { flex: 1, paddingHorizontal: 16 },
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
