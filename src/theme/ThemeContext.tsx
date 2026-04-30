/**
 * SPEAQ Theme Context
 * Provides dark/light mode support across the app.
 *
 * Screens use `useThemedStyles((c, t) => StyleSheet.create({...}))` so
 * that StyleSheets are rebuilt when the theme switches. The factory
 * is memoized on isDark, so styles are produced exactly twice over
 * the app's lifetime (once per mode).
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { darkTheme, lightTheme, darkColors, lightColors } from "./brand";

export type ThemeMode = "system" | "dark" | "light";

export type ThemeColors = typeof darkColors;
export type ThemeShape = typeof darkTheme;

interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  theme: ThemeShape;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: "system",
  isDark: true,
  theme: darkTheme,
  colors: darkColors,
  setMode: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Build a StyleSheet (or any styled object) that re-evaluates when the
 * theme changes. Use inside a function component:
 *
 *   const styles = useThemedStyles((c, t) => StyleSheet.create({
 *     container: { backgroundColor: c.depth.void },
 *     text:      { color: c.signal.white },
 *   }));
 *
 * The factory runs on initial render and again whenever isDark flips.
 */
export function useThemedStyles<T>(factory: (c: ThemeColors, t: ThemeShape) => T): T {
  const { colors: c, theme: t, isDark } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(c, t), [isDark]);
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
  const currentColors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ mode, isDark, theme: currentTheme, colors: currentColors, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
