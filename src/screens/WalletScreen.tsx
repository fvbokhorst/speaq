/**
 * SPEAQ - Wallet Screen
 * Q-Credits: send, receive, transaction history
 * Send Money
 */

import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, TextInput, Alert,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useThemedStyles, useTheme, ThemeColors } from "../theme/ThemeContext";
import { getIdentity, sendQCPayment } from "../services/speaq";
import { walletService, Transaction, Project, LinkedWallet } from "../services/wallet";
import { contactsService, Contact } from "../services/contacts";
import { t } from "../services/i18n";
import { fetchLiveGoldPrice, formatRelativeAge, GoldOracleSnapshot } from "../services/goldOracle";

interface Props {
  onOpenChat: (contactId: string, contactName: string) => void;
  onOpenTransactions: () => void;
  onOpenLightning: () => void;
}

export default function WalletScreen({ onOpenChat, onOpenTransactions, onOpenLightning }: Props) {
  const { colors: c } = useTheme();
  const st = useThemedStyles(makeStyles);
  const [balance, setBalance] = useState(walletService.getBalance());
  const [transactions, setTransactions] = useState<Transaction[]>(walletService.getTransactions());
  const [goldOracle, setGoldOracle] = useState<GoldOracleSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      fetchLiveGoldPrice().then((snap) => { if (!cancelled) setGoldOracle(snap); });
    };
    run();
    const interval = setInterval(run, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Live refresh balance every 5 seconds (for mining rewards)
  useEffect(() => {
    const interval = setInterval(() => {
      setBalance(walletService.getBalance());
      setTransactions(walletService.getTransactions());
    }, 5000);
    return () => clearInterval(interval);
  }, []);
  const [projects, setProjects] = useState<Project[]>(walletService.getProjects());
  const [linkedWallets, setLinkedWallets] = useState<LinkedWallet[]>(walletService.getLinkedWallets());
  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showLinkWallet, setShowLinkWallet] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [sendToName, setSendToName] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [receiveAmount, setReceiveAmount] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [walletType, setWalletType] = useState<LinkedWallet["type"]>("monero");
  const [walletAddress, setWalletAddress] = useState("");
  const [walletLabel, setWalletLabel] = useState("");
  const identity = getIdentity();

  function handleProceedToConfirm() {
    // Locale-tolerant parse: NL keyboards send "," as decimal separator,
    // but parseFloat only accepts "." Without this, "0,01" becomes NaN
    // and the validation falsely rejects valid amounts.
    const amount = parseFloat(parseFloat(sendAmount.replace(",", ".")).toFixed(8));
    if (!sendTo.trim() || isNaN(amount) || amount <= 0) {
      Alert.alert(t("invalid"), t("invalidRecipientAmount"));
      return;
    }
    // Use epsilon tolerance for floating point comparison
    if (amount > balance + 0.0001) {
      Alert.alert(t("insufficient"), t("youHaveQC").replace("%s", balance.toFixed(2)));
      return;
    }
    setShowSend(false);
    setShowConfirm(true);
  }

  async function handleConfirmSend() {
    // Locale-tolerant parse, see handleProceedToConfirm.
    const amount = parseFloat(sendAmount.replace(",", "."));
    const recipientId = sendTo.trim();
    const note = sendNote.trim();
    walletService.send(recipientId, amount, note);
    setBalance(walletService.getBalance());
    setTransactions(walletService.getTransactions());
    setShowConfirm(false);
    setSendTo("");
    setSendToName("");
    setSendAmount("");
    setSendNote("");
    Alert.alert(t("sentSuccess"), t("sentSuccessMsg").replace("%s", amount.toFixed(2)));
    try {
      await sendQCPayment(recipientId, amount, note);
    } catch (e) {
      console.error("[WalletScreen] sendQCPayment failed:", (e as Error).message);
    }
  }

  function handlePickContactForSend(contact: Contact) {
    setSendTo(contact.id);
    setSendToName(contact.name);
    setShowContactPicker(false);
    setShowSend(true);
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
    Alert.alert(project.name, `${t("balance")}: ${project.balance.toFixed(2)} QC`, [
      { text: t("fund"), onPress: () => {
        Alert.prompt(t("fundProject"), t("fundProjectMsg").replace("%s", balance.toFixed(2)), [
          { text: t("cancel"), style: "cancel" },
          { text: t("fund"), onPress: (val) => {
            const amount = parseFloat((val || "0").replace(",", "."));
            if (amount > 0 && walletService.fundProject(project.id, amount)) {
              setBalance(walletService.getBalance());
              setProjects(walletService.getProjects());
              setTransactions(walletService.getTransactions());
            }
          }},
        ], "plain-text", "", "decimal-pad");
      }},
      { text: t("withdraw"), onPress: () => {
        Alert.prompt(t("withdraw"), t("withdrawMsg").replace("%s", project.balance.toFixed(2)), [
          { text: t("cancel"), style: "cancel" },
          { text: t("withdraw"), onPress: (val) => {
            const amount = parseFloat((val || "0").replace(",", "."));
            if (amount > 0 && walletService.withdrawFromProject(project.id, amount)) {
              setBalance(walletService.getBalance());
              setProjects(walletService.getProjects());
              setTransactions(walletService.getTransactions());
            }
          }},
        ], "plain-text", "", "decimal-pad");
      }},
      { text: t("delete"), style: "destructive", onPress: () => {
        walletService.deleteProject(project.id);
        setBalance(walletService.getBalance());
        setProjects(walletService.getProjects());
      }},
      { text: t("cancel"), style: "cancel" },
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
        <Text style={st.title}>{t("wallet")}</Text>
        <Text style={st.headerSub}>{t("quantumPay")}</Text>
      </View>

      <ScrollView style={st.scrollArea} contentContainerStyle={st.scrollContent}>
        {/* Balance Card */}
        <View style={st.balanceCard}>
          <Text style={st.balanceLabel}>{t("qCredits")}</Text>
          <Text style={st.balanceAmount}>{balance.toFixed(2)}</Text>
          <Text style={st.balanceUsd}>~ {(balance * 0.01).toFixed(4)} gram gold</Text>
          <Text style={st.balanceOracle}>
            {goldOracle
              ? `Oracle: $${goldOracle.usdPerGram.toFixed(2)}/g · ${goldOracle.sourcesUsed.length} src · ${formatRelativeAge(goldOracle.timestamp)}`
              : "Oracle: offline"}
          </Text>
          <View style={st.balanceActions}>
            <TouchableOpacity style={st.actionBtn} onPress={() => setShowSend(true)}>
              <Text style={st.actionIcon}>S</Text>
              <Text style={st.actionLabel}>{t("send")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.actionBtn} onPress={() => setShowReceive(true)}>
              <Text style={st.actionIcon}>R</Text>
              <Text style={st.actionLabel}>{t("receive")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.actionBtn} onPress={() => setShowRequest(true)}>
              <Text style={st.actionIcon}>?</Text>
              <Text style={st.actionLabel}>{t("request")}</Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* Projects */}
        <View style={st.sectionRow}>
          <Text style={st.sectionTitle}>{t("projects")}</Text>
          <TouchableOpacity onPress={() => setShowNewProject(true)}>
            <Text style={st.sectionAdd}>{t("new")}</Text>
          </TouchableOpacity>
        </View>
        {projects.length === 0 ? (
          <View style={st.emptySmall}>
            <Text style={st.emptySub}>{t("noProjectsYet")}</Text>
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

        {/* Lightning Network */}
        <TouchableOpacity style={st.lightningCard} onPress={onOpenLightning}>
          <Text style={st.lightningIcon}>L</Text>
          <View style={{ flex: 1 }}>
            <Text style={st.lightningTitle}>Lightning Network</Text>
            <Text style={st.lightningSub}>Bitcoin instant payments</Text>
          </View>
          <Text style={{ color: "#F7931A", fontSize: 14 }}>{">"}</Text>
        </TouchableOpacity>

        {/* Linked Wallets */}
        <View style={st.sectionRow}>
          <Text style={st.sectionTitle}>{t("linkedWallets")}</Text>
          <TouchableOpacity onPress={() => setShowLinkWallet(true)}>
            <Text style={st.sectionAdd}>{t("link")}</Text>
          </TouchableOpacity>
        </View>
        {linkedWallets.length === 0 ? (
          <View style={st.emptySmall}>
            <Text style={st.emptySub}>{t("linkWalletHint")}</Text>
          </View>
        ) : (
          linkedWallets.map((w) => (
            <View key={w.id} style={st.walletCard}>
              <View style={[st.walletDot, { backgroundColor: WALLET_TYPES.find((t) => t.key === w.type)?.color || c.voice.gold }]} />
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
          <Text style={st.sectionTitle}>{t("recent")}</Text>
          <TouchableOpacity onPress={onOpenTransactions}>
            <Text style={st.sectionAdd}>{t("viewAll")}</Text>
          </TouchableOpacity>
        </View>
        {transactions.length === 0 ? (
          <View style={st.emptySmall}>
            <Text style={st.emptySub}>{t("noTransactions")}</Text>
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
            <Text style={st.modalTitle}>{t("sendQCredits")}</Text>
            <TouchableOpacity style={st.contactPickBtn} onPress={() => { setShowSend(false); setShowContactPicker(true); }}>
              <Text style={st.contactPickText}>{sendToName || t("chooseContact")}</Text>
              <Text style={st.contactPickArrow}>{">"}</Text>
            </TouchableOpacity>
            {!sendToName && (
              <TextInput style={st.modalInput} value={sendTo} onChangeText={setSendTo}
                placeholder={t("enterSpeaqId")} placeholderTextColor={c.signal.steel} autoCapitalize="none" />
            )}
            <TextInput style={st.modalInput} value={sendAmount} onChangeText={setSendAmount}
              placeholder={t("amountQC")} placeholderTextColor={c.signal.steel} keyboardType="decimal-pad" />
            <TextInput style={st.modalInput} value={sendNote} onChangeText={setSendNote}
              placeholder={t("noteOptional")} placeholderTextColor={c.signal.steel} />
            <Text style={st.balanceHint}>{t("available")}: {balance.toFixed(2)} QC</Text>
            <View style={st.modalBtns}>
              <TouchableOpacity style={st.cancelBtn} onPress={() => { setShowSend(false); setSendTo(""); setSendToName(""); setSendAmount(""); setSendNote(""); }}>
                <Text style={st.cancelText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.confirmBtn} onPress={handleProceedToConfirm}>
                <Text style={st.confirmText}>{t("next")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm Send Modal */}
      <Modal visible={showConfirm} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>{t("confirmPayment")}</Text>
            <View style={st.confirmCard}>
              <Text style={st.confirmAmount}>{parseFloat((sendAmount || "0").replace(",", ".")).toFixed(2)}</Text>
              <Text style={st.confirmQC}>Q-Credits</Text>
              <View style={st.confirmDivider} />
              <Text style={st.confirmLabel}>{t("to")}</Text>
              <Text style={st.confirmValue}>{sendToName || sendTo}</Text>
              {sendNote ? <>
                <Text style={st.confirmLabel}>{t("note")}</Text>
                <Text style={st.confirmValue}>{sendNote}</Text>
              </> : null}
              <Text style={st.confirmLabel}>{t("remaining")}</Text>
              <Text style={st.confirmValue}>{(balance - parseFloat((sendAmount || "0").replace(",", "."))).toFixed(2)} QC</Text>
            </View>
            <View style={st.modalBtns}>
              <TouchableOpacity style={st.cancelBtn} onPress={() => { setShowConfirm(false); setShowSend(true); }}>
                <Text style={st.cancelText}>{t("back")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.confirmBtnGold} onPress={handleConfirmSend}>
                <Text style={st.confirmText}>{t("confirm")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Contact Picker for Send */}
      <Modal visible={showContactPicker} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>{t("selectContact")}</Text>
            {contactsService.getContacts().length === 0 ? (
              <Text style={st.emptySub}>{t("noContactsYet")}</Text>
            ) : (
              <ScrollView style={{ maxHeight: 300, width: "100%" }}>
                {contactsService.getContacts().map((c) => (
                  <TouchableOpacity key={c.id} style={st.contactRow} onPress={() => handlePickContactForSend(c)}>
                    <View style={st.contactAvatar}><Text style={st.contactInit}>{c.name.charAt(0).toUpperCase()}</Text></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.contactName} numberOfLines={1}>{c.name || c.id.substring(0, 12)}</Text>
                      <Text style={st.contactId} numberOfLines={1}>{c.id}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={[st.cancelBtn, { marginTop: 12 }]} onPress={() => { setShowContactPicker(false); setShowSend(true); }}>
              <Text style={st.cancelText}>{t("cancel")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Request Payment Modal */}
      <Modal visible={showRequest} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>{t("requestPayment")}</Text>
            <Text style={st.modalSub}>{t("requestPaymentSub")}</Text>
            <TextInput style={st.modalInput} value={receiveAmount} onChangeText={setReceiveAmount}
              placeholder={t("amountQC")} placeholderTextColor={c.signal.steel} keyboardType="decimal-pad" />
            {receiveAmount && parseFloat(receiveAmount) > 0 && (
              <View style={st.qrBox}>
                <QRCode
                  value={`speaq-pay://${identity?.speaqId || "unknown"}?amount=${receiveAmount}`}
                  size={160}
                  backgroundColor={c.depth.card}
                  color={c.voice.gold}
                />
                <Text style={st.qrAmountText}>{parseFloat(receiveAmount).toFixed(2)} QC</Text>
              </View>
            )}
            <TouchableOpacity style={[st.cancelBtn, { marginTop: 12 }]} onPress={() => { setShowRequest(false); setReceiveAmount(""); }}>
              <Text style={st.cancelText}>{t("close")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* New Project Modal */}
      <Modal visible={showNewProject} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>{t("newProject")}</Text>
            <TextInput style={st.modalInput} value={projectName} onChangeText={setProjectName}
              placeholder={t("projectName")} placeholderTextColor={c.signal.steel} autoFocus />
            <TextInput style={st.modalInput} value={projectDesc} onChangeText={setProjectDesc}
              placeholder={t("description")} placeholderTextColor={c.signal.steel} />
            <View style={st.modalBtns}>
              <TouchableOpacity style={st.cancelBtn} onPress={() => setShowNewProject(false)}>
                <Text style={st.cancelText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.confirmBtn, !projectName.trim() && { opacity: 0.3 }]}
                onPress={handleCreateProject} disabled={!projectName.trim()}>
                <Text style={st.confirmText}>{t("create")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Link Wallet Modal */}
      <Modal visible={showLinkWallet} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>{t("linkCryptoWallet")}</Text>
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
              placeholderTextColor={c.signal.steel} autoCapitalize="none" />
            <TextInput style={st.modalInput} value={walletLabel} onChangeText={setWalletLabel}
              placeholder={t("labelOptional")} placeholderTextColor={c.signal.steel} />
            <View style={st.modalBtns}>
              <TouchableOpacity style={st.cancelBtn} onPress={() => setShowLinkWallet(false)}>
                <Text style={st.cancelText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.confirmBtn, !walletAddress.trim() && { opacity: 0.3 }]}
                onPress={handleLinkWallet} disabled={!walletAddress.trim()}>
                <Text style={st.confirmText}>{t("link")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Receive Modal */}
      <Modal visible={showReceive} transparent animationType="fade">
        <View style={st.modalOverlay}>
          <View style={st.modalBox}>
            <Text style={st.modalTitle}>{t("receiveQCredits")}</Text>
            <View style={st.qrBox}>
              <QRCode
                value={`speaq-pay://${identity?.speaqId || "unknown"}`}
                size={180}
                backgroundColor={c.depth.card}
                color={c.voice.gold}
              />
            </View>
            <Text style={st.qrId}>{identity?.speaqId || "No ID"}</Text>
            <Text style={st.qrHint}>{t("shareQrHint")}</Text>
            <TouchableOpacity style={st.cancelBtn} onPress={() => setShowReceive(false)}>
              <Text style={st.cancelText}>{t("close")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.depth.void },
  header: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: c.border.subtle },
  title: { color: c.signal.white, fontSize: 28, fontWeight: "700", fontFamily: "Georgia" },
  headerSub: { fontSize: 11, color: c.quantum.teal, letterSpacing: 2, textTransform: "uppercase", marginTop: 2 },

  balanceCard: { margin: 16, padding: 24, backgroundColor: c.depth.card, borderRadius: 20, borderWidth: 1, borderColor: c.voice.gold, alignItems: "center" },
  balanceLabel: { color: c.signal.steel, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  balanceAmount: { color: c.voice.gold, fontSize: 48, fontWeight: "700", fontFamily: "Georgia", marginTop: 8 },
  balanceUsd: { color: c.signal.steel, fontSize: 14, marginTop: 4 },
  balanceOracle: { color: c.signal.steel, fontSize: 10, marginTop: 4, opacity: 0.7 },
  balanceActions: { flexDirection: "row", gap: 24, marginTop: 20 },
  actionBtn: { alignItems: "center", backgroundColor: c.depth.elevated, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border.subtle },
  actionIcon: { color: c.voice.gold, fontSize: 18, fontWeight: "600" },
  actionLabel: { color: c.signal.steel, fontSize: 10, marginTop: 4 },

  scrollArea: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, marginTop: 20, marginBottom: 8 },
  sectionTitle: { color: c.signal.white, fontSize: 16, fontWeight: "600" },
  sectionAdd: { color: c.voice.gold, fontSize: 13, fontWeight: "600" },

  lightningCard: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 16, padding: 16, backgroundColor: c.depth.card, borderRadius: 12, borderWidth: 1, borderColor: "#F7931A" },
  lightningIcon: { color: "#F7931A", fontSize: 24, fontWeight: "700", marginRight: 14 },
  lightningTitle: { color: c.signal.white, fontSize: 15, fontWeight: "600" },
  lightningSub: { color: c.signal.steel, fontSize: 11, marginTop: 2 },
  emptySmall: { paddingHorizontal: 24, paddingVertical: 12 },
  emptySub: { color: c.signal.steel, fontSize: 12 },

  projectCard: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8, padding: 16, backgroundColor: c.depth.card, borderRadius: 12, borderWidth: 1, borderColor: c.border.subtle },
  projectInfo: { flex: 1 },
  projectName: { color: c.signal.white, fontSize: 15, fontWeight: "600" },
  projectDesc: { color: c.signal.steel, fontSize: 11, marginTop: 2 },
  projectBalance: { color: c.voice.gold, fontSize: 16, fontWeight: "700", fontFamily: "Georgia" },

  walletCard: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8, padding: 14, backgroundColor: c.depth.card, borderRadius: 12, borderWidth: 1, borderColor: c.border.subtle },
  walletDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  walletInfo: { flex: 1 },
  walletLabel: { color: c.signal.white, fontSize: 14, fontWeight: "500" },
  walletAddr: { color: c.signal.steel, fontSize: 10, fontFamily: "Courier", marginTop: 2 },
  walletUnlink: { color: c.signal.red, fontSize: 16, fontWeight: "600", paddingHorizontal: 8 },
  walletTypeRow: { flexDirection: "row", gap: 8, marginBottom: 12, width: "100%" },
  walletTypeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: c.border.subtle, alignItems: "center" },
  walletTypeTxt: { color: c.signal.steel, fontSize: 10, fontWeight: "600" },
  txRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border.subtle },
  txIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 12 },
  txIn: { backgroundColor: "rgba(34,197,94,0.15)" },
  txOut: { backgroundColor: "rgba(239,68,68,0.15)" },
  txIconText: { fontSize: 18, fontWeight: "600", color: c.signal.white },
  txInfo: { flex: 1 },
  txPeer: { color: c.signal.white, fontSize: 14, fontWeight: "500" },
  txNote: { color: c.signal.steel, fontSize: 11, marginTop: 2 },
  txRight: { alignItems: "flex-end" },
  txAmount: { fontSize: 14, fontWeight: "600" },
  txAmountIn: { color: "#22C55E" },
  txAmountOut: { color: c.signal.red },
  txTime: { color: c.signal.steel, fontSize: 10, marginTop: 2 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center" },
  modalBox: { width: 300, backgroundColor: c.depth.card, borderRadius: 20, padding: 28, borderWidth: 1, borderColor: c.border.subtle, alignItems: "center" },
  modalTitle: { color: c.signal.white, fontSize: 18, fontWeight: "600", marginBottom: 16 },
  modalInput: { width: "100%", backgroundColor: c.depth.elevated, borderWidth: 1, borderColor: c.border.subtle, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: c.signal.white, fontSize: 15, marginBottom: 12 },
  modalBtns: { flexDirection: "row", gap: 12, marginTop: 4, width: "100%" },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: "#0F172A", backgroundColor: "#FFFFFF", alignItems: "center" },
  cancelText: { color: "#0F172A", fontSize: 14, fontWeight: "700" },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: "#D4A853", alignItems: "center" },
  confirmText: { color: "#0F172A", fontSize: 14, fontWeight: "700" },

  contactPickBtn: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: c.depth.elevated, borderWidth: 1.5, borderColor: c.quantum.teal, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 12 },
  contactPickText: { color: c.signal.white, fontSize: 15, fontWeight: "500" },
  contactPickArrow: { color: c.voice.gold, fontSize: 16, fontWeight: "600" },
  balanceHint: { color: c.signal.steel, fontSize: 11, marginBottom: 8, alignSelf: "flex-start" },
  confirmCard: { width: "100%", backgroundColor: c.depth.elevated, borderRadius: 12, padding: 20, marginBottom: 16, alignItems: "center" },
  confirmAmount: { color: c.voice.gold, fontSize: 40, fontWeight: "700", fontFamily: "Georgia" },
  confirmQC: { color: c.voice.gold, fontSize: 14, letterSpacing: 1, marginTop: 2 },
  confirmDivider: { width: "100%", height: 1, backgroundColor: c.border.subtle, marginVertical: 16 },
  confirmLabel: { color: c.signal.steel, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 8 },
  confirmValue: { color: c.signal.white, fontSize: 15, fontWeight: "500", marginTop: 2 },
  confirmBtnGold: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: "#D4A853", alignItems: "center" },
  contactRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: c.border.subtle, width: "100%" },
  contactAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.depth.elevated, alignItems: "center", justifyContent: "center", marginRight: 14, borderWidth: 1, borderColor: c.quantum.teal },
  contactInit: { color: c.quantum.teal, fontSize: 16, fontWeight: "600" },
  contactName: { color: c.signal.white, fontSize: 16, fontWeight: "700", flexShrink: 1 },
  contactId: { color: c.signal.steel, fontSize: 11, fontFamily: "Courier", marginTop: 2 },
  modalSub: { color: c.signal.steel, fontSize: 11, marginBottom: 16 },
  qrAmountText: { color: c.voice.gold, fontSize: 18, fontWeight: "600", marginTop: 12 },
  qrBox: { padding: 16, backgroundColor: c.depth.elevated, borderRadius: 16, marginBottom: 16, alignItems: "center" },
  qrId: { color: c.voice.gold, fontSize: 14, fontFamily: "Courier", marginBottom: 8 },
  qrHint: { color: c.signal.steel, fontSize: 11, textAlign: "center", marginBottom: 16 },
});
