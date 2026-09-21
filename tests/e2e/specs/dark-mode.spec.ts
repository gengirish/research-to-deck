import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { TOPIC } from "../fixtures/deckData";

/**
 * Dark mode, as tests — Phase 5.
 *
 * The theme is a token redefinition (`src/app/theme-dark.css`), so the thing worth
 * testing is not "does a class exist" but **what the browser actually computes** once
 * `prefers-color-scheme: dark` is honoured. Every assertion here reads back rendered
 * values: composited background colours, effective text contrast, the blueprint
 * grid's painted `background-image`.
 *
 * `scripts/check-contrast.mjs` already asserts the token *law* for both themes from
 * the stylesheets. It cannot know which token a given element ends up painted with —
 * that is what these tests add, and it is where a dark theme usually breaks: an
 * island whose children hard-code a paper hex, or a blend mode whose
 * result no token can reach.
 *
 * Clerk's widget is excluded throughout: `.cl-*` markup ships its own light palette
 * and is not ours to theme.
 */

/** WCAG 2.1: 4.5:1 for body text, 3:1 once it is large (24px, or 18.66px bold). */
interface ContrastFailure {
  where: string;
  text: string;
  fontSize: number;
  ratio: number;
  required: number;
}

/**
 * Walk every element that owns visible text, composite its colour and its nearest
 * opaque ancestor background, and report the pairs that miss their floor. This is
 * the real rendered value — alpha, `color-mix()` and inherited grounds included.
 */
async function contrastFailures(page: Page): Promise<ContrastFailure[]> {
  return page.evaluate(() => {
    const parse = (value: string): number[] => {
      const n = (value.match(/[\d.]+/g) ?? []).map(Number).filter((v) => !Number.isNaN(v));
      // Chrome serialises color-mix() as `color(srgb r g b / a)` on a 0..1 scale.
      if (value.startsWith("color(")) return [n[0] * 255, n[1] * 255, n[2] * 255, n.length > 3 ? n[3] : 1];
      return n;
    };
    const luminance = ([r, g, b]: number[]): number => {
      const [lr, lg, lb] = [r, g, b]
        .map((c) => c / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    };
    const ratio = (a: number[], b: number[]): number => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    /** The first ancestor that actually paints something opaque behind this element. */
    const groundOf = (el: Element): number[] => {
      let node: Element | null = el;
      while (node) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c.length === 3 || c[3] > 0.95) return c.slice(0, 3);
        node = node.parentElement;
      }
      return [255, 255, 255];
    };
    const over = (fg: number[], bg: number[]): number[] => {
      const a = fg.length > 3 ? fg[3] : 1;
      return [0, 1, 2].map((i) => a * fg[i] + (1 - a) * bg[i]);
    };

    const out: ContrastFailure[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (el.closest(".cl-rootBox")) continue;
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
        .map((n) => n.textContent!.trim())
        .join(" ");
      if (!own) continue;

      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
      // .vh is clipped to 1px for screen readers; it is never seen.
      if (el.classList.contains("vh") || el.closest(".vh")) continue;

      const fontSize = Number.parseFloat(cs.fontSize);
      const bold = (Number(cs.fontWeight) || 400) >= 700;
      const required = fontSize >= 24 || (fontSize >= 18.66 && bold) ? 3 : 4.5;
      const ground = groundOf(el);
      const value = ratio(over(parse(cs.color), ground), ground);
      if (value < required) {
        out.push({
          where: el.className || el.tagName,
          text: own.slice(0, 60),
          fontSize,
          ratio: Math.round(value * 100) / 100,
          required,
        });
      }
    }
    return out;
  });
}

/** Composited sRGB of a computed colour property, resolved against the page ground. */
async function renderedColor(page: Page, selector: string, property: string): Promise<string> {
  return page.locator(selector).first().evaluate(
    (el, prop) => getComputedStyle(el).getPropertyValue(prop),
    property,
  );
}

const relativeLuminance = (rgb: number[]): number => {
  const [r, g, b] = rgb.map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const channels = (value: string): number[] => {
  const n = (value.match(/[\d.]+/g) ?? []).map(Number);
  return value.startsWith("color(") ? [n[0] * 255, n[1] * 255, n[2] * 255] : n.slice(0, 3);
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [relativeLuminance(channels(a)), relativeLuminance(channels(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test.describe("Dark mode", () => {
  test.use({ authState: "signed-in", colorScheme: "dark" });

  test("the dark ground is what the browser actually paints", async ({ entryPage }) => {
    await entryPage.goto();
    const { page } = entryPage;

    // --color-bg, redefined in theme-dark.css. If the media query never matched,
    // this is still rgb(242, 242, 243) and every assertion below is meaningless.
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(20, 25, 30)");
    // colorScheme: "light dark" in layout.tsx — the UA paints form controls,
    // scrollbars and the caret to match, instead of leaving light chrome behind.
    const scheme = await renderedColor(page, "html", "color-scheme");
    expect(scheme).toContain("dark");

    const text = await renderedColor(page, "body", "color");
    expect(contrast(text, "rgb(20, 25, 30)")).toBeGreaterThanOrEqual(4.5);
  });

  test("no text on the entry view misses its contrast floor", async ({ entryPage }) => {
    await entryPage.goto();
    expect(await contrastFailures(entryPage.page)).toEqual([]);
  });

  test("no text on the run view misses its contrast floor", async ({ deckApi, entryPage, runPage }) => {
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();
    await expect(runPage.runTitle).toBeVisible();
    deckApi.advance();
    await expect(runPage.phaseStat("OpenAlex screening")).toHaveText("4 papers");

    expect(await contrastFailures(entryPage.page)).toEqual([]);
  });

  test("no text on the result view misses its contrast floor", async ({ deckApi, entryPage, resultPage }) => {
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    deckApi.finish();
    await entryPage.submit();
    await expect(resultPage.title).toBeVisible();

    expect(await contrastFailures(entryPage.page)).toEqual([]);
  });

  test("tint grounds are dark tints, not light ones bolted onto a dark page", async ({
    deckApi,
    entryPage,
    runPage,
    resultPage,
  }) => {
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();
    await expect(runPage.runTitle).toBeVisible();
    deckApi.breakPolling();

    // .notice — the stale-polling banner, on --color-accent-100.
    const notice = entryPage.page.getByRole("status");
    await expect(notice).toBeVisible({ timeout: 15_000 });
    const noticeGround = await renderedColor(entryPage.page, ".notice", "background-color");
    const noticeText = await renderedColor(entryPage.page, ".notice", "color");
    expect(relativeLuminance(channels(noticeGround))).toBeLessThan(relativeLuminance(channels(noticeText)));
    expect(contrast(noticeText, noticeGround)).toBeGreaterThanOrEqual(4.5);

    deckApi.restorePolling();
    deckApi.finish();
    await expect(resultPage.title).toBeVisible();

    // .thumb-on — the selected slide's --color-accent-100 ground, plus its border,
    // which is what stops selection being signalled by fill alone.
    const selected = await renderedColor(entryPage.page, ".thumb-on", "background-color");
    const border = await renderedColor(entryPage.page, ".thumb-on", "border-top-color");
    expect(relativeLuminance(channels(selected))).toBeLessThan(relativeLuminance([128, 128, 128]));
    expect(contrast(border, selected)).toBeGreaterThanOrEqual(3);
  });

  test("hairlines and focus rings stay visible on the dark ground", async ({ entryPage }) => {
    await entryPage.goto();
    const { page } = entryPage;

    // The divider is a 22% tint of --color-text; the light theme's equivalent lands
    // at 1.38:1, so this is the floor a hairline has to clear to still be a line.
    const rule = await page.locator(".site-footer").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { border: cs.borderTopColor, ground: getComputedStyle(document.body).backgroundColor };
    });
    const parsed = channels(rule.border);
    const alpha = (rule.border.match(/[\d.]+/g) ?? []).map(Number).at(-1) ?? 1;
    const ground = channels(rule.ground);
    const composited = [0, 1, 2].map((i) => alpha * parsed[i] + (1 - alpha) * ground[i]);
    const dividerRatio = (() => {
      const [hi, lo] = [relativeLuminance(composited), relativeLuminance(ground)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    })();
    expect(dividerRatio).toBeGreaterThan(1.38);

    // Focus is non-text UI: 3:1 against what surrounds it. A click, not .focus(),
    // because the ring is drawn by :focus-visible.
    await entryPage.topicInput.click();
    const ring = await entryPage.topicInput.evaluate((el) => {
      const cs = getComputedStyle(el);
      // The global ring is the outline; .input also swaps its border to the accent.
      return Number.parseFloat(cs.outlineWidth) > 0 ? cs.outlineColor : cs.borderTopColor;
    });
    expect(contrast(ring, "rgb(20, 25, 30)")).toBeGreaterThanOrEqual(3);
  });

  test("the primary action is still a filled block with reversed type", async ({ entryPage }) => {
    await entryPage.goto();
    const { page } = entryPage;
    const ground = await renderedColor(page, ".btn-primary", "background-color");
    const label = await renderedColor(page, ".btn-primary", "color");
    expect(contrast(label, ground)).toBeGreaterThanOrEqual(4.5);
    // Filled, not outlined: the button reads against the page, not only its border.
    expect(contrast(ground, "rgb(20, 25, 30)")).toBeGreaterThanOrEqual(3);
  });
});

/**
 * The other half of the contract: the dark block must be *conditional*. A
 * `@media (prefers-color-scheme: dark)` typo — a stray closing brace, an import
 * dropped from layout.tsx — shows up as the dark ground leaking into light mode, and
 * nothing in the dark suite above would notice.
 */
test.describe("Light mode is unaffected", () => {
  test.use({ authState: "signed-in", colorScheme: "light" });

  test("the paper ground and the light ramps still apply", async ({ entryPage }) => {
    await entryPage.goto();
    const { page } = entryPage;
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(242, 242, 243)");
    // Muted text resolves to the light ramp's neutral-700, not the dark one's.
    const muted = await renderedColor(page, ".submit-note", "color");
    expect(relativeLuminance(channels(muted))).toBeLessThan(relativeLuminance([242, 242, 243]));
    // And the primary action is a dark block carrying paper type, as it is on paper.
    const cta = await renderedColor(page, ".btn-primary", "background-color");
    expect(relativeLuminance(channels(cta))).toBeLessThan(relativeLuminance([242, 242, 243]));
  });
});
