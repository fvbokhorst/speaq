/**
 * SPEAQ Brand Guide - Design Tokens
 * PRD Section 13: Brand Guide Summary
 * Source: speaq-brandguide-eng.html
 *
 * Voice Gold = The human voice (primary accent, the Q)
 * Quantum Teal = The technology (technical accents)
 * Depth = The protection (backgrounds)
 */

export const colors = {
  // Voice - The Human Voice
  voice: {
    light: "#F5DFA6",   // Hover states, glows
    warm: "#E8C47A",    // Headings, highlights
    gold: "#D4A853",    // Primary accent, the Q
    deep: "#A17D3A",    // Borders, emphasis
  },

  // Quantum - The Technology
  quantum: {
    bright: "#5EEAD4",  // Active states, links
    teal: "#2DD4BF",    // Technical accents
    core: "#14B8A6",    // Buttons, interactions
    dark: "#0F766E",    // Deep UI elements
  },

  // Depth - The Protection
  depth: {
    void: "#08090D",    // Background
    surface: "#0E1017", // Surfaces
    card: "#141620",    // Cards, panels
    elevated: "#1A1D2B",// Elevated elements
  },

  // Signal - Communication
  signal: {
    white: "#F1F5F9",   // Primary text (Freedom White)
    light: "#94A3B8",   // Secondary text (Shield Light)
    steel: "#64748B",   // Muted, metadata (Shield Steel)
    red: "#E24B4A",     // Warnings (Resistance Red)
  },

  // Borders
  border: {
    subtle: "rgba(100, 116, 139, 0.15)",
    hover: "rgba(100, 116, 139, 0.3)",
  },
};

export const fonts = {
  display: "PlayfairDisplay",     // 700 Bold headlines, brand name
  displayMedium: "PlayfairDisplay-Medium", // 500 Medium subtitles
  body: "DMSans",                 // 400 Regular body text
  bodyMedium: "DMSans-Medium",    // 500 Medium emphasis
  system: "JetBrainsMono",        // 400 Regular code, specs
  systemLight: "JetBrainsMono-Light", // 300 Light captions
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

// Dark theme is DEFAULT per brand guide
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
