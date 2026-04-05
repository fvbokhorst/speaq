/**
 * SPEAQ - Transactions Screen
 * Full transaction history with search
 */

import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, TextInput,
} from "react-native";
import { colors } from "../theme/brand";
import { walletService, Transaction } from "../services/wallet";

interface Props {
  onBack: () => void;
}

export default function TransactionsScreen({ onBack }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const allTransactions = walletService.getTransactions();

  const filtered = searchQuery.trim()
    ? allTransactions.filter((t) =>
        t.peer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.note.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.amount.toFixed(2).includes(searchQuery)
      )
    : allTransactions;

  function formatDate(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function getDateGroup(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  const renderItem = ({ item, index }: { item: Transaction; index: number }) => {
    const showDateHeader = index === 0 || getDateGroup(item.timestamp) !== getDateGroup(filtered[index - 1].timestamp);
    return (
      <>
        {showDateHeader && (
          <View style={st.dateHeader}>
            <Text style={st.dateHeaderText}>{getDateGroup(item.timestamp)}</Text>
          </View>
        )}
        <View style={st.txRow}>
          <View style={[st.txDot, item.type === "receive" ? st.txDotIn : st.txDotOut]} />
          <View style={st.txInfo}>
            <Text style={st.txPeer} numberOfLines={1}>{item.peer}</Text>
            {item.note ? <Text style={st.txNote} numberOfLines={1}>{item.note}</Text> : null}
            <Text style={st.txTime}>{formatDate(item.timestamp)}</Text>
          </View>
          <Text style={[st.txAmount, item.type === "receive" ? st.txAmountIn : st.txAmountOut]}>
            {item.type === "receive" ? "+" : "-"}{item.amount.toFixed(2)} QC
          </Text>
        </View>
      </>
    );
  };

  return (
    <View style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={onBack} style={st.backBtn}>
          <Text style={st.backText}>{"<"}</Text>
        </TouchableOpacity>
        <Text style={st.title}>Transactions</Text>
        <Text style={st.count}>{filtered.length}</Text>
      </View>

      {/* Search */}
      <View style={st.searchRow}>
        <TextInput
          style={st.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by name, note or amount..."
          placeholderTextColor={colors.signal.steel}
        />
      </View>

      {/* Summary */}
      <View style={st.summaryRow}>
        <View style={st.summaryItem}>
          <Text style={st.summaryLabel}>Received</Text>
          <Text style={st.summaryIn}>+{filtered.filter((t) => t.type === "receive").reduce((s, t) => s + t.amount, 0).toFixed(2)} QC</Text>
        </View>
        <View style={st.summaryDivider} />
        <View style={st.summaryItem}>
          <Text style={st.summaryLabel}>Sent</Text>
          <Text style={st.summaryOut}>-{filtered.filter((t) => t.type === "send").reduce((s, t) => s + t.amount, 0).toFixed(2)} QC</Text>
        </View>
      </View>

      {/* List */}
      {filtered.length === 0 ? (
        <View style={st.empty}>
          <Text style={st.emptyTitle}>{searchQuery ? "No results" : "No transactions"}</Text>
          <Text style={st.emptySub}>{searchQuery ? "Try a different search term" : "Send or receive Q-Credits to get started"}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          style={st.list}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.depth.void },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 60, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginRight: 8 },
  backText: { color: colors.voice.gold, fontSize: 20, fontWeight: "600" },
  title: { color: colors.signal.white, fontSize: 24, fontWeight: "700", fontFamily: "Georgia", flex: 1 },
  count: { color: colors.signal.steel, fontSize: 14 },

  searchRow: { paddingHorizontal: 16, paddingVertical: 12 },
  searchInput: { backgroundColor: colors.depth.card, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: colors.signal.white, fontSize: 15 },

  summaryRow: { flexDirection: "row", marginHorizontal: 16, marginBottom: 12, backgroundColor: colors.depth.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border.subtle, overflow: "hidden" },
  summaryItem: { flex: 1, alignItems: "center", paddingVertical: 14 },
  summaryDivider: { width: 1, backgroundColor: colors.border.subtle },
  summaryLabel: { color: colors.signal.steel, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 },
  summaryIn: { color: "#22C55E", fontSize: 16, fontWeight: "600" },
  summaryOut: { color: colors.signal.red, fontSize: 16, fontWeight: "600" },

  dateHeader: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  dateHeaderText: { color: colors.signal.steel, fontSize: 12, fontWeight: "600", letterSpacing: 0.5 },

  list: { flex: 1 },
  txRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  txDot: { width: 8, height: 8, borderRadius: 4, marginRight: 14 },
  txDotIn: { backgroundColor: "#22C55E" },
  txDotOut: { backgroundColor: colors.signal.red },
  txInfo: { flex: 1 },
  txPeer: { color: colors.signal.white, fontSize: 15, fontWeight: "500" },
  txNote: { color: colors.signal.steel, fontSize: 12, marginTop: 2 },
  txTime: { color: colors.signal.steel, fontSize: 10, marginTop: 3 },
  txAmount: { fontSize: 15, fontWeight: "600", marginLeft: 8 },
  txAmountIn: { color: "#22C55E" },
  txAmountOut: { color: colors.signal.red },

  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.signal.white, fontSize: 16, fontWeight: "500", marginBottom: 4 },
  emptySub: { color: colors.signal.steel, fontSize: 12 },
});
