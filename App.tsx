/**
 * SPEAQ - Quantum Freedom Platform
 * Flow: Welcome (first time) -> PIN setup -> Main
 * Next time: PIN enter -> Main
 */

import "react-native-get-random-values"; // Must be first - crypto polyfill
import React, { useState, useEffect } from "react";
import { StatusBar, View, StyleSheet, TouchableOpacity, Text, Alert, Linking, Modal, ActivityIndicator } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import EulaScreen from "./src/screens/EulaScreen";
import WelcomeScreen from "./src/screens/WelcomeScreen";
import ChatListScreen from "./src/screens/ChatListScreen";
import ChatScreen from "./src/screens/ChatScreen";
import ContactsScreen from "./src/screens/ContactsScreen";
import CallScreen from "./src/screens/CallScreen";
import WalletScreen from "./src/screens/WalletScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import AdvancedScreen from "./src/screens/AdvancedScreen";
import TransactionsScreen from "./src/screens/TransactionsScreen";
import GroupsScreen from "./src/screens/GroupsScreen";
import VaultScreen from "./src/screens/VaultScreen";
import MiningScreen from "./src/screens/MiningScreen";
import InfoScreen from "./src/screens/InfoScreen";
import LightningScreen from "./src/screens/LightningScreen";
import BrowserScreen from "./src/screens/BrowserScreen";
import { ChatIcon, ContactIcon, WalletIcon, MiningIcon, SettingsIcon } from "./src/components/Icons";
import { ThemeProvider, useThemedStyles } from "./src/theme/ThemeContext";
import { createIdentity, getIdentity, loadIdentity } from "./src/services/speaq";
import { callService } from "./src/services/call";
import { walletService } from "./src/services/wallet";
import { initWalletReceiveListener } from "./src/services/walletReceiveListener";
import { contactsService } from "./src/services/contacts";
import { seedDemoConversationIfNeeded } from "./src/services/demo-seed";
import { advancedService } from "./src/services/advanced";
import { loadBlocked } from "./src/services/blocked";
import { loadGroups } from "./src/services/groups";
import { loadLightning } from "./src/services/lightning";
import { loadMining, startMining } from "./src/services/mining";
import { loadLanguage, t } from "./src/services/i18n";
import { loadProfile } from "./src/services/profile";
import { setNormalPin } from "./src/services/vault";
import { setKeystorePin } from "./src/services/crypto";

// Multi-phase status messages shown while PIN-derivation + identity-load is
// running. Rotated every 2 seconds so Apple App Review sees text change and
// does not interpret a 1-3 second native PBKDF2 + AsyncStorage decrypt as a
// frozen app. Mirrors the WelcomeScreen pattern that resolved earlier 2.1(a)
// rejections during identity-creation.
const PIN_PROCESSING_PHASES = [
  "Securing your PIN",
  "Deriving encryption key (PBKDF2)",
  "Decrypting keystore",
  "Loading quantum-secure identity",
  "Connecting to SPEAQ network",
];

function App() {
  const st = useThemedStyles(makeAppStyles);
  const [phase, setPhase] = useState<"loading" | "onboarding" | "eula" | "welcome" | "pin-setup" | "pin-enter" | "main">("loading");
  const [activeTab, setActiveTab] = useState("chats");
  const [chatContactId, setChatContactId] = useState("");
  const [chatContactName, setChatContactName] = useState("");
  const [inCall, setInCall] = useState(false);
  const [callIsVideo, setCallIsVideo] = useState(false);
  const [callIsIncoming, setCallIsIncoming] = useState(false);
  const [callContactName, setCallContactName] = useState("");
  const [langKey, setLangKey] = useState(0); // force re-render on language change
  const [pendingConnectId, setPendingConnectId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [savedPin, setSavedPin] = useState("");
  const [pinStep, setPinStep] = useState<"create" | "confirm">("create");
  const [tempPin, setTempPin] = useState("");
  // Apple App Review fix 2026-05-06: progress overlay during PIN-submit flow.
  // Reviewer 2026-05-05 marked the app as "frozen" because setKeystorePin
  // (PBKDF2 100k via CryptoJS) blocked the JS thread for 1500-2500ms with
  // no UI feedback. This overlay shows immediately on PIN-confirm tap and
  // rotates phase messages so the reviewer always sees progression.
  const [pinProcessing, setPinProcessing] = useState(false);
  const [pinProcessingPhase, setPinProcessingPhase] = useState(0);
  const [pinProcessingSoftWarn, setPinProcessingSoftWarn] = useState(false);
  const [pinProcessingTimedOut, setPinProcessingTimedOut] = useState(false);

  // Rotate processing phase messages during PIN-submit. Apple reviewers
  // need to see motion or text-change during any work that takes more
  // than ~2 seconds, otherwise they mark the app as frozen.
  useEffect(() => {
    if (!pinProcessing) return;
    setPinProcessingPhase(0);
    setPinProcessingSoftWarn(false);
    setPinProcessingTimedOut(false);
    const rotator = setInterval(() => {
      setPinProcessingPhase((p) => (p + 1) % PIN_PROCESSING_PHASES.length);
    }, 2000);
    const softWarn = setTimeout(() => setPinProcessingSoftWarn(true), 5000);
    const hardTimeout = setTimeout(() => setPinProcessingTimedOut(true), 30000);
    return () => {
      clearInterval(rotator);
      clearTimeout(softWarn);
      clearTimeout(hardTimeout);
    };
  }, [pinProcessing]);

  // Handle deep links: speaq://connect/[id]
  useEffect(() => {
    function handleUrl(event: { url: string }) {
      const url = event.url;
      if (url.includes("connect/")) {
        const id = url.split("connect/").pop()?.split("?")[0] || "";
        if (id.length >= 8) setPendingConnectId(id);
      }
    }
    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => { if (url) handleUrl({ url }); });
    // Listen for deep links while app is running
    const sub = Linking.addEventListener("url", handleUrl);
    return () => sub.remove();
  }, []);

  // When main screen loads and there's a pending connect, switch to contacts tab
  useEffect(() => {
    if (phase === "main" && pendingConnectId) {
      setActiveTab("contacts");
      // ContactsScreen will receive the pendingConnectId via props
    }
  }, [phase, pendingConnectId]);

  // Check if user is registered on startup + load wallet
  useEffect(() => {
    walletService.load().then(() => {
      loadMining(); // Mining must start AFTER wallet is loaded
      // App-level QC-receive subscriber: ensures incoming QC payments are
      // credited to the wallet regardless of which screen is active. Mirrors
      // PWA app-level handler at speaq-web/src/app/app/page.tsx:1306.
      // Pre-1.0.7 only ChatScreen mounted on the right contact would credit;
      // anything else dropped silently. See SPEAQ_F1-F5_Implementation_2026-05-08.md
      initWalletReceiveListener();
    });
    contactsService.load();
    advancedService.load(); // awaited internally - checks Dead Man's Switch on startup
    // Note: loadIdentity() is deferred until handlePinSubmit() because
    // loadKyberKeyPair() inside requires the keystore PIN to be set first
    // (FIPS 203 audit hardening 2026-04-25). Calling it before PIN entry
    // throws "[Crypto] Keystore PIN not set" and surfaces a red error toast.
    loadBlocked();
    loadProfile();
    loadGroups();
    loadLanguage();
    loadLightning();
    AsyncStorage.getItem("speaq_pin").then(async (storedPin) => {
      const eulaAccepted = await AsyncStorage.getItem("speaq_eula_v1_accepted_at");
      if (storedPin) {
        setSavedPin(storedPin);
        // Existing PIN but no EULA acceptance recorded (upgrade case): force the gate.
        setPhase(eulaAccepted ? "pin-enter" : "eula");
      } else {
        const seen = await AsyncStorage.getItem("speaq_onboarding_done");
        if (!seen) {
          setPhase("onboarding");
        } else if (!eulaAccepted) {
          setPhase("eula");
        } else {
          setPhase("welcome");
        }
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

  // Yield two animation frames so React Native paints the processing
  // overlay before we kick off any synchronous JS work (PBKDF2 fallback,
  // AsyncStorage decrypt, etc). Without this, setPinProcessing(true) and
  // the heavy work happen in the same tick and the user sees nothing.
  function yieldFrames(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  async function handlePinSubmit() {
    if (phase === "pin-setup") {
      if (pinStep === "create") {
        if (pin.length < 4) return;
        setTempPin(pin);
        setPin("");
        setPinStep("confirm");
      } else {
        if (pin === tempPin) {
          setPinProcessing(true);
          await yieldFrames();
          const tStart = Date.now();
          console.warn("[TIMING] handlePinSubmit pin-setup confirm START");
          try {
            setSavedPin(pin);
            setNormalPin(pin);
            console.warn("[TIMING] handlePinSubmit setNormalPin done after " + (Date.now() - tStart) + "ms");
            await setKeystorePin(pin);
            console.warn("[TIMING] handlePinSubmit setKeystorePin done after " + (Date.now() - tStart) + "ms");
            AsyncStorage.setItem("speaq_pin", pin);
            await seedDemoConversationIfNeeded();
            console.warn("[TIMING] handlePinSubmit pin-setup TOTAL " + (Date.now() - tStart) + "ms");
            setPin("");
            setPhase("main");
          } finally {
            setPinProcessing(false);
          }
        } else {
          Alert.alert("PINs don't match", "Try again.");
          setPin("");
          setPinStep("create");
          setTempPin("");
        }
      }
    } else if (phase === "pin-enter") {
      if (pin === savedPin) {
        setPinProcessing(true);
        await yieldFrames();
        const tStart = Date.now();
        console.warn("[TIMING] handlePinSubmit pin-enter START (Unlock)");
        try {
          setNormalPin(pin);
          console.warn("[TIMING] handlePinSubmit setNormalPin done after " + (Date.now() - tStart) + "ms");
          await setKeystorePin(pin);
          console.warn("[TIMING] handlePinSubmit setKeystorePin done after " + (Date.now() - tStart) + "ms");
          // Now that the keystore is unlocked, decrypt the stored Kyber + DSA
          // keys and connect the relay. Doing this before setKeystorePin throws.
          try {
            await loadIdentity();
            console.warn("[TIMING] handlePinSubmit loadIdentity done after " + (Date.now() - tStart) + "ms");
          } catch (e) { console.warn("[boot] loadIdentity failed:", e); }
          await seedDemoConversationIfNeeded();
          console.warn("[TIMING] handlePinSubmit pin-enter TOTAL " + (Date.now() - tStart) + "ms");
          setPin("");
          setPhase("main");
        } finally {
          setPinProcessing(false);
        }
      } else {
        Alert.alert("Wrong PIN");
        setPin("");
      }
    }
  }

  function retryPinProcessing() {
    setPinProcessingTimedOut(false);
    setPinProcessingPhase(0);
    setPinProcessingSoftWarn(false);
    // Re-trigger handlePinSubmit by reusing the saved pin state. Caller
    // entered correct pin already, so re-running the work is safe.
    setTimeout(() => { void handlePinSubmit(); }, 50);
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

  // Onboarding (first time ever)
  if (phase === "onboarding") {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <OnboardingScreen onDone={() => {
          AsyncStorage.setItem("speaq_onboarding_done", "1");
          setPhase("eula");
        }} />
      </SafeAreaProvider>
    );
  }

  // EULA acceptance (Apple Guideline 1.2 - User-Generated Content)
  if (phase === "eula") {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <EulaScreen onAccept={async () => {
          await AsyncStorage.setItem("speaq_eula_v1_accepted_at", new Date().toISOString());
          // Re-read the stored PIN at click-time. The useEffect that loaded
          // savedPin runs at boot, but if the EULA was reached before that
          // resolved (rare race), the local savedPin state may still be
          // empty. Going to AsyncStorage here is the source-of-truth and
          // mirrors what the boot routing would do on the next launch.
          const storedPin = await AsyncStorage.getItem("speaq_pin");
          if (storedPin) {
            setSavedPin(storedPin);
            setPhase("pin-enter");
          } else {
            setPhase("welcome");
          }
        }} />
      </SafeAreaProvider>
    );
  }

  // Welcome (first time)
  if (phase === "welcome") {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <WelcomeScreen onCreateIdentity={async (name: string) => {
          const id = await createIdentity(name);
          // One-time welcome bonus + default-on mining for new identities. Both
          // are claimed-once via AsyncStorage flags so re-creating identity later
          // does not re-mint. Lifetime QC starts at 1.0 instead of 0.0 so users
          // can immediately experiment with sending without waiting for mining.
          try {
            const welcomeClaimed = await AsyncStorage.getItem("speaq_welcome_claimed");
            if (!welcomeClaimed) {
              walletService.addMiningReward(1.0, "welcome");
              await AsyncStorage.setItem("speaq_welcome_claimed", "true");
            }
            const miningInitialized = await AsyncStorage.getItem("speaq_mining_initialized");
            if (!miningInitialized) {
              await startMining();
              await AsyncStorage.setItem("speaq_mining_initialized", "true");
            }
          } catch (e) {
            console.warn("[App] welcome bonus / mining init failed:", e);
          }
          Alert.alert("Welcome " + name, `SPEAQ ID: ${id?.speaqId}\n\nYou received a 1 QC welcome bonus and mining is now active. Set a PIN to secure your identity.`,
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
            {["1","2","3","4","5","6","7","8","9","*","0","del"].map(k => (
              <TouchableOpacity key={k} style={st.nk}
                onPress={() => k === "del" ? handlePinDelete() : handlePinDigit(k)} activeOpacity={0.6}>
                <Text style={st.nkTxt}>{k === "del" ? "←" : k}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Always render the submit button so the layout does not shift when
              the user taps the 4th digit. Visibility + tappability are toggled
              via opacity + disabled. PWA parity (web fix uses opacity:0 +
              pointer-events:none until pin >= 4). */}
          <TouchableOpacity
            style={[st.unlockBtn, pin.length < 4 && { opacity: 0 }]}
            onPress={handlePinSubmit}
            activeOpacity={0.8}
            disabled={pin.length < 4}
            accessibilityElementsHidden={pin.length < 4}
            importantForAccessibility={pin.length < 4 ? "no-hide-descendants" : "yes"}
          >
            <Text style={st.unlockTxt}>{phase === "pin-setup" ? (pinStep === "create" ? "Next" : "Set PIN") : "Unlock"}</Text>
          </TouchableOpacity>
        </View>

        {/* Apple App Review fix 2026-05-06: progress overlay during PIN-submit.
            Always rendered so it covers the PIN-pad immediately when state
            flips - no race with React Native modal animation timing. */}
        <Modal
          visible={pinProcessing}
          transparent
          animationType="fade"
          presentationStyle="overFullScreen"
          statusBarTranslucent
          onRequestClose={() => { /* user cannot cancel mid-decrypt */ }}
        >
          <View style={st.processingOverlay}>
            <View style={st.lockLogo}>
              <Text style={st.lockSpea}>SPEA</Text>
              <View style={st.lockQC}><Text style={st.lockQL}>Q</Text><View style={st.lockQB} /></View>
            </View>
            <Text style={st.processingTitle}>
              {pinProcessingTimedOut
                ? "Setup is taking longer than expected"
                : PIN_PROCESSING_PHASES[pinProcessingPhase]}
            </Text>
            {!pinProcessingTimedOut && (
              <ActivityIndicator color="#D4A853" size="large" style={st.processingSpinner} />
            )}
            {!pinProcessingTimedOut && (
              <Text style={st.processingSub}>
                {pinProcessingSoftWarn
                  ? "First-time decryption is computational. Post-quantum keys are protected on-device for maximum privacy. Almost done."
                  : "Decrypting your encrypted keystore on-device. This takes a moment."}
              </Text>
            )}
            {pinProcessingTimedOut && (
              <>
                <Text style={st.processingError}>
                  Setup did not finish in the expected time. This can happen on slower devices during first-time post-quantum key processing. You can try again now.
                </Text>
                <TouchableOpacity style={st.processingRetry} onPress={retryPinProcessing} activeOpacity={0.8}>
                  <Text style={st.processingRetryText}>Try again</Text>
                </TouchableOpacity>
              </>
            )}
            <View style={st.processingFooter}>
              <Text style={st.processingFooterText}>FIPS 203 ML-KEM-768  -  FIPS 204 ML-DSA-65  -  on-device</Text>
            </View>
          </View>
        </Modal>
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
        {activeTab === "groups" && <GroupsScreen onOpenGroupChat={(id, name) => {
          setChatContactId(id);
          setChatContactName(name);
          setActiveTab("chat");
        }} />}
        {activeTab === "contacts" && <ContactsScreen pendingConnectId={pendingConnectId} onClearPendingConnect={() => setPendingConnectId(null)} onOpenGroups={() => setActiveTab("groups")} onOpenChat={(id: string, name: string) => {
          setChatContactId(id);
          setChatContactName(name);
          setActiveTab("chat");
        }} />}
        {activeTab === "wallet" && <WalletScreen onOpenChat={(id, name) => {
          setChatContactId(id);
          setChatContactName(name);
          setActiveTab("chat");
        }} onOpenTransactions={() => setActiveTab("transactions")} onOpenLightning={() => setActiveTab("lightning")} />}
        {activeTab === "transactions" && <TransactionsScreen onBack={() => setActiveTab("wallet")} />}
        {activeTab === "settings" && <SettingsScreen onLogout={() => {
          setPhase("welcome");
          setActiveTab("chats");
        }} onOpenAdvanced={() => setActiveTab("advanced")} onOpenVault={() => setActiveTab("vault-screen")} onOpenMining={() => setActiveTab("mining")} onOpenInfo={() => setActiveTab("info")} onOpenBrowser={() => setActiveTab("browser")} onLanguageChange={() => setLangKey((k) => k + 1)} />}
        {activeTab === "advanced" && <AdvancedScreen onBack={() => setActiveTab("settings")} />}
        {activeTab === "vault-screen" && <VaultScreen onBack={() => setActiveTab("settings")} />}
        {activeTab === "mining" && <MiningScreen onBack={() => setActiveTab("chats")} />}
        {activeTab === "info" && <InfoScreen onBack={() => setActiveTab("settings")} />}
        {activeTab === "lightning" && <LightningScreen onBack={() => setActiveTab("wallet")} />}
        {activeTab === "browser" && <BrowserScreen onBack={() => setActiveTab("settings")} />}
        <View style={st.nav}>
          <Tab icon={<ChatIcon active={activeTab === "chats"} />} label={t("chats")} active={activeTab === "chats"} onPress={() => setActiveTab("chats")} />
          <Tab icon={<ContactIcon active={activeTab === "contacts"} />} label={t("contacts")} active={activeTab === "contacts"} onPress={() => setActiveTab("contacts")} />
          <Tab icon={<WalletIcon active={activeTab === "wallet"} />} label={t("wallet")} active={activeTab === "wallet"} onPress={() => setActiveTab("wallet")} />
          <Tab icon={<MiningIcon active={activeTab === "mining"} />} label="Earn" active={activeTab === "mining"} onPress={() => setActiveTab("mining")} />
          <Tab icon={<SettingsIcon active={activeTab === "settings"} />} label={t("settings")} active={activeTab === "settings"} onPress={() => setActiveTab("settings")} />
        </View>
      </View>
    </SafeAreaProvider>
  );
}

function Tab({ icon, label, active, onPress }: { icon: React.ReactNode; label: string; active: boolean; onPress: () => void }) {
  const st = useThemedStyles(makeAppStyles);
  return (
    <TouchableOpacity style={st.tab} onPress={onPress} activeOpacity={0.7}>
      {icon}
      <Text style={[st.tabLbl, active && st.tabAct]}>{label}</Text>
      {active && <View style={st.tabDot} />}
    </TouchableOpacity>
  );
}

function makeAppStyles(c: typeof import("./src/theme/brand").darkColors) {
  return StyleSheet.create({
    lockContainer: { flex: 1, backgroundColor: c.depth.void, alignItems: "center", justifyContent: "center" },
    lockLogo: { flexDirection: "row", alignItems: "center", marginBottom: 32 },
    lockSpea: { fontSize: 28, fontWeight: "700", fontFamily: "Georgia", color: c.signal.white },
    lockQC: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: c.voice.gold, alignItems: "center", justifyContent: "center", marginLeft: 2 },
    lockQL: { fontSize: 22, fontWeight: "700", fontFamily: "Georgia", color: c.voice.gold, marginTop: -1 },
    lockQB: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: c.quantum.teal, position: "absolute", bottom: 5, right: 7 },
    lockTitle: { color: c.signal.white, fontSize: 20, fontWeight: "600", marginBottom: 6 },
    lockSub: { color: c.signal.steel, fontSize: 12, marginBottom: 32 },
    dots: { flexDirection: "row", gap: 12, marginBottom: 40 },
    dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: c.voice.gold },
    dotFull: { backgroundColor: c.voice.gold },
    numpad: { flexDirection: "row", flexWrap: "wrap", width: 240, justifyContent: "center" },
    nk: { width: 72, height: 56, alignItems: "center", justifyContent: "center", margin: 4, borderRadius: 12, backgroundColor: c.depth.card },
    nkHide: { backgroundColor: "transparent" },
    nkTxt: { color: c.signal.white, fontSize: 24, fontWeight: "400" },
    unlockBtn: { backgroundColor: c.voice.gold, paddingHorizontal: 40, paddingVertical: 12, borderRadius: 12, marginTop: 24 },
    unlockTxt: { color: c.depth.void, fontSize: 15, fontWeight: "600" },

    // Processing overlay (Apple 2.1(a) fix 2026-05-06)
    processingOverlay: {
      flex: 1, backgroundColor: c.depth.void,
      alignItems: "center", justifyContent: "center", paddingHorizontal: 32,
    },
    processingTitle: {
      color: c.signal.white, fontSize: 18, fontWeight: "600",
      textAlign: "center", marginTop: 36, letterSpacing: 0.3, lineHeight: 24,
      maxWidth: 320,
    },
    processingSpinner: { marginTop: 28 },
    processingSub: {
      color: c.signal.steel, fontSize: 13, textAlign: "center",
      marginTop: 24, lineHeight: 20, maxWidth: 320,
    },
    processingError: {
      color: c.voice.warm, fontSize: 13, textAlign: "center",
      marginTop: 24, lineHeight: 20, maxWidth: 320,
    },
    processingRetry: {
      marginTop: 24, paddingHorizontal: 32, paddingVertical: 13,
      backgroundColor: c.voice.gold, borderRadius: 12,
    },
    processingRetryText: { color: c.depth.void, fontSize: 15, fontWeight: "600", letterSpacing: 0.5 },
    processingFooter: { position: "absolute", bottom: 44 },
    processingFooterText: { color: c.signal.steel, fontSize: 9, letterSpacing: 0.5 },

    container: { flex: 1, backgroundColor: c.depth.void },
    nav: { flexDirection: "row", backgroundColor: c.depth.void, borderTopWidth: 1, borderTopColor: c.border.subtle, paddingBottom: 24, paddingTop: 10 },
    tab: { flex: 1, alignItems: "center", paddingVertical: 4 },
    tabLbl: { fontSize: 10, color: c.signal.steel, marginTop: 4, letterSpacing: 0.5 },
    tabAct: { color: c.voice.gold },
    tabDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: c.voice.gold, marginTop: 3 },
  });
}

function AppWithTheme() {
  return (
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
}

export default AppWithTheme;
