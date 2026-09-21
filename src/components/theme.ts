/**
 * Light / Dark / System.
 *
 * The preference is the user's choice; the *theme* is what is painted. "System"
 * stores nothing and sets nothing — the absence of `data-theme` on <html> is what
 * hands the decision to the `prefers-color-scheme` media query in theme-dark.css, so
 * the page follows the OS and changes with it live, without any script listening.
 *
 * The pre-paint script below has to be a string: it runs inline in <head>, before
 * React and before first paint, so it cannot import this module. It is built from the
 * same constants, so the two cannot disagree about the key or the values.
 */

export type ThemePref = "light" | "dark" | "system";

export const THEME_PREFS: readonly ThemePref[] = ["light", "system", "dark"];

const STORAGE_KEY = "theme";
const CHANGE_EVENT = "themepref";

/** Must match --color-bg in globals.css and theme-dark.css — the browser chrome colour. */
const CHROME = { light: "#f2f2f3", dark: "#14191e" } as const;

/**
 * Storage can throw — private browsing, blocked site data, a sandboxed frame — and a
 * theme preference is never worth breaking the page over. Every access is guarded,
 * and "system" is the safe answer because it defers to the OS.
 */
export function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Paint a preference. DOM only — never touches storage, so it is safe to call on sync. */
export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme;
  else root.dataset.theme = pref;

  // Next renders one <meta name="theme-color"> per scheme, each behind a media query,
  // so the browser chrome follows the OS rather than a forced choice. Point them all
  // at the forced ground; for System, put back what each originally said.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.dataset.orig ??= meta.content;
    meta.content = pref === "system" ? meta.dataset.orig : CHROME[pref];
  }
}

/** The user chose. Persist it, paint it, and tell every subscriber in this tab. */
export function savePref(pref: ThemePref): void {
  try {
    if (pref === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Unpersisted, but still applied for this page view.
  }
  applyTheme(pref);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * For useSyncExternalStore. Two sources of change: this tab (our own event) and any
 * other tab (the `storage` event, which only fires cross-tab). A change in another tab
 * repaints this one too, so two open windows never show different themes.
 */
export function subscribePref(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY && e.key !== null) return;
    applyTheme(readPref());
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The server cannot know the preference; "system" is what it renders, and hydration corrects it. */
export const serverPref = (): ThemePref => "system";

/**
 * Runs inline in <head>, before first paint. Without it a stored "dark" renders light
 * for a frame and then flashes — the one thing a theme switch must never do. It sets
 * only the attribute; the chrome colour is synced once React mounts, because the
 * theme-color metas may not be in the DOM yet when this runs.
 */
export const PRE_PAINT_SCRIPT = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});if(p==="light"||p==="dark")document.documentElement.dataset.theme=p;}catch(e){}})();`;
