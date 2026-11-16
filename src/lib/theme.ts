// Light / dark / system theme. The choice is a per-device convenience kept in localStorage;
// THEME_BOOT runs in <head> before the page paints so there is no light flash.
export type ThemePref = "light" | "dark" | "system";
const KEY = "tt.theme";

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): "light" | "dark" {
  return pref === "system" ? (systemDark ? "dark" : "light") : pref;
}

export function applyTheme(pref: ThemePref) {
  const dark =
    resolveTheme(pref, window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false) ===
    "dark";
  document.documentElement.classList.toggle("dark", dark);
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* private mode: applies for this page only */
  }
  applyTheme(pref);
}

export const THEME_BOOT = `(function(){try{var p=localStorage.getItem("${KEY}");var d=p==="dark"||(p!=="light"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}})();`;
