import themeData from "./themes.json";

// App themes are VISUALICER's themes: each has a dark and light palette plus
// [title, ui, lyrics] font keys. Palettes map onto the shadcn color tokens so
// every component follows the active theme.
export const THEMES = themeData.themes;
export const FONTS = themeData.fonts;
export const DEFAULT_THEME = { id: "amber", mode: "dark" };
export const THEME_STORAGE_KEY = "sss-theme";

export function themeTokens(theme, mode) {
  const p = theme[mode] || theme.dark;
  const font = (key) => (FONTS[key] || FONTS.hanken)[1];
  return {
    "--background": p.bg,
    "--foreground": p.text,
    "--card": p.surface,
    "--card-foreground": p.text,
    "--popover": p.bg2,
    "--popover-foreground": p.text,
    "--primary": p.accent,
    "--primary-foreground": p.bg,
    "--secondary": p.bg2,
    "--secondary-foreground": p.text,
    "--muted": p.bg2,
    "--muted-foreground": p.dim,
    "--accent": p.field,
    "--accent-foreground": p.text,
    "--border": p.border,
    "--input": p.border,
    "--ring": p.accent,
    "--highlight": p.accent2,
    "--shadow-color": p.shadow,
    "--app-font-title": font(theme.fonts[0]),
    "--app-font-ui": font(theme.fonts[1]),
  };
}

// Inline script for <head>: applies the saved theme before first paint so the
// page never flashes the default palette.
export function themeBootScript() {
  const compact = THEMES.map((theme) => ({
    id: theme.id,
    dark: themeTokens(theme, "dark"),
    light: themeTokens(theme, "light"),
  }));
  return `(function(){try{var t=${JSON.stringify(compact)};var s=JSON.parse(localStorage.getItem(${JSON.stringify(
    THEME_STORAGE_KEY
  )})||"null")||${JSON.stringify(DEFAULT_THEME)};var th=t.find(function(x){return x.id===s.id})||t[0];var m=s.mode==="auto"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):(s.mode||"dark");var v=th[m]||th.dark,r=document.documentElement;for(var k in v)r.style.setProperty(k,v[k]);r.classList.toggle("dark",m==="dark");r.style.colorScheme=m;}catch(e){}})();`;
}
