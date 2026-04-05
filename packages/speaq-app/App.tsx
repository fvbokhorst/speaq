/**
 * SPEAQ - Quantum Freedom Platform
 * Flow: Welcome (first time) -> PIN setup -> Main
 * Next time: PIN enter -> Main
 */

import React, { useState, useEffect } from "react";
import { StatusBar, View, StyleSheet, TouchableOpacity, Text, Alert } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import WelcomeScreen from "./src/screens/WelcomeScreen";
import ChatListScreen from "./src/screens/ChatListScreen";
import ChatScreen from "./src/screens/ChatScreen";
import ContactsScreen from "./src/screens/ContactsScreen";
import CallScreen from "./src/screens/CallScreen";
import WalletScreen from "./src/screens/WalletScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import AdvancedScreen from "./src/screens/AdvancedScreen";
import { ChatIcon, ContactIcon, WalletIcon, SettingsIcon } from "./src/components/Icons";
import { colors } from "./src/theme/brand";
import { createIdentity, getIdentity, loadIdentity } from "./src/services/speaq";
import { callService } from "./src/services/call";
import { walletService } from "./src/services/wallet";
import { contactsService } from "./src/services/contacts";
import { advancedService } from "./src/services/advanced";
import { loadBlocked } from "./src/services/blocked";

function App() {
  const [phase, setPhase] = useState<"loading" | "welcome" | "pin-setup" | "pin-enter" | "main">("loading");
  const [activeTab, setActiveTab] = useState("chats");
  const [chatContactId, setChatContactId] = useState("");
  const [chatContactName, setChatContactName] = useState("");
  const [inCall, setInCall] = useState(false);
  const [callIsVideo, setCallIsVideo] = useState(false);
  const [callIsIncoming, setCallIsIncoming] = useState(false);
  const [callContactName, setCallContactName] = useState("");
  const [pin, setPin] = useState("");
  const [savedPin, setSavedPin] = useState("");
  const [pinStep, setPinStep] = useState<"create" | "confirm">("create");
  const [tempPin, setTempPin] = useState("");

  // Check if user is registered on startup + load wallet
  useEffect(() => {
    walletService.load().then(() => walletService.addWelcomeBonus());
    contactsService.load();
    advancedService.load();
    loadIdentity();
    loadBlocked();
    AsyncStorage.getItem("speaq_pin").then((storedPin) => {
      if (storedPin) {
        setSavedPin(storedPin);
        setPhase("pin-enter");
      } else {
        setPhase("welcome");
      }
    });
  }, []);

  // Listen for incoming calls
  useEffect(() => {
    const onIncoming = (data: any) => {
      setCallContactName(data.from);
      setCallIsVideo(data.video || false);
      setCallIsIncoming(true);
      setInCall(true);
    };
    callService.on("incomingCall", onIncoming);
    return () => callService.off("incomingCall", onIncoming);
  }, []);

  function handleStartCall(video: boolean) {
    callService.startCall(chatContactId, video);
    setCallContactName(chatContactName);
    setCallIsVideo(video);
    setCallIsIncoming(false);
    setInCall(true);
  }

  function handlePinDigit(d: string) {
    if (pin.length < 6) setPin(pin + d);
  }

  function handlePinDelete() {
    setPin(pin.slice(0, -1));
  }

  function handlePinSubmit() {
    if (phase === "pin-setup") {
      if (pinStep === "create") {
        if (pin.length < 4) return;
        setTempPin(pin);
        setPin("");
        setPinStep("confirm");
      } else {
        if (pin === tempPin) {
          setSavedPin(pin);
          AsyncStorage.setItem("speaq_pin", pin);
          setPin("");
          setPhase("main");
        } else {
          Alert.alert("PINs don't match", "Try again.");
          setPin("");
          setPinStep("create");
          setTempPin("");
        }
      }
    } else if (phase === "pin-enter") {
      if (pin === savedPin) {
        setPin("");
        setPhase("main");
      } else {
        Alert.alert("Wrong PIN");
        setPin("");
      }
    }
  }

  // Loading
  if (phase === "loading") {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <View style={st.lockContainer}>
          <View style={st.lockLogo}>
            <Text style={st.lockSpea}>SPEA</Text>
            <View style={st.lockQC}><Text style={st.lockQL}>Q</Text><View style={st.lockQB} /></View>
          </View>
        </View>
      </SafeAreaProvider>
    );
  }

  // Welcome (first time)
  if (phase === "welcome") {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <WelcomeScreen onCreateIdentity={(name: string) => {
          const id = createIdentity(name);
          Alert.alert("Welcome " + name, `SPEAQ ID: ${id?.speaqId}\n\nNow set a PIN to secure your identity.`,
            [{ text: "Set PIN", onPress: () => setPhase("pin-setup") }]);
        }} />
      </SafeAreaProvider>
    );
  }

  // PIN screen (setup or enter)
  if (phase === "pin-setup" || phase === "pin-enter") {
    const title = phase === "pin-setup"
      ? (pinStep === "create" ? "Set Your PIN" : "Confirm Your PIN")
      : "Enter PIN";
    const sub = phase === "pin-setup"
      ? (pinStep === "create" ? "Secure your quantum identity" : "Enter the same PIN again")
      : "Unlock SPEAQ";

    return (
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <View style={st.lockContainer}>
          <View style={st.lockLogo}>
            <Text style={st.lockSpea}>SPEA</Text>
            <View style={st.lockQC}><Text style={st.lockQL}>Q</Text><View style={st.lockQB} /></View>
          </View>
          <Text style={st.lockTitle}>{title}</Text>
          <Text style={st.lockSub}>{sub}</Text>
          <View style={st.dots}>
            {[0,1,2,3,4,5].map(i => <View key={i} style={[st.dot, i < pin.length && st.dotFull]} />)}
          </View>
          <View style={st.numpad}>
            {["1","2","3","4","5","6","7","8","9","","0","del"].map(k => (
              <TouchableOpacity key={k||"x"} style={[st.nk, !k && st.nkHide]} disabled={!k}
                onPress={() => k === "del" ? handlePinDelete() : k ? handlePinDigit(k) : null} activeOpacity={0.6}>
                <Text style={st.nkTxt}>{k === "del" ? "←" : k}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {pin.length >= 4 && (
            <TouchableOpacity style={st.unlockBtn} onPress={handlePinSubmit} activeOpacity={0.8}>
              <Text style={st.unlockTxt}>{phase === "pin-setup" ? (pinStep === "create" ? "Next" : "Set PIN") : "Unlock"}</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaProvider>
    );
  }

  // Main App
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <View style={st.container}>
        {activeTab === "chats" && <ChatListScreen onOpenChat={(id: string, name: string) => {
          setChatContactId(id);
          setChatContactName(name);
          setActiveTab("chat");
        }} />}
        {activeTab === "chat" && !inCall && <ChatScreen contactId={chatContactId} contactName={chatContactName} onBack={() => setActiveTab("chats")} onCall={handleStartCall} />}
        {inCall && <CallScreen contactName={callContactName} isVideo={callIsVideo} isIncoming={callIsIncoming} onEnd={() => setInCall(false)} />}
        {activeTab === "contacts" && <ContactsScreen onOpenChat={(id: string, name: string) => {
          setChatContactId(id);
          setChatContactName(name);
          setActiveTab("chat");
        }} />}
        {activeTab === "wallet" && <WalletScreen onOpenChat={(id, name) => {
          setChatContactId(id);
          setChatContactName(name);
          setActiveTab("chat");
        }} />}
        {activeTab === "settings" && <SettingsScreen onLogout={() => {
          setPhase("welcome");
          setActiveTab("chats");
        }} onOpenAdvanced={() => setActiveTab("advanced")} />}
        {activeTab === "advanced" && <AdvancedScreen onBack={() => setActiveTab("settings")} />}
        <View style={st.nav}>
          <Tab icon={<ChatIcon active={activeTab === "chats"} />} label="Chats" active={activeTab === "chats"} onPress={() => setActiveTab("chats")} />
          <Tab icon={<ContactIcon active={activeTab === "contacts"} />} label="Contacts" active={activeTab === "contacts"} onPress={() => setActiveTab("contacts")} />
          <Tab icon={<WalletIcon active={activeTab === "wallet"} />} label="Wallet" active={activeTab === "wallet"} onPress={() => setActiveTab("wallet")} />
          <Tab icon={<SettingsIcon active={activeTab === "settings"} />} label="Settings" active={activeTab === "settings"} onPress={() => setActiveTab("settings")} />
        </View>
      </View>
    </SafeAreaProvider>
  );
}

function Tab({ icon, label, active, onPress }: { icon: React.ReactNode; label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={st.tab} onPress={onPress} activeOpacity={0.7}>
      {icon}
      <Text style={[st.tabLbl, active && st.tabAct]}>{label}</Text>
      {active && <View style={st.tabDot} />}
    </TouchableOpacity>
  );
}

function PH({ title }: { title: string }) {
  return <View style={st.ph}><Text style={st.phT}>{title}</Text><Text style={st.phS}>Coming soon</Text></View>;
}

const st = StyleSheet.create({
  lockContainer: { flex: 1, backgroundColor: colors.depth.void, alignItems: "center", justifyContent: "center" },
  lockLogo: { flexDirection: "row", alignItems: "center", marginBottom: 32 },
  lockSpea: { fontSize: 28, fontWeight: "700", fontFamily: "Georgia", color: colors.signal.white },
  lockQC: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.voice.gold, alignItems: "center", justifyContent: "center", marginLeft: 2 },
  lockQL: { fontSize: 22, fontWeight: "700", fontFamily: "Georgia", color: colors.voice.gold, marginTop: -1 },
  lockQB: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.quantum.teal, position: "absolute", bottom: 5, right: 7 },
  lockTitle: { color: colors.signal.white, fontSize: 20, fontWeight: "600", marginBottom: 6 },
  lockSub: { color: colors.signal.steel, fontSize: 12, marginBottom: 32 },
  dots: { flexDirection: "row", gap: 12, marginBottom: 40 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: colors.voice.gold },
  dotFull: { backgroundColor: colors.voice.gold },
  numpad: { flexDirection: "row", flexWrap: "wrap", width: 240, justifyContent: "center" },
  nk: { width: 72, height: 56, alignItems: "center", justifyContent: "center", margin: 4, borderRadius: 12, backgroundColor: colors.depth.card },
  nkHide: { backgroundColor: "transparent" },
  nkTxt: { color: colors.signal.white, fontSize: 24, fontWeight: "400" },
  unlockBtn: { backgroundColor: colors.voice.gold, paddingHorizontal: 40, paddingVertical: 12, borderRadius: 12, marginTop: 24 },
  unlockTxt: { color: colors.depth.void, fontSize: 15, fontWeight: "600" },
  container: { flex: 1, backgroundColor: colors.depth.void },
  nav: { flexDirection: "row", backgroundColor: colors.depth.void, borderTopWidth: 1, borderTopColor: colors.border.subtle, paddingBottom: 24, paddingTop: 10 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 4 },
  tabLbl: { fontSize: 10, color: colors.signal.steel, marginTop: 4, letterSpacing: 0.5 },
  tabAct: { color: colors.voice.gold },
  tabDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.voice.gold, marginTop: 3 },
  ph: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.depth.void },
  phT: { color: colors.signal.white, fontSize: 20, fontWeight: "500" },
  phS: { color: colors.signal.steel, fontSize: 12, marginTop: 8 },
});

export default App;
