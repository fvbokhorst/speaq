/**
 * SPEAQ Theme Context
 * Provides dark/light mode support across the app
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkTheme, lightTheme, colors, lightColors } from "./brand";

export type ThemeMode = "system" | "dark" | "light";

interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  theme: typeof darkTheme;
  colors: typeof colors;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: "system",
  isDark: true,
  theme: darkTheme,
  colors: colors,
  setMode: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    AsyncStorage.getItem("speaq_theme").then((stored) => {
      if (stored === "dark" || stored === "light" || stored === "system") {
        setModeState(stored);
      }
    });
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem("speaq_theme", m);
  }, []);

  const isDark = mode === "dark" || (mode === "system" && systemScheme !== "light");

  const currentTheme = isDark ? darkTheme : lightTheme;
  const currentColors = isDark
    ? colors
    : { ...colors, depth: lightColors.depth, signal: lightColors.signal, border: lightColors.border };

  return (
    <ThemeContext.Provider value={{ mode, isDark, theme: currentTheme, colors: currentColors, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
