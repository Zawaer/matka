import { decrypt } from "./crypto";
import { q } from "./db";

/**
 * `scheme://host[:port][/path]` without a trailing slash, or null. Query,
 * fragment and credentials are refused: they'd let a stored URL point the
 * server's requests somewhere other than what was verified.
 */
export function normalizeImmichUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password || u.search || u.hash || raw.includes("?") || raw.includes("#")) {
    return null;
  }
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}

export type ImmichConfig = { base: string; key: string };

/** The user's Immich server and API key (from Settings), or null if not set up. */
export async function immichFor(userId: string): Promise<ImmichConfig | null> {
  const [row] = await q<{ immich_url: string | null; immich_api_key: Buffer | null }>(
    `SELECT immich_url, immich_api_key FROM users WHERE id = $1`,
    [userId],
  );
  if (!row?.immich_url || !row.immich_api_key) return null;
  const key = decrypt(row.immich_api_key);
  const base = normalizeImmichUrl(row.immich_url);
  return key && base ? { base, key } : null;
}
