/**
 * The contrast law from design-system/research-to-deck/MASTER.md §2.2, as a test.
 *
 * Token values are read out of the stylesheets rather than duplicated here, so
 * retuning a ramp cannot silently reintroduce a WCAG failure — the numbers move and
 * this fails.
 *
 * The same law is asserted twice and independently: once for the light `:root` in
 * globals.css, once for the `prefers-color-scheme: dark` block in theme-dark.css.
 * Light-mode ratios do not carry over to a dark ground, so nothing is inherited
 * between the two runs except the list of pairings that must hold.
 *
 *   node scripts/check-contrast.mjs
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const GLOBALS = fileURLToPath(new URL("../src/app/globals.css", import.meta.url));
const THEME_DARK = fileURLToPath(new URL("../src/app/theme-dark.css", import.meta.url));

/** Comments mention selectors in prose; strip them before looking for rule blocks. */
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Pull the `--name: #hex;` declarations out of `selector { … }`. Non-hex tokens
 * (color-mix, var indirection) are skipped — they resolve from the hex ones.
 * Returns `null` when the selector has no block in this file.
 */
function readBlock(css, selector) {
  const at = strip(css).match(new RegExp(`(?:^|[{}\\s])${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  if (!at) return null;
  const tokens = {};
  for (const [, name, hex] of at[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[name] = hex.toLowerCase();
  }
  return tokens;
}

function luminance(hex) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * `min` is the WCAG floor the token must clear for how it is actually used:
 * 4.5 for text, 3 for non-text UI (rules, meters, focus rings).
 *
 * `scope` names the rule a pairing is painted inside, for a theme that redefines
 * tokens locally. Nothing does today — the inverted `.reverse` island went with the
 * move to minimalism — but the mechanism stays, because the next one will need it.
 */
const CASES = [
  { what: "body text", fg: "--color-text", bg: "--color-bg", min: 4.5 },
  { what: "muted text (the floor)", fg: "--color-neutral-700", bg: "--color-bg", min: 4.5 },
  { what: "links", fg: "--color-accent-700", bg: "--color-bg", min: 4.5 },
  { what: "primary button label", fg: "--color-bg", bg: "--color-accent-700", min: 4.5 },
  { what: "selected segment label", fg: "--color-bg", bg: "--color-accent-700", min: 4.5 },
  { what: "accent as non-text UI", fg: "--color-accent", bg: "--color-bg", min: 3 },
  { what: "tag / notice tint ground type", fg: "--color-accent-800", bg: "--color-accent-100", min: 4.5 },
  { what: "neutral tag type", fg: "--color-neutral-800", bg: "--color-neutral-100", min: 4.5 },
  { what: "text on a raised surface", fg: "--color-text", bg: "--color-surface", min: 4.5 },
];

/**
 * Tokens MASTER.md classifies as decoration. They are allowed to fail 4.5:1 — this
 * asserts they still fail, so nobody "fixes" one and starts using it for text.
 */
const NON_TEXT_ONLY = ["--color-neutral-600", "--color-neutral-500"];

/** Resolve the token set a case is painted with: the theme's `:root`, plus any scope. */
const resolve = (theme, scope) => (scope && theme.scopes[scope] ? { ...theme.root, ...theme.scopes[scope] } : theme.root);

const globals = await readFile(GLOBALS, "utf8");
const themeDark = await readFile(THEME_DARK, "utf8");

const light = { name: "light  (globals.css :root)", root: readBlock(globals, ":root"), scopes: {} };
const darkRoot = readBlock(themeDark, ":root");
if (!darkRoot) {
  console.error("No `:root` block in src/app/theme-dark.css — the dark theme is not being declared.");
  process.exit(1);
}
const dark = {
  name: "dark   (theme-dark.css @media prefers-color-scheme: dark)",
  // Dark redefines a subset; everything it does not name still comes from globals.
  root: { ...light.root, ...darkRoot },
  scopes: {},
};

let failed = 0;
for (const theme of [light, dark]) {
  console.log(`\n${theme.name}`);
  console.log("-".repeat(theme.name.length));

  const missing = [
    ...CASES.flatMap((c) => [c.fg, c.bg].filter((t) => !resolve(theme, c.scope)[t])),
    ...NON_TEXT_ONLY.filter((t) => !theme.root[t]),
  ];
  if (missing.length) {
    console.error(`Tokens not found — ${[...new Set(missing)].join(", ")}`);
    process.exit(1);
  }

  for (const { what, fg, bg, min, scope } of CASES) {
    const tokens = resolve(theme, scope);
    const r = ratio(tokens[fg], tokens[bg]);
    const ok = r >= min;
    if (!ok) failed++;
    const where = scope ? ` [${scope}]` : "";
    console.log(
      `${ok ? "pass" : "FAIL"}  ${r.toFixed(2).padStart(6)} : 1  (min ${min})  ${what}${where}  ${fg} on ${bg}`,
    );
  }

  for (const t of NON_TEXT_ONLY) {
    const r = ratio(theme.root[t], theme.root["--color-bg"]);
    if (r >= 4.5) {
      failed++;
      console.log(`FAIL  ${r.toFixed(2)} : 1  ${t} now passes as text — reclassify it in MASTER.md §2.2`);
    } else {
      console.log(`pass  ${r.toFixed(2).padStart(6)} : 1  (non-text only) ${t}`);
    }
  }
}

if (failed) {
  console.error(`\n${failed} contrast check(s) failed — see design-system/research-to-deck/MASTER.md §2.2`);
  process.exit(1);
}
console.log("\nAll contrast checks passed, light and dark.");
