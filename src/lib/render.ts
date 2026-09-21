import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { toBrandConfig, type Brand, type BrandConfig, type BrandLogo } from "./brand";
import type { RenderDeck } from "./deckSchema";
import { env } from "./env";

const RENDER_SCRIPT = path.resolve(process.cwd(), "python", "render_deck.py");
const DEFAULT_BRAND = path.resolve(process.cwd(), "python", "brand.json");

/** A customer's brand to render with instead of the default python/brand.json. */
export interface RenderBrand {
  brand: Brand;
  logo: BrandLogo | null;
}

/**
 * Pipes the deck JSON to python-pptx and returns the .pptx bytes. A custom brand is
 * written into the same temp dir as a brand.json (and logo file) and handed to the
 * renderer through BRAND_CONFIG, the override render_deck.py already reads.
 */
export async function renderPptx(deck: RenderDeck, custom?: RenderBrand | null): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "deck-"));
  const outPath = path.join(dir, "deck.pptx");
  try {
    const childEnv: NodeJS.ProcessEnv = { ...process.env };
    if (custom) {
      let logoPath: string | null = null;
      if (custom.logo) {
        logoPath = path.join(dir, custom.logo.type === "image/png" ? "logo.png" : "logo.jpg");
        await writeFile(logoPath, custom.logo.bytes);
      }
      const base = JSON.parse(await readFile(DEFAULT_BRAND, "utf8")) as BrandConfig;
      const brandPath = path.join(dir, "brand.json");
      await writeFile(brandPath, JSON.stringify(toBrandConfig(base, custom.brand, logoPath)));
      childEnv.BRAND_CONFIG = brandPath;
    }
    await new Promise<void>((resolve, reject) => {
      const child = spawn(env.pythonBin, [RENDER_SCRIPT, outPath], { stdio: ["pipe", "pipe", "pipe"], env: childEnv });
      let stderr = "";
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`render_deck.py exited ${code}: ${stderr.trim()}`))));
      child.stdin.end(JSON.stringify(deck));
    });
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
