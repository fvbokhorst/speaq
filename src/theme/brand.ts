/**
 * SPEAQ Brand Guide - Design Tokens
 * PRD Section 13: Brand Guide Summary
 *
 * Voice Gold = The human voice (primary accent, the Q)
 * Quantum Teal = The technology (technical accents)
 * Depth = The protection (backgrounds)
 *
 * Theme is read synchronously from MMKV at module-load so that every
 * screen's StyleSheet.create sees the correct color set from the very
 * first render. Changing theme requires an app reload (DevSettings
 * in Metro, or user-initiated restart in production).
 */

import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemeMode = "system" | "dark" | "light";

const THEME_KEY = "speaq_theme";
const RELOAD_MARKER_KEY = "speaq_theme_reload_ts";
const RELOAD_GRACE_MS = 10_000;

const darkColors = {
  voice:    { light: "#F5DFA6", warm: "#E8C47A", gold: "#D4A853", deep: "#A17D3A" },
  quantum:  { bright: "#5EEAD4", teal: "#2DD4BF", core: "#14B8A6", dark: "#0F766E" },
  depth:    { void: "#08090D", surface: "#0E1017", card: "#141620", elevated: "#1A1D2B" },
  signal:   { white: "#F1F5F9", light: "#94A3B8", steel: "#64748B", red: "#E24B4A" },
  border:   { subtle: "rgba(100, 116, 139, 0.15)", hover: "rgba(100, 116, 139, 0.3)" },
};

const lightColors = {
  voice:    { light: "#F5DFA6", warm: "#C89441", gold: "#B88A2C", deep: "#8A6420" },
  quantum:  { bright: "#14B8A6", teal: "#0D9488", core: "#0F766E", dark: "#115E59" },
  depth:    { void: "#FFFFFF", surface: "#F8FAFC", card: "#F1F5F9", elevated: "#E2E8F0" },
  signal:   { white: "#0F172A", light: "#475569", steel: "#64748B", red: "#DC2626" },
  border:   { subtle: "rgba(15, 23, 42, 0.1)", hover: "rgba(15, 23, 42, 0.2)" },
};

/**
 * The `colors` export is a mutable object. `applyTheme()` deep-assigns
 * values from lightColors/darkColors into it, so that any StyleSheet
 * created AFTER applyTheme picks up the active theme. Modules loaded
 * before the theme is applied will see the defaults (dark); App.tsx
 * therefore lazy-loads screens via require() only after applyTheme has
 * run during boot.
 */
export const colors = {
  voice:   { ...darkColors.voice },
  quantum: { ...darkColors.quantum },
  depth:   { ...darkColors.depth },
  signal:  { ...darkColors.signal },
  border:  { ...darkColors.border },
};

function resolveMode(stored: ThemeMode): "dark" | "light" {
  if (stored === "system") {
    return Appearance.getColorScheme() === "light" ? "light" : "dark";
  }
  return stored;
}

export function applyTheme(mode: ThemeMode): void {
  const target = resolveMode(mode) === "light" ? lightColors : darkColors;
  Object.assign(colors.voice, target.voice);
  Object.assign(colors.quantum, target.quantum);
  Object.assign(colors.depth, target.depth);
  Object.assign(colors.signal, target.signal);
  Object.assign(colors.border, target.border);
}

export async function getStoredMode(): Promise<ThemeMode> {
  try {
    const raw = await AsyncStorage.getItem(THEME_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {}
  return "system";
}

/** Returns the last loaded mode synchronously. Only valid after getStoredMode(). */
let lastLoadedMode: ThemeMode = "system";
export function getThemeMode(): ThemeMode {
  return lastLoadedMode;
}

/** Persist + write reload marker. Await before reloading the bundle. */
export async function setThemeMode(mode: ThemeMode): Promise<void> {
  lastLoadedMode = mode;
  try {
    await AsyncStorage.setItem(THEME_KEY, mode);
    await AsyncStorage.setItem(RELOAD_MARKER_KEY, String(Date.now()));
  } catch {}
}

/** Called during boot to sync the in-memory cached mode. */
export async function loadAndApplyStoredTheme(): Promise<ThemeMode> {
  const mode = await getStoredMode();
  lastLoadedMode = mode;
  applyTheme(mode);
  return mode;
}

export async function consumeThemeReloadMarker(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(RELOAD_MARKER_KEY);
    if (!raw) return false;
    await AsyncStorage.removeItem(RELOAD_MARKER_KEY);
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < RELOAD_GRACE_MS;
  } catch {
    return false;
  }
}

export const fonts = {
  display: "Playfair Display",    // Variable font (400-900), PostScript: PlayfairDisplay-Regular
  displayMedium: "Playfair Display",
  body: "DMSans",
  bodyMedium: "DMSans-Medium",
  system: "JetBrainsMono",
  systemLight: "JetBrainsMono-Light",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 };

export const theme = {
  background: colors.depth.void,
  surface: colors.depth.surface,
  card: colors.depth.card,
  elevated: colors.depth.elevated,
  textPrimary: colors.signal.white,
  textSecondary: colors.signal.light,
  textMuted: colors.signal.steel,
  accent: colors.voice.gold,
  accentSecondary: colors.quantum.teal,
  border: colors.border.subtle,
  error: colors.signal.red,
};
