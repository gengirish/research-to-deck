import { getPool } from "./db";

/** A saved deck brand. Colors are 6-digit hex without '#', the format brand.json uses. */
export interface Brand {
  name: string;
  footer: string;
  primary: string;
  accent: string;
  dark: string;
}

export interface BrandLogo {
  bytes: Buffer;
  type: LogoType;
}

export const LOGO_TYPES = ["image/png", "image/jpeg"] as const;
export type LogoType = (typeof LOGO_TYPES)[number];
/** Logos are stored in Postgres next to the brand, so keep them small. */
export const MAX_LOGO_BYTES = 512 * 1024;

const HEX = /^#?([0-9a-fA-F]{6})$/;

/**
 * Validates brand form fields. Returns the normalised brand, or the first problem as a
 * message fit to show the person who typed it.
 */
export function parseBrand(input: Record<string, unknown>): { ok: true; brand: Brand } | { ok: false; error: string } {
  const text = (key: string) => (typeof input[key] === "string" ? (input[key] as string).trim() : "");
  const name = text("name");
  const footer = text("footer");
  if (!name || name.length > 60) return { ok: false, error: "Brand name must be 1–60 characters" };
  if (footer.length > 80) return { ok: false, error: "Footer must be at most 80 characters" };

  const colors: Record<"primary" | "accent" | "dark", string> = { primary: "", accent: "", dark: "" };
  for (const key of ["primary", "accent", "dark"] as const) {
    const m = HEX.exec(text(key));
    if (!m) return { ok: false, error: `${key[0].toUpperCase()}${key.slice(1)} color must be a hex value like #7C3AED` };
    colors[key] = m[1].toUpperCase();
  }
  return { ok: true, brand: { name, footer, ...colors } };
}

/**
 * Checks an uploaded logo and returns its real type, or an error message. The type is
 * read from the file's signature, not the browser's claim: python-pptx fails the whole
 * render on a file that is not really an image.
 */
export function checkLogo(bytes: Uint8Array): { ok: true; type: LogoType } | { ok: false; error: string } {
  if (bytes.byteLength > MAX_LOGO_BYTES) return { ok: false, error: `Logo must be under ${MAX_LOGO_BYTES / 1024} KB` };
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ok: true, type: "image/png" };
  if (starts([0xff, 0xd8, 0xff])) return { ok: true, type: "image/jpeg" };
  return { ok: false, error: "Logo must be a PNG or JPEG" };
}

/** Blends a hex color toward white; `amount` 0 keeps it, 1 is white. */
export function lighten(hex: string, amount: number): string {
  const channels = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return channels
    .map((c) => Math.round(c + (255 - c) * amount).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * The brand.json the renderer reads, built from the default one with this brand laid
 * over it. Fonts and the neutral text colors stay the defaults: a brand picks identity,
 * not legibility.
 */
export function toBrandConfig(base: BrandConfig, brand: Brand, logoPath: string | null): BrandConfig {
  return {
    ...base,
    name: brand.name,
    footer: brand.footer,
    colors: {
      ...base.colors,
      primary: brand.primary,
      primary_light: lighten(brand.primary, 0.4),
      accent: brand.accent,
      dark: brand.dark,
    },
    logo_path: logoPath,
  };
}

/** The shape of python/brand.json. */
export interface BrandConfig {
  name: string;
  footer: string;
  fonts: { heading: string; body: string };
  colors: Record<string, string>;
  logo_path: string | null;
}

interface BrandRow {
  name: string;
  footer: string;
  primary_color: string;
  accent_color: string;
  dark_color: string;
  logo: Buffer | null;
  logo_type: LogoType | null;
}

export async function getBrand(userId: string): Promise<{ brand: Brand; logo: BrandLogo | null } | null> {
  const { rows } = await getPool().query<BrandRow>(
    `SELECT name, footer, primary_color, accent_color, dark_color, logo, logo_type FROM brands WHERE user_id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    brand: { name: row.name, footer: row.footer, primary: row.primary_color, accent: row.accent_color, dark: row.dark_color },
    logo: row.logo && row.logo_type ? { bytes: row.logo, type: row.logo_type } : null,
  };
}

export async function hasBrand(userId: string): Promise<boolean> {
  const { rowCount } = await getPool().query(`SELECT 1 FROM brands WHERE user_id = $1`, [userId]);
  return rowCount === 1;
}

/**
 * Saves the brand. `logo` undefined keeps the stored logo, null removes it, and a value
 * replaces it.
 */
export async function saveBrand(userId: string, brand: Brand, logo: BrandLogo | null | undefined): Promise<void> {
  const keepLogo = logo === undefined;
  await getPool().query(
    `INSERT INTO brands (user_id, name, footer, primary_color, accent_color, dark_color, logo, logo_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id) DO UPDATE SET
       name = EXCLUDED.name, footer = EXCLUDED.footer, primary_color = EXCLUDED.primary_color,
       accent_color = EXCLUDED.accent_color, dark_color = EXCLUDED.dark_color,
       logo = CASE WHEN $9::boolean THEN brands.logo ELSE EXCLUDED.logo END,
       logo_type = CASE WHEN $9::boolean THEN brands.logo_type ELSE EXCLUDED.logo_type END,
       updated_at = now()`,
    [userId, brand.name, brand.footer, brand.primary, brand.accent, brand.dark, logo?.bytes ?? null, logo?.type ?? null, keepLogo],
  );
}

export async function deleteBrand(userId: string): Promise<void> {
  await getPool().query(`DELETE FROM brands WHERE user_id = $1`, [userId]);
}
