/**
 * The spacing grid from design-system/research-to-deck/MASTER.md §2.4, as a test.
 *
 * The rule is *even pixels* — a 4pt rhythm for layout, with the 2pt half-steps the
 * sheet already sits on allowed for component-internal padding. Odd values are the
 * thing this catches: they are how a grid stops being a grid, one nudge at a time.
 *
 * Every layer is checked, not just globals: the theme, motion and state layers are
 * stylesheets the same rule applies to, and a grid that covers one file is not a grid.
 *
 *   node scripts/check-spacing.mjs
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SHEETS = ["globals", "theme-dark", "motion", "states"].map((name) => ({
  name: `${name}.css`,
  path: fileURLToPath(new URL(`../src/app/${name}.css`, import.meta.url)),
}));

/** Properties that position things. Sizes (width, font-size, border) are not spacing. */
const SPACING = /^(margin|padding|gap|row-gap|column-gap)(-(top|right|bottom|left))?$/;

/**
 * Deliberate odd values that are not spacing at all:
 *  - `.vh` offsets itself by -1px; the clip-path pattern depends on it.
 *  - `.faq-grid` draws its hairline dividers with a 1px grid gap over a coloured
 *    background, so that 1px is a border, not a rhythm.
 */
const ALLOW = new Set(["-1px", "1px"]);

const problems = [];

for (const sheet of SHEETS) {
  const lines = (await readFile(sheet.path, "utf8")).split("\n");

  lines.forEach((line, i) => {
    const m = /^\s*([a-z-]+)\s*:\s*([^;]+);/.exec(line);
    if (!m) return;
    const [, prop, value] = m;
    if (!SPACING.test(prop)) return;
    // Tokens and fluid values are the system working as intended.
    if (value.includes("var(") || value.includes("clamp(")) return;

    for (const raw of value.match(/-?\d+(\.\d+)?px/g) ?? []) {
      if (ALLOW.has(raw)) continue;
      const n = Number.parseFloat(raw);
      if (n === 0) continue;
      if (!Number.isInteger(n) || n % 2 !== 0) {
        problems.push({ file: sheet.name, line: i + 1, prop, raw, text: line.trim() });
      }
    }
  });
}

if (problems.length) {
  console.error("Spacing off the grid — see MASTER.md §2.4:\n");
  for (const p of problems) {
    console.error(`  ${p.file}:${p.line}  ${p.raw} in ${p.prop}\n    ${p.text}`);
  }
  console.error(`\n${problems.length} off-grid value(s).`);
  process.exit(1);
}

console.log(`All spacing values are on the grid (${SHEETS.length} stylesheets).`);
