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
import { colors } from "./src/theme/brand";

type Screen = "chatList" | "chat" | "contacts" | "wallet" | "settings";

function App() {
  const [screen, setScreen] = useState<Screen>("chatList");

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.depth.void} />
      <View style={styles.container}>
        {/* Screen Router */}
        {screen === "chatList" && <ChatListScreen />}
        {screen === "chat" && <ChatScreen />}
        {screen === "contacts" && <PlaceholderScreen title="Contacts" icon="👤" />}
        {screen === "wallet" && <PlaceholderScreen title="Wallet" icon="💰" />}
        {screen === "settings" && <PlaceholderScreen title="Settings" icon="⚙️" />}

        {/* Bottom Navigation */}
        <View style={styles.nav}>
          <NavTab icon="💬" label="Chats" active={screen === "chatList"} onPress={() => setScreen("chatList")} />
          <NavTab icon="👤" label="Contacts" active={screen === "contacts"} onPress={() => setScreen("contacts")} />
          <NavTab icon="💰" label="Wallet" active={screen === "wallet"} onPress={() => setScreen("wallet")} />
          <NavTab icon="⚙️" label="Settings" active={screen === "settings"} onPress={() => setScreen("settings")} />
        </View>
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
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.navTab} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.navIcon}>{icon}</Text>
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
      {active && <View style={styles.navDot} />}
    </TouchableOpacity>
  );
}

function PlaceholderScreen({ title, icon }: { title: string; icon: string }) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderIcon}>{icon}</Text>
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
    paddingTop: 8,
  },
  navTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  navIcon: {
    fontSize: 20,
  },
  navLabel: {
    fontSize: 10,
    color: colors.signal.steel,
    marginTop: 2,
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
  placeholderIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  placeholderTitle: {
    color: colors.signal.white,
    fontSize: 24,
    fontWeight: "600",
  },
  placeholderSub: {
    color: colors.signal.steel,
    fontSize: 14,
    marginTop: 8,
  },
});

export default App;
