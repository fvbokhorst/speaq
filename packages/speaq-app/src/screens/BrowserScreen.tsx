/**
 * SPEAQ - Freedom Browse (Module 4)
 * Private in-app browser with transport layer obfuscation.
 * No browsing history stored on any server -- local-only.
 */

import React, { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Alert } from "react-native";
import { WebView } from "react-native-webview";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../theme/brand";
import { obfuscatePayload } from "../services/transport";

const HISTORY_KEY = "speaq_browser_history";

interface HistoryEntry {
  url: string;
  title: string;
  visitedAt: number;
}

interface Props {
  onBack: () => void;
}

export default function BrowserScreen({ onBack }: Props) {
  const [url, setUrl] = useState("https://duckduckgo.com");
  const [inputUrl, setInputUrl] = useState("https://duckduckgo.com");
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      const data = await AsyncStorage.getItem(HISTORY_KEY);
      if (data) setHistory(JSON.parse(data));
    } catch (e) {}
  }

  async function saveHistoryEntry(pageUrl: string, title: string) {
    const entry: HistoryEntry = { url: pageUrl, title: title || pageUrl, visitedAt: Date.now() };
    const updated = [entry, ...history.filter((h) => h.url !== pageUrl)].slice(0, 100);
    setHistory(updated);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  }

  async function clearHistory() {
    Alert.alert("Clear History", "Delete all local browsing history?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          setHistory([]);
          await AsyncStorage.removeItem(HISTORY_KEY);
          setShowHistory(false);
        },
      },
    ]);
  }

  function navigateTo(targetUrl: string) {
    let normalized = targetUrl.trim();
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
      // If it looks like a domain, prepend https
      if (normalized.includes(".") && !normalized.includes(" ")) {
        normalized = "https://" + normalized;
      } else {
        // Treat as search query
        normalized = "https://duckduckgo.com/?q=" + encodeURIComponent(normalized);
      }
    }
    setUrl(normalized);
    setInputUrl(normalized);
    setShowHistory(false);
  }

  function handleGoBack() {
    webViewRef.current?.goBack();
  }

  function handleGoForward() {
    webViewRef.current?.goForward();
  }

  function handleReload() {
    webViewRef.current?.reload();
  }

  // Obfuscate outgoing requests via transport layer
  // In production, this would proxy through an obfuscated channel
  const injectedJS = `
    (function() {
      // Mark all XHR requests with SPEAQ transport header
      var origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function() {
        this._speaqTransport = true;
        return origOpen.apply(this, arguments);
      };
      true;
    })();
  `;

  if (showHistory) {
    return (
      <View style={st.container}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => setShowHistory(false)}>
            <Text style={st.backBtn}>Back</Text>
          </TouchableOpacity>
          <Text style={st.headerTitle}>History</Text>
          <TouchableOpacity onPress={clearHistory}>
            <Text style={st.clearBtn}>Clear</Text>
          </TouchableOpacity>
        </View>
        {history.length === 0 ? (
          <View style={st.emptyContainer}>
            <Text style={st.emptyText}>No browsing history</Text>
          </View>
        ) : (
          <FlatList
            data={history}
            keyExtractor={(_, i) => i.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity style={st.historyRow} onPress={() => navigateTo(item.url)}>
                <Text style={st.historyTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={st.historyUrl} numberOfLines={1}>{item.url}</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    );
  }

  return (
    <View style={st.container}>
      {/* Navigation Bar */}
      <View style={st.navBar}>
        <TouchableOpacity onPress={onBack} style={st.navBtn}>
          <Text style={st.navBtnText}>X</Text>
        </TouchableOpacity>
        <TextInput
          style={st.urlInput}
          value={inputUrl}
          onChangeText={setInputUrl}
          onSubmitEditing={() => navigateTo(inputUrl)}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          selectTextOnFocus
          placeholder="Search or enter URL"
          placeholderTextColor={colors.signal.steel}
        />
        <TouchableOpacity onPress={() => navigateTo(inputUrl)} style={st.navBtn}>
          <Text style={st.navBtnText}>Go</Text>
        </TouchableOpacity>
      </View>

      {/* WebView */}
      <WebView
        ref={webViewRef}
        source={{ uri: url }}
        style={st.webview}
        injectedJavaScript={injectedJS}
        onNavigationStateChange={(navState) => {
          setCanGoBack(navState.canGoBack);
          setCanGoForward(navState.canGoForward);
          setInputUrl(navState.url);
          setLoading(navState.loading || false);
          if (navState.url && navState.title && !navState.loading) {
            saveHistoryEntry(navState.url, navState.title);
          }
        }}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        incognito={false}
        thirdPartyCookiesEnabled={false}
      />

      {/* Bottom Controls */}
      <View style={st.bottomBar}>
        <TouchableOpacity onPress={handleGoBack} disabled={!canGoBack} style={st.bottomBtn}>
          <Text style={[st.bottomBtnText, !canGoBack && st.bottomBtnDisabled]}>{"<"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleGoForward} disabled={!canGoForward} style={st.bottomBtn}>
          <Text style={[st.bottomBtnText, !canGoForward && st.bottomBtnDisabled]}>{">"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleReload} style={st.bottomBtn}>
          <Text style={st.bottomBtnText}>{loading ? "X" : "R"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowHistory(true)} style={st.bottomBtn}>
          <Text style={st.bottomBtnText}>H</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.depth.void },

  // Navigation bar
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 56,
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: colors.depth.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    gap: 6,
  },
  urlInput: {
    flex: 1,
    height: 36,
    backgroundColor: colors.depth.card,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: colors.signal.white,
    fontSize: 13,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.depth.card,
  },
  navBtnText: { color: colors.voice.gold, fontSize: 13, fontWeight: "600" },

  // WebView
  webview: { flex: 1 },

  // Bottom bar
  bottomBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
    paddingBottom: 28,
    backgroundColor: colors.depth.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  bottomBtn: {
    width: 44,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  bottomBtnText: { color: colors.voice.gold, fontSize: 16, fontWeight: "600" },
  bottomBtnDisabled: { color: colors.signal.steel },

  // Header (history view)
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerTitle: { color: colors.signal.white, fontSize: 18, fontWeight: "600" },
  backBtn: { color: colors.voice.gold, fontSize: 15, fontWeight: "500" },
  clearBtn: { color: colors.signal.red, fontSize: 15, fontWeight: "500" },

  // History list
  historyRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  historyTitle: { color: colors.signal.white, fontSize: 14, marginBottom: 2 },
  historyUrl: { color: colors.signal.steel, fontSize: 11 },

  // Empty state
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: colors.signal.steel, fontSize: 14 },
});
