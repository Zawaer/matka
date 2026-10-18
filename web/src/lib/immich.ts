import { decrypt } from "./crypto";
import { q } from "./db";

export type ImmichConfig = { base: string; key: string };

/** The user's Immich server and API key (from Settings), or null if not set up. */
export async function immichFor(userId: string): Promise<ImmichConfig | null> {
  const [row] = await q<{ immich_url: string | null; immich_api_key: Buffer | null }>(
    `SELECT immich_url, immich_api_key FROM users WHERE id = $1`,
    [userId],
  );
  if (!row?.immich_url || !row.immich_api_key) return null;
  const key = decrypt(row.immich_api_key);
  return key ? { base: row.immich_url.replace(/\/+$/, ""), key } : null;
}
