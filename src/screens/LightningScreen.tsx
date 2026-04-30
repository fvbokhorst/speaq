/**
 * SPEAQ - Lightning Network Screen
 * Bitcoin Lightning payments, invoices, QC conversion
 */

import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, TextInput, Alert,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useThemedStyles, useTheme, ThemeColors } from "../theme/ThemeContext";
import { t } from "../services/i18n";
import { walletService } from "../services/wallet";
import {
  loadLightning, connectToLSP, isConnected, getBalance, getBalanceQC,
  getInvoices, createInvoice, payInvoice, depositToQC, withdrawFromQC,
  getExchangeRate, satsToQC, qcToSats, getConfig,
  LightningInvoice,
} from "../services/lightning";

interface Props {
  onBack: () => void;
}

export default function LightningScreen({ onBack }: Props) {
  const { colors: c } = useTheme();
  const st = useThemedStyles(makeStyles);
  const [connected, setConnected] = useState(isConnected());
  const [balanceSats, setBalanceSats] = useState(getBalance());
  const [invoiceList, setInvoiceList] = useState<LightningInvoice[]>(getInvoices());
  const [showCreate, setShowCreate] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState<LightningInvoice | null>(null);
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceMemo, setInvoiceMemo] = useState("");
  const [payBolt11, setPayBolt11] = useState("");
  const [convertAmount, setConvertAmount] = useState("");
  const [convertDirection, setConvertDirection] = useState<"toQC" | "toLN">("toQC");

  useEffect(() => {
    loadLightning().then(() => {
      setConnected(isConnected());
      setBalanceSats(getBalance());
      setInvoiceList(getInvoices());
    });
  }, []);

  function refresh() {
    setBalanceSats(getBalance());
    setInvoiceList(getInvoices());
  }

  async function handleConnect() {
    await connectToLSP("demo");
    setConnected(true);
    refresh();
    Alert.alert("Connected", "Lightning node connected (demo mode).");
  }

  async function handleCreateInvoice() {
    const sats = parseInt(invoiceAmount);
    if (!sats || sats <= 0) return;
    const inv = await createInvoice(sats, invoiceMemo);
    setCreatedInvoice(inv);
    setShowCreate(false);
    setInvoiceAmount("");
    setInvoiceMemo("");
    refresh();
  }

  async function handlePayInvoice() {
    if (!payBolt11.trim()) return;
    const result = await payInvoice(payBolt11.trim());
    if (result) {
      Alert.alert("Paid", `${result.amountSats} sats sent (${result.amountQC.toFixed(4)} QC)`);
    } else {
      Alert.alert("Failed", "Insufficient balance or invalid invoice.");
    }
    setShowPay(false);
    setPayBolt11("");
    refresh();
  }

  async function handleConvert() {
    const amount = parseFloat(convertAmount);
    if (!amount || amount <= 0) return;

    if (convertDirection === "toQC") {
      const qc = await depositToQC(amount);
      if (qc > 0) {
        walletService.receive("Lightning", qc, "Lightning to Q-Credits");
        Alert.alert("Converted", `${amount} sats -> ${qc.toFixed(4)} QC`);
      } else {
        Alert.alert("Failed", "Insufficient Lightning balance.");
      }
    } else {
      const qcAmount = amount;
      if (qcAmount > walletService.getBalance()) {
        Alert.alert("Failed", "Insufficient Q-Credits.");
        return;
      }
      const sats = await withdrawFromQC(qcAmount);
      walletService.send("Lightning", qcAmount, "Q-Credits to Lightning");
      Alert.alert("Converted", `${qcAmount} QC -> ${sats} sats`);
    }

    setShowConvert(false);
    setConvertAmount("");
    refresh();
  }

  const rate = getExchangeRate();

  return (
    <View style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={onBack} style={st.backBtn}>
          <Text style={st.backText}>{"<"}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>Lightning</Text>
          <Text style={st.subtitle}>Bitcoin Lightning Network</Text>
        </View>
      </View>

      <ScrollView style={st.scroll} contentContainerStyle={{ paddingBottom: 100 }}>
        {!connected ? (
          <View style={st.connectCard}>
            <Text style={st.connectTitle}>Connect to Lightning</Text>
            <Text style={st.connectSub}>Link a Lightning node to send and receive Bitcoin instantly.</Text>
            <TouchableOpacity style={st.connectBtn} onPress={handleConnect}>
              <Text style={st.connectBtnText}>Connect (Demo)</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Balance */}
            <View style={st.balanceCard}>
              <Text style={st.balanceLabel}>Lightning Balance</Text>
              <Text style={st.balanceAmount}>{balanceSats.toLocaleString()}</Text>
              <Text style={st.balanceSub}>satoshis (~{getBalanceQC().toFixed(2)} QC)</Text>
              <View style={st.balanceActions}>
                <TouchableOpacity style={st.actionBtn} onPress={() => setShowCreate(true)}>
                  <Text style={st.actionIcon}>R</Text>
                  <Text style={st.actionLabel}>Receive</Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.actionBtn} onPress={() => setShowPay(true)}>
                  <Text style={st.actionIcon}>S</Text>
                  <Text style={st.actionLabel}>Send</Text>
                </TouchableOpacity>
                <TouchableOpacity style={st.actionBtn} onPress={() => setShowConvert(true)}>
                  <Text style={st.actionIcon}>C</Text>
                  <Text style={st.actionLabel}>Convert</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Exchange Rate */}
            <View style={st.rateCard}>
              <Text style={st.rateLabel}>Exchange Rate</Text>
              <Text style={st.rateValue}>1 QC = {rate.satsPerQC.toLocaleString()} sats</Text>
              <Text style={st.rateSub}>Based on gold peg (1 QC = 0.01g gold)</Text>
            </View>

            {/* Created Invoice QR */}
            {createdInvoice && createdInvoice.status === "pending" && (
              <View style={st.invoiceCard}>
                <Text style={st.invoiceTitle}>Pending Invoice</Text>
                <View style={st.qrBox}>
                  <QRCode value={createdInvoice.bolt11} size={160} backgroundColor={c.depth.card} color={c.voice.gold} />
                </View>
                <Text style={st.invoiceAmount}>{createdInvoice.amountSats.toLocaleString()} sats</Text>
                <Text style={st.invoiceMemo}>{createdInvoice.memo}</Text>
                <Text style={st.invoiceBolt11} numberOfLines={2}>{createdInvoice.bolt11}</Text>
                <TouchableOpacity style={st.dismissBtn} onPress={() => setCreatedInvoice(null)}>
                  <Text style={st.dismissText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Invoice History */}
            <Text style={st.sectionTitle}>History</Text>
            {invoiceList.length === 0 ? (
              <Text style={st.emptyText}>No Lightning transactions yet.</Text>
            ) : (
              invoiceList.map((inv) => (
                <View key={inv.id} style={st.historyRow}>
                  <View style={[st.historyDot, inv.direction === "incoming" ? st.dotIn : st.dotOut]} />
                  <View style={st.historyInfo}>
                    <Text style={st.historyMemo} numberOfLines={1}>{inv.memo}</Text>
                    <Text style={st.historyStatus}>{inv.status}</Text>
                  </View>
                  <Text style={[st.historyAmount, inv.direction === "incoming" ? st.amountIn : st.amountOut]}>
                    {inv.direction === "incoming" ? "+" : "-"}{inv.amountSats.toLocaleString()} sats
                  </Text>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Create Invoice Modal */}
      <Modal visible={showCreate} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>Create Invoice</Text>
            <TextInput style={st.modalInput} value={invoiceAmount} onChangeText={setInvoiceAmount}
              placeholder="Amount (satoshis)" placeholderTextColor={c.signal.steel} keyboardType="number-pad" autoFocus />
            {invoiceAmount && parseInt(invoiceAmount) > 0 && (
              <Text style={st.convertHint}>= {satsToQC(parseInt(invoiceAmount)).toFixed(4)} QC</Text>
            )}
            <TextInput style={st.modalInput} value={invoiceMemo} onChangeText={setInvoiceMemo}
              placeholder="Memo (optional)" placeholderTextColor={c.signal.steel} />
            <View style={st.modalBtns}>
              <TouchableOpacity style={st.cancelBtn} onPress={() => setShowCreate(false)}>
                <Text style={st.cancelText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.confirmBtn} onPress={handleCreateInvoice}>
                <Text style={st.confirmText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Pay Invoice Modal */}
      <Modal visible={showPay} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>Pay Lightning Invoice</Text>
            <TextInput style={[st.modalInput, { height: 80 }]} value={payBolt11} onChangeText={setPayBolt11}
              placeholder="Paste BOLT11 invoice (lnbc...)" placeholderTextColor={c.signal.steel}
              multiline autoCapitalize="none" autoFocus />
            <Text style={st.convertHint}>Balance: {balanceSats.toLocaleString()} sats</Text>
            <View style={st.modalBtns}>
              <TouchableOpacity style={st.cancelBtn} onPress={() => setShowPay(false)}>
                <Text style={st.cancelText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.confirmBtn} onPress={handlePayInvoice}>
                <Text style={st.confirmText}>Pay</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Convert Modal */}
      <Modal visible={showConvert} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>Convert</Text>
            <View style={st.directionRow}>
              <TouchableOpacity style={[st.dirBtn, convertDirection === "toQC" && st.dirBtnActive]}
                onPress={() => setConvertDirection("toQC")}>
                <Text style={[st.dirText, convertDirection === "toQC" && st.dirTextActive]}>Sats -> QC</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.dirBtn, convertDirection === "toLN" && st.dirBtnActive]}
                onPress={() => setConvertDirection("toLN")}>
                <Text style={[st.dirText, convertDirection === "toLN" && st.dirTextActive]}>QC -> Sats</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={st.modalInput} value={convertAmount} onChangeText={setConvertAmount}
              placeholder={convertDirection === "toQC" ? "Amount (satoshis)" : "Amount (QC)"}
              placeholderTextColor={c.signal.steel} keyboardType="decimal-pad" autoFocus />
            {convertAmount && parseFloat(convertAmount) > 0 && (
              <Text style={st.convertHint}>
                = {convertDirection === "toQC"
                  ? `${satsToQC(parseFloat(convertAmount)).toFixed(4)} QC`
                  : `${qcToSats(parseFloat(convertAmount)).toLocaleString()} sats`}
              </Text>
            )}
            <View style={st.modalBtns}>
              <TouchableOpacity style={st.cancelBtn} onPress={() => setShowConvert(false)}>
                <Text style={st.cancelText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.confirmBtn} onPress={handleConvert}>
                <Text style={st.confirmText}>Convert</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.depth.void },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 60, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: c.border.subtle },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginRight: 8 },
  backText: { color: c.voice.gold, fontSize: 20, fontWeight: "600" },
  title: { color: c.signal.white, fontSize: 24, fontWeight: "700", fontFamily: "Georgia" },
  subtitle: { color: "#F7931A", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 },
  scroll: { flex: 1 },

  connectCard: { margin: 16, padding: 24, backgroundColor: c.depth.card, borderRadius: 16, borderWidth: 1, borderColor: "#F7931A", alignItems: "center" },
  connectTitle: { color: c.signal.white, fontSize: 18, fontWeight: "600", marginBottom: 8 },
  connectSub: { color: c.signal.steel, fontSize: 13, textAlign: "center", marginBottom: 16 },
  connectBtn: { backgroundColor: "#F7931A", paddingHorizontal: 32, paddingVertical: 12, borderRadius: 10 },
  connectBtnText: { color: c.signal.white, fontSize: 15, fontWeight: "600" },

  balanceCard: { margin: 16, padding: 24, backgroundColor: c.depth.card, borderRadius: 20, borderWidth: 1, borderColor: "#F7931A", alignItems: "center" },
  balanceLabel: { color: c.signal.steel, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  balanceAmount: { color: "#F7931A", fontSize: 36, fontWeight: "700", fontFamily: "Georgia", marginTop: 8 },
  balanceSub: { color: c.signal.steel, fontSize: 14, marginTop: 4 },
  balanceActions: { flexDirection: "row", gap: 16, marginTop: 20 },
  actionBtn: { alignItems: "center", backgroundColor: c.depth.elevated, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border.subtle },
  actionIcon: { color: "#F7931A", fontSize: 18, fontWeight: "600" },
  actionLabel: { color: c.signal.steel, fontSize: 10, marginTop: 4 },

  rateCard: { marginHorizontal: 16, marginBottom: 16, padding: 14, backgroundColor: c.depth.card, borderRadius: 12, borderWidth: 1, borderColor: c.border.subtle, alignItems: "center" },
  rateLabel: { color: c.signal.steel, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  rateValue: { color: c.signal.white, fontSize: 15, fontWeight: "600", marginTop: 4 },
  rateSub: { color: c.signal.steel, fontSize: 10, marginTop: 2 },

  invoiceCard: { margin: 16, padding: 20, backgroundColor: c.depth.card, borderRadius: 16, borderWidth: 1, borderColor: "#F7931A", alignItems: "center" },
  invoiceTitle: { color: c.signal.white, fontSize: 16, fontWeight: "600", marginBottom: 12 },
  qrBox: { padding: 12, backgroundColor: c.depth.elevated, borderRadius: 12 },
  invoiceAmount: { color: "#F7931A", fontSize: 20, fontWeight: "700", marginTop: 12 },
  invoiceMemo: { color: c.signal.steel, fontSize: 12, marginTop: 4 },
  invoiceBolt11: { color: c.signal.steel, fontSize: 9, fontFamily: "Courier", marginTop: 8, textAlign: "center" },
  dismissBtn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: c.border.subtle },
  dismissText: { color: c.signal.steel, fontSize: 13 },

  sectionTitle: { color: c.signal.white, fontSize: 16, fontWeight: "600", paddingHorizontal: 16, marginTop: 8, marginBottom: 8 },
  emptyText: { color: c.signal.steel, fontSize: 12, paddingHorizontal: 16 },

  historyRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border.subtle },
  historyDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  dotIn: { backgroundColor: "#22C55E" },
  dotOut: { backgroundColor: "#F7931A" },
  historyInfo: { flex: 1 },
  historyMemo: { color: c.signal.white, fontSize: 14 },
  historyStatus: { color: c.signal.steel, fontSize: 10, marginTop: 2 },
  historyAmount: { fontSize: 14, fontWeight: "600" },
  amountIn: { color: "#22C55E" },
  amountOut: { color: "#F7931A" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center" },
  modalBox: { width: 300, backgroundColor: c.depth.card, borderRadius: 20, padding: 28, borderWidth: 1, borderColor: c.border.subtle },
  modalTitle: { color: c.signal.white, fontSize: 18, fontWeight: "600", marginBottom: 16 },
  modalInput: { backgroundColor: c.depth.elevated, borderWidth: 1, borderColor: c.border.subtle, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: c.signal.white, fontSize: 15, marginBottom: 12 },
  convertHint: { color: "#F7931A", fontSize: 12, marginBottom: 12 },
  directionRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  dirBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: c.border.subtle, alignItems: "center" },
  dirBtnActive: { borderColor: "#F7931A", backgroundColor: "rgba(247,147,26,0.1)" },
  dirText: { color: c.signal.steel, fontSize: 13 },
  dirTextActive: { color: "#F7931A", fontWeight: "600" },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 4 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border.subtle, alignItems: "center" },
  cancelText: { color: c.signal.steel, fontSize: 14 },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: "#F7931A", alignItems: "center" },
  confirmText: { color: c.signal.white, fontSize: 14, fontWeight: "600" },
});
