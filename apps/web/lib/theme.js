"use client";

import { useCallback, useEffect, useState } from "react";

import { DEFAULT_THEME, THEME_STORAGE_KEY, THEMES, themeTokens } from "./theme-data";

export { THEMES, FONTS, DEFAULT_THEME } from "./theme-data";

function resolveMode(mode) {
  if (mode !== "auto") return mode;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
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

export function useAppTheme() {
  const [theme, setThemeState] = useState(DEFAULT_THEME);

  useEffect(() => {
    setThemeState(readStoredTheme());
  }, []);

  const setTheme = useCallback((next) => {
    setThemeState((current) => {
      const merged = { ...current, ...next };
      applyTheme(merged);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // Non-persistent is fine; the theme still applies for this visit.
      }
      return merged;
    });
  }, []);

  return [theme, setTheme];
}
