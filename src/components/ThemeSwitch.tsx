"use client";

import { useEffect, useSyncExternalStore } from "react";
import { applyTheme, readPref, savePref, serverPref, subscribePref, THEME_PREFS, type ThemePref } from "./theme";

const LABEL: Record<ThemePref, string> = { light: "Light", system: "System", dark: "Dark" };

/**
 * One stroke weight, one size, drawn to the same 16px box — MASTER.md forbids emoji as
 * icons, and a sun/monitor/moon set in mixed styles would read as three different apps.
 */
function Icon({ pref }: { pref: ThemePref }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "square" as const,
    "aria-hidden": true,
  };
  if (pref === "light")
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1" />
      </svg>
    );
  if (pref === "dark")
    return (
      <svg {...common}>
        <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="1.5" y="2.5" width="13" height="9" />
      <path d="M5.5 14.5h5M8 11.5v3" />
    </svg>
  );
}

/**
 * Light / System / Dark, as a real radio group.
 *
 * Radios, not three buttons: it is one choice among three, so it gets one tab stop,
 * arrow keys between options, and a single announced state ("Theme, System, 2 of 3").
 * It reuses `.seg` — the same control as "Papers to read" — so it is native to the
 * system rather than a one-off.
 *
 * The labels are visually hidden to keep the header compact at 375px, but they are
 * real text (not aria-label on an icon), so they are what a screen reader reads and
 * what a translation tool translates. `title` gives sighted pointer users the word too.
 */
export default function ThemeSwitch() {
  // useSyncExternalStore, not useState + useEffect: the preference lives in
  // localStorage, which the server cannot see. The server snapshot is "system";
  // React swaps in the real value after hydration without a mismatch warning.
  const pref = useSyncExternalStore(subscribePref, readPref, serverPref);

  // The pre-paint script sets data-theme before first paint but runs too early to
  // reach the theme-color metas. Sync the browser chrome once, now they exist.
  useEffect(() => {
    applyTheme(readPref());
  }, []);

  return (
    <fieldset className="theme-switch">
      <legend className="vh">Theme</legend>
      <div className="seg">
        {THEME_PREFS.map((p) => (
          <label className="seg-opt seg-icon" key={p} title={LABEL[p]}>
            <input type="radio" name="theme" value={p} checked={pref === p} onChange={() => savePref(p)} />
            <Icon pref={p} />
            <span className="vh">{LABEL[p]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
