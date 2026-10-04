"use client";

import { useCallback, useEffect, useState } from "react";

import { DEFAULT_THEME, THEME_STORAGE_KEY, THEMES, themeTokens } from "./theme-data";

export { THEMES, FONTS, DEFAULT_THEME } from "./theme-data";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

export function resolveMode(mode) {
  if (mode !== "auto") return mode;
  return window.matchMedia(LIGHT_QUERY).matches ? "light" : "dark";
}

export function applyTheme({ id, mode }) {
  const theme = THEMES.find((item) => item.id === id) || THEMES[0];
  const resolved = resolveMode(mode);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeTokens(theme, resolved))) {
    root.style.setProperty(name, value);
  }
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function readStoredTheme() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(THEME_STORAGE_KEY) || "null");
    if (stored && THEMES.some((theme) => theme.id === stored.id) && ["dark", "light", "auto"].includes(stored.mode)) {
      return stored;
    }
  } catch {
    // Storage can be unavailable or hold stale data; fall back to the default.
  }
  return DEFAULT_THEME;
}

// Re-applies the saved theme when the OS switches light/dark (for Auto) or
// another tab changes it. The Visualizer iframe listens to the same key.
function subscribeToThemeChanges(onChange) {
  const preference = window.matchMedia(LIGHT_QUERY);
  const onStorage = (event) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) onChange();
  };
  preference.addEventListener("change", onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    preference.removeEventListener("change", onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useThemeSync() {
  useEffect(() => subscribeToThemeChanges(() => applyTheme(readStoredTheme())), []);
}

export function useAppTheme() {
  const [theme, setThemeState] = useState(DEFAULT_THEME);
  const [resolvedMode, setResolvedMode] = useState("dark");

  useEffect(() => {
    const sync = () => {
      const stored = readStoredTheme();
      setThemeState(stored);
      setResolvedMode(resolveMode(stored.mode));
      applyTheme(stored);
    };
    sync();
    return subscribeToThemeChanges(sync);
  }, []);

  const setTheme = useCallback((next) => {
    setThemeState((current) => {
      const merged = { ...current, ...next };
      applyTheme(merged);
      setResolvedMode(resolveMode(merged.mode));
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // Non-persistent is fine; the theme still applies for this visit.
      }
      return merged;
    });
  }, []);

  return [theme, setTheme, resolvedMode];
}
