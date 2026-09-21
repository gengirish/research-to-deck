import type { Locator } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import { TOPIC } from "../fixtures/deckData";

/**
 * The motion contract, as tests — Phase 6 / MASTER.md §2.6.
 *
 * Motion is easy to regress silently: a stray `transition: all`, a token renamed, a
 * `width` animation sneaking back into a progress bar. These assertions read the
 * *resolved* style rather than the stylesheet text, so they fail on what the browser
 * actually does, not on what the CSS appears to say.
 *
 * Three things are being defended here:
 *   1. One rhythm — every interactive surface resolves to the same tokens.
 *   2. Compositor-only properties — `transform` and `opacity`, never `width`.
 *   3. `prefers-reduced-motion` genuinely neutralises all of it, delays included.
 */

/** Resolved value of one CSS property, as the browser computes it for that element. */
function computed(locator: Locator, prop: string): Promise<string> {
  return locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
}

/** Milliseconds from a computed time value ("0.15s", "150ms", "0s"). */
function ms(value: string): number {
  const v = value.trim();
  if (v.endsWith("ms")) return parseFloat(v);
  if (v.endsWith("s")) return parseFloat(v) * 1000;
  return parseFloat(v);
}

/** The longest entry in a comma-separated computed time list. */
function maxMs(value: string): number {
  return Math.max(...value.split(",").map(ms));
}

test.describe("Motion tokens", () => {
  test.use({ authState: "signed-in" });

  test("the four §2.6 tokens resolve on :root with their documented values", async ({ entryPage }) => {
    await entryPage.goto();
    const tokens = await entryPage.page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        durFast: s.getPropertyValue("--dur-fast").trim(),
        dur: s.getPropertyValue("--dur").trim(),
        durSlow: s.getPropertyValue("--dur-slow").trim(),
        easeOut: s.getPropertyValue("--ease-out").trim().replace(/\s+/g, ""),
      };
    });

    expect(tokens).toEqual({
      durFast: "150ms",
      dur: "220ms",
      durSlow: "320ms",
      easeOut: "cubic-bezier(.2,.8,.2,1)",
    });
  });

  test("exit durations are 60-70% of their matching enter duration", async ({ entryPage }) => {
    await entryPage.goto();
    const pairs = await entryPage.page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      const read = (n: string) => s.getPropertyValue(n).trim();
      return [
        [read("--dur-fast"), read("--dur-fast-exit")],
        [read("--dur"), read("--dur-exit")],
        [read("--dur-slow"), read("--dur-slow-exit")],
      ];
    });

    for (const [enter, exit] of pairs) {
      const ratio = ms(exit) / ms(enter);
      expect(ratio).toBeGreaterThanOrEqual(0.6);
      expect(ratio).toBeLessThanOrEqual(0.7);
    }
  });
});

test.describe("Interactive states share one rhythm", () => {
  test.use({ authState: "signed-in" });

  test("buttons, inputs, segments and nav links all transition, and none animates a layout property", async ({
    entryPage,
  }) => {
    await entryPage.goto();
    const page = entryPage.page;

    const surfaces = [".btn", ".input", ".seg-opt", ".nav a"];
    for (const selector of surfaces) {
      const el = page.locator(selector).first();
      const props = (await computed(el, "transition-property")).split(",").map((p) => p.trim());

      // Something must actually transition…
      expect(maxMs(await computed(el, "transition-duration")), `${selector} has no transition`).toBeGreaterThan(0);
      // …and it must never be a property that reflows the page.
      for (const banned of ["width", "height", "top", "left", "margin", "padding", "all"]) {
        expect(props, `${selector} transitions ${banned}`).not.toContain(banned);
      }
    }
  });

  test("leaving is quicker than arriving (exit-faster-than-enter)", async ({ entryPage }) => {
    await entryPage.goto();
    const button = entryPage.generateButton;

    const atRest = maxMs(await computed(button, "transition-duration"));
    await button.hover();
    const onHover = maxMs(await computed(button, "transition-duration"));

    expect(onHover).toBe(150); // --dur-fast
    expect(atRest).toBe(100); // --dur-fast-exit
    expect(atRest).toBeLessThan(onHover);
  });

  test("micro-interactions stay inside the 150-300ms band", async ({ entryPage }) => {
    await entryPage.goto();
    const page = entryPage.page;

    for (const selector of [".btn", ".input", ".seg-opt", ".nav a"]) {
      const el = page.locator(selector).first();
      await el.hover();
      const d = maxMs(await computed(el, "transition-duration"));
      expect(d, `${selector} hover duration`).toBeGreaterThanOrEqual(150);
      expect(d, `${selector} hover duration`).toBeLessThanOrEqual(300);
    }
  });
});

/**
 * Signed *out*, deliberately: every `.btn` on the signed-in entry view carries the
 * `.blueprint` frame, and framed buttons are exempt from the squeeze (see motion.css).
 * The header's "Sign in" is the unframed button this contract is about.
 */
test.describe("Press feedback", () => {
  test.use({ authState: "signed-out" });

  test("a held button squeezes to 0.98 and springs back on release", async ({ entryPage }) => {
    await entryPage.goto();
    const page = entryPage.page;
    const button = page.locator(".btn:not(.blueprint)").first();
    await expect(button).toBeVisible();

    expect(await computed(button, "transform")).toBe("none");

    const box = (await button.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // matrix(0.98, 0, 0, 0.98, 0, 0) once the 150ms transition has landed.
    await expect
      .poll(async () => (await computed(button, "transform")).startsWith("matrix(0.98"), { timeout: 2_000 })
      .toBe(true);

    await page.mouse.up();
    await expect.poll(async () => computed(button, "transform"), { timeout: 2_000 }).toBe("none");
  });

  test("pressing does not round the corners or move the box", async ({ entryPage }) => {
    await entryPage.goto();
    const page = entryPage.page;
    const button = page.locator(".btn:not(.blueprint)").first();
    await expect(button).toBeVisible();

    const before = (await button.boundingBox())!;
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    expect(await computed(button, "border-radius")).toBe("0px");
    // A transform never changes layout geometry, only paint — offsetWidth is unmoved.
    const layoutWidth = await button.evaluate((el) => (el as HTMLElement).offsetWidth);
    await page.mouse.up();
    expect(layoutWidth).toBe(Math.round(before.width));
  });
});

test.describe("Progress bars animate transform, not width", () => {
  test.use({ authState: "signed-in" });

  test(".meter fill is driven by scaleX on the token timing", async ({ deckApi, entryPage, runPage }) => {
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();
    await expect(runPage.runTitle).toBeVisible();

    const fill = runPage.meterFill;
    expect((await computed(fill, "transition-property")).trim()).toBe("transform");
    expect(maxMs(await computed(fill, "transition-duration"))).toBe(320); // --dur-slow
    expect(await computed(fill, "transform-origin")).toMatch(/^0px /);

    // The fill is a full-width box scaled down — its *layout* width never changes.
    const widthBefore = await fill.evaluate((el) => (el as HTMLElement).offsetWidth);
    deckApi.advance(2);
    await expect.poll(async () => computed(fill, "transform")).not.toBe("matrix(0, 0, 0, 1, 0, 0)");
    expect(await fill.evaluate((el) => (el as HTMLElement).offsetWidth)).toBe(widthBefore);
  });

  // Converted at integration: ResultView now emits `transform: scaleX(coverage/100)`
  // and globals.css gives the fill `width: 100%; transform-origin: left`. This was the
  // last layout-property animation in the app.
  test(".bar-mini fill is driven by scaleX", async ({ deckApi, entryPage, resultPage }) => {
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();
    deckApi.finish();
    await expect(resultPage.title).toBeVisible();

    const fill = entryPage.page.locator(".bar-mini > div");
    expect((await computed(fill, "transition-property")).trim()).toBe("transform");
    expect(await computed(fill, "transform-origin")).toMatch(/^0px /);
  });
});

test.describe("Activity log entry", () => {
  test.use({ authState: "signed-in" });

  test("log lines fade in, and the stagger is capped so a burst cannot cascade for a second", async ({
    deckApi,
    entryPage,
    runPage,
  }) => {
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();
    await expect(runPage.runTitle).toBeVisible();
    deckApi.finish();
    await expect.poll(async () => runPage.logLines.count(), { timeout: 15_000 }).toBeGreaterThan(2);

    const delays = await runPage.logLines.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).animationDelay),
    );
    const values = delays.map(ms);

    // Every line animates on entry…
    const durations = await runPage.logLines.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).animationDuration),
    );
    for (const d of durations) expect(ms(d)).toBeGreaterThan(0);

    // …the first lines step by 30ms…
    expect(values[0]).toBe(0);
    if (values.length > 1) expect(values[1]).toBe(30);

    // …and nothing ever waits longer than the cap. 40 events must not queue 1.2s.
    for (const v of values) expect(v).toBeLessThanOrEqual(210);
  });
});

/**
 * `prefers-reduced-motion` is neutralised in two places and both are load-bearing:
 * globals.css zeroes every *duration*, motion.css zeroes every *delay* and drops the
 * press squeeze. The second half is the one a refactor would quietly lose.
 */
test.describe("Reduced motion", () => {
  test.use({ reducedMotion: "reduce", authState: "signed-out" });

  test("no interactive surface transitions, and nothing squeezes on press", async ({ entryPage }) => {
    await entryPage.goto();
    const page = entryPage.page;

    for (const selector of [".btn", ".input", ".seg-opt", ".nav a"]) {
      const el = page.locator(selector).first();
      expect(maxMs(await computed(el, "transition-duration")), selector).toBeLessThanOrEqual(1);
      expect(maxMs(await computed(el, "transition-delay")), selector).toBe(0);
    }

    // A press must not squeeze when motion is reduced — colour alone confirms it.
    const button = page.locator(".btn:not(.blueprint)").first();
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    expect(await computed(button, "transform")).toBe("none");
    await page.mouse.up();
  });
});

test.describe("Reduced motion — the activity log", () => {
  test.use({ reducedMotion: "reduce", authState: "signed-in" });

  test("log lines carry no animation delay", async ({ deckApi, entryPage, runPage }) => {
    // This is the delay that matters most: with `animation-fill-mode: both`, a
    // surviving delay would hold a new line invisible for up to 210ms — a lag served
    // to exactly the people who asked for less motion.
    await entryPage.goto();
    await entryPage.fillForm({ topic: TOPIC });
    await entryPage.submit();
    await expect(runPage.runTitle).toBeVisible();
    deckApi.finish();
    await expect.poll(async () => runPage.logLines.count(), { timeout: 15_000 }).toBeGreaterThan(0);

    const logStyles = await runPage.logLines.evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return { delay: s.animationDelay, duration: s.animationDuration, opacity: s.opacity };
      }),
    );
    for (const s of logStyles) {
      expect(ms(s.delay)).toBe(0);
      expect(ms(s.duration)).toBeLessThanOrEqual(1);
      expect(Number(s.opacity)).toBe(1);
    }
  });
});
