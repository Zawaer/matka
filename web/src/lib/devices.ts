import { createHash, randomBytes } from "node:crypto";
import { q, USER_ID } from "./db";

export type Device = {
  id: string;
  name: string;
  created_at: Date;
  last_seen_at: Date | null;
  revoked_at: Date | null;
};

const TOKEN_RE = /^Bearer (mtk_[A-Za-z0-9_-]{43})$/;

const hashToken = (token: string) => createHash("sha256").update(token).digest();

/** `mtk_` + 32 random bytes as base64url (43 chars). */
function newToken(): string {
  return `mtk_${randomBytes(32).toString("base64url")}`;
}

export async function listDevices(): Promise<Device[]> {
  return q<Device>(
    `SELECT id, name, created_at, last_seen_at, revoked_at
     FROM matka_devices WHERE user_id = $1
     ORDER BY revoked_at IS NOT NULL, created_at DESC`,
    [USER_ID],
  );
}

/** Creates a device and returns its token. The token is never retrievable again. */
export async function createDevice(name: string): Promise<{ id: string; token: string }> {
  const token = newToken();
  const [row] = await q<{ id: string }>(
    `INSERT INTO matka_devices (user_id, name, token_hash) VALUES ($1, $2, $3) RETURNING id`,
    [USER_ID, name, hashToken(token)],
  );
  return { id: row.id, token };
}

export async function revokeDevice(id: string): Promise<void> {
  await q(
    `UPDATE matka_devices SET revoked_at = now()
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [id, USER_ID],
  );
}

/** Resolves `Authorization: Bearer mtk_…` to an active device, or null. */
export async function authenticateDevice(
  req: Request,
): Promise<{ id: string; name: string } | null> {
  const m = TOKEN_RE.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  const [device] = await q<{ id: string; name: string; stale: boolean }>(
    `SELECT id, name,
            (last_seen_at IS NULL OR last_seen_at < now() - interval '1 minute') AS stale
     FROM matka_devices
     WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [hashToken(m[1]), USER_ID],
  );
  if (!device) return null;
  // Throttled so a chatty collector doesn't write this row on every batch.
  if (device.stale) {
    await q(`UPDATE matka_devices SET last_seen_at = now() WHERE id = $1`, [device.id]);
  }
  return { id: device.id, name: device.name };
}
