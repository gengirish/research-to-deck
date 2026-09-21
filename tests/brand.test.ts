import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkLogo, lighten, MAX_LOGO_BYTES, parseBrand, toBrandConfig, type BrandConfig } from "../src/lib/brand";

const valid = { name: "Acme Strategy", footer: "acme.com · Confidential", primary: "#1d4ed8", accent: "F59E0B", dark: "#111827" };

describe("parseBrand", () => {
  it("normalises colors to bare uppercase hex", () => {
    const parsed = parseBrand(valid);
    expect(parsed).toEqual({
      ok: true,
      brand: { name: "Acme Strategy", footer: "acme.com · Confidential", primary: "1D4ED8", accent: "F59E0B", dark: "111827" },
    });
  });

  it("rejects a missing name and a bad color with a readable message", () => {
    expect(parseBrand({ ...valid, name: "  " })).toEqual({ ok: false, error: "Brand name must be 1–60 characters" });
    const bad = parseBrand({ ...valid, accent: "orange" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/^Accent color/);
  });

  it("allows an empty footer", () => {
    expect(parseBrand({ ...valid, footer: "" }).ok).toBe(true);
  });
});

describe("checkLogo", () => {
  it("reads the type from the file signature, not the upload's claim", () => {
    expect(checkLogo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toEqual({ ok: true, type: "image/png" });
    expect(checkLogo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ ok: true, type: "image/jpeg" });
    expect(checkLogo(new TextEncoder().encode("<svg xmlns=...>")).ok).toBe(false);
  });

  it("rejects an oversized file", () => {
    const big = new Uint8Array(MAX_LOGO_BYTES + 1);
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(checkLogo(big).ok).toBe(false);
  });
});

describe("toBrandConfig", () => {
  const base = JSON.parse(readFileSync(path.resolve("python/brand.json"), "utf8")) as BrandConfig;
  const parsed = parseBrand(valid);
  if (!parsed.ok) throw new Error("fixture must parse");

  it("lays the brand over the default and keeps fonts and neutral colors", () => {
    const config = toBrandConfig(base, parsed.brand, "/tmp/logo.png");
    expect(config.name).toBe("Acme Strategy");
    expect(config.fonts).toEqual(base.fonts);
    expect(config.colors.text).toBe(base.colors.text);
    expect(config.colors.primary).toBe("1D4ED8");
    expect(config.colors.primary_light).toBe(lighten("1D4ED8", 0.4));
    expect(config.logo_path).toBe("/tmp/logo.png");
  });

  it("lightens toward white", () => {
    expect(lighten("000000", 0)).toBe("000000");
    expect(lighten("000000", 1)).toBe("FFFFFF");
    expect(lighten("7C3AED", 0.5)).toBe("BE9DF6");
  });
});
