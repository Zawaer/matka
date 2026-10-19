import { randomToken, sha256 } from "./crypto";
import { q } from "./db";
import { isPermittedUser } from "./keyAuth";

export type Device = {
  id: string;
  name: string;
  created_at: Date;
  last_seen_at: Date | null;
  revoked_at: Date | null;
};

export type DeviceAuth = { id: string; name: string; userId: string };

const TOKEN_RE = /^Bearer (mtk_[A-Za-z0-9_-]{43})$/;

export async function listDevices(userId: string): Promise<Device[]> {
  return q<Device>(
    `SELECT id, name, created_at, last_seen_at, revoked_at
     FROM devices WHERE user_id = $1
     ORDER BY revoked_at IS NOT NULL, created_at DESC`,
    [userId],
  );
}

/** Creates a device and returns its token (`mtk_` + 43 chars). Never retrievable again. */
export async function createDevice(userId: string, name: string): Promise<string> {
  const token = `mtk_${randomToken()}`;
  await q(`INSERT INTO devices (user_id, name, token_hash) VALUES ($1, $2, $3)`, [
    userId,
    name,
    sha256(token),
  ]);
  return token;
}

export async function revokeDevice(userId: string, id: string): Promise<void> {
  await q(
    `UPDATE devices SET revoked_at = now()
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [id, userId],
  );
}

/**
 * Forgets a revoked device. Only revoked ones, so a working phone can't be
 * removed by accident; its points stay (points.device_id becomes NULL).
 */
export async function deleteDevice(userId: string, id: string): Promise<void> {
  await q(`DELETE FROM devices WHERE id = $1 AND user_id = $2 AND revoked_at IS NOT NULL`, [id, userId]);
}

/** Resolves `Authorization: Bearer mtk_…` to an active device, or null. */
export async function authenticateDevice(req: Request): Promise<DeviceAuth | null> {
  const m = TOKEN_RE.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  const [device] = await q<
    DeviceAuth & { stale: boolean; oidc_sub: string; email: string | null; email_verified: boolean }
  >(
    `SELECT d.id, d.name, d.user_id AS "userId", u.oidc_sub, u.email, u.email_verified,
            (d.last_seen_at IS NULL OR d.last_seen_at < now() - interval '1 minute') AS stale
     FROM devices d JOIN users u ON u.id = d.user_id
     WHERE d.token_hash = $1 AND d.revoked_at IS NULL`,
    [sha256(m[1])],
  );
  if (!device) return null;
  // Someone removed from the allowlist (or not the key-mode owner) loses their devices too.
  if (!isPermittedUser({ sub: device.oidc_sub, email: device.email, email_verified: device.email_verified })) {
    return null;
  }
  // Throttled so a chatty collector doesn't write this row on every batch.
  if (device.stale) {
    await q(`UPDATE devices SET last_seen_at = now() WHERE id = $1`, [device.id]);
  }
  return { id: device.id, name: device.name, userId: device.userId };
}
