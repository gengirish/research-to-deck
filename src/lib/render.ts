import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RenderDeck } from "./deckSchema";
import { env } from "./env";

const RENDER_SCRIPT = path.resolve(process.cwd(), "python", "render_deck.py");

/** Pipes the deck JSON to python-pptx and returns the .pptx bytes. */
export async function renderPptx(deck: RenderDeck): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "deck-"));
  const outPath = path.join(dir, "deck.pptx");
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(env.pythonBin, [RENDER_SCRIPT, outPath], { stdio: ["pipe", "pipe", "pipe"] });
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
