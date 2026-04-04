/**
 * SPEAQ - Quantum Freedom Platform
 * Mobile App Entry Point
 *
 * Brand: Dark theme default (Depth Void #08090D)
 * Voice Gold #D4A853 accent, Quantum Teal #2DD4BF technical
 */

import React, { useState } from "react";
import { StatusBar, View, StyleSheet, TouchableOpacity, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import ChatListScreen from "./src/screens/ChatListScreen";
import ChatScreen from "./src/screens/ChatScreen";
import WelcomeScreen from "./src/screens/WelcomeScreen";
import { ChatIcon, ContactIcon, WalletIcon, SettingsIcon } from "./src/components/Icons";
import { colors } from "./src/theme/brand";

type Screen = "welcome" | "chatList" | "chat" | "contacts" | "wallet" | "settings";

function App() {
  const [screen, setScreen] = useState<Screen>("welcome");

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.depth.void} />
      <View style={styles.container}>
        {/* Screen Router */}
        {screen === "welcome" && (
          <WelcomeScreen onCreateIdentity={() => setScreen("chatList")} />
        )}
        {screen === "chatList" && <ChatListScreen />}
        {screen === "chat" && <ChatScreen />}
        {screen === "contacts" && <PlaceholderScreen title="Contacts" />}
        {screen === "wallet" && <PlaceholderScreen title="Wallet" />}
        {screen === "settings" && <PlaceholderScreen title="Settings" />}

        {/* Bottom Navigation (hidden on welcome) */}
        {screen !== "welcome" && <View style={styles.nav}>
          <NavTab
            icon={<ChatIcon active={screen === "chatList"} />}
            label="Chats"
            active={screen === "chatList"}
            onPress={() => setScreen("chatList")}
          />
          <NavTab
            icon={<ContactIcon active={screen === "contacts"} />}
            label="Contacts"
            active={screen === "contacts"}
            onPress={() => setScreen("contacts")}
          />
          <NavTab
            icon={<WalletIcon active={screen === "wallet"} />}
            label="Wallet"
            active={screen === "wallet"}
            onPress={() => setScreen("wallet")}
          />
          <NavTab
            icon={<SettingsIcon active={screen === "settings"} />}
            label="Settings"
            active={screen === "settings"}
            onPress={() => setScreen("settings")}
          />
        </View>}
      </View>
    </SafeAreaProvider>
  );
}

function NavTab({
  icon,
  label,
  active,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.navTab} onPress={onPress} activeOpacity={0.7}>
      {icon}
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
      {active && <View style={styles.navDot} />}
    </TouchableOpacity>
  );
}

function PlaceholderScreen({ title }: { title: string }) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={styles.placeholderSub}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.depth.void,
  },
  nav: {
    flexDirection: "row",
    backgroundColor: colors.depth.void,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    paddingBottom: 24,
    paddingTop: 10,
  },
  navTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  navLabel: {
    fontSize: 10,
    color: colors.signal.steel,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  navLabelActive: {
    color: colors.voice.gold,
  },
  navDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.voice.gold,
    marginTop: 3,
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.depth.void,
  },
  placeholderTitle: {
    color: colors.signal.white,
    fontSize: 20,
    fontWeight: "500",
    letterSpacing: 1,
  },
  placeholderSub: {
    color: colors.signal.steel,
    fontSize: 12,
    marginTop: 8,
    letterSpacing: 0.5,
  },
});

export default App;
