import { randomToken, sha256 } from "./crypto";
import { q } from "./db";
import { type DailyUsage, type DeviceStatus, statusPreset } from "./heartbeat";
import { isPermittedUser } from "./keyAuth";

export type Device = {
  id: string;
  name: string;
  created_at: Date;
  last_seen_at: Date | null;
  revoked_at: Date | null;
  /** Last heartbeat or upload (migration 017). */
  heartbeat_at: Date | null;
  /** The last heartbeat's body (lib/heartbeat.ts DeviceStatus), unvalidated jsonb. */
  status: unknown;
};

export type DeviceAuth = { id: string; name: string; userId: string };

const TOKEN_RE = /^Bearer (mtk_[A-Za-z0-9_-]{43})$/;

export async function listDevices(userId: string): Promise<Device[]> {
  return q<Device>(
    `SELECT id, name, created_at, last_seen_at, revoked_at, heartbeat_at, status
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

/** Stores a heartbeat (POST /api/devices/heartbeat). */
export async function recordHeartbeat(deviceId: string, status: DeviceStatus): Promise<void> {
  await q(`UPDATE devices SET heartbeat_at = now(), status = $2 WHERE id = $1`, [deviceId, JSON.stringify(status)]);
  // A new recording preset starts a row in the change log (migration 019).
  const preset = statusPreset(status);
  if (preset) {
    await q(
      `INSERT INTO device_preset_log (device_id, preset, since)
       SELECT $1, $2::jsonb, now()
       WHERE (SELECT preset FROM device_preset_log WHERE device_id = $1 ORDER BY since DESC LIMIT 1)
             IS DISTINCT FROM $2::jsonb
       ON CONFLICT DO NOTHING`,
      [deviceId, JSON.stringify(preset)],
    );
  }
}

/**
 * The recorder's per-day totals from a heartbeat (migration 019). They are
 * running totals, so a row is replaced, unless the new one counts less time
 * (the app's data was reset mid-day): then the old one stays.
 */
export async function recordUsage(deviceId: string, usage: DailyUsage[]): Promise<void> {
  for (const u of usage) {
    const c = u.current;
    await q(
      `INSERT INTO device_daily_usage AS d (device_id, day, preset, active_s, standby_s, off_s, fixes, moving_s, still_s,
         cur_active_n, cur_active_mean_ma, cur_active_median_ma, cur_standby_n, cur_standby_mean_ma, cur_standby_median_ma,
         cur_screen_n, cur_screen_mean_ma, cur_screen_median_ma, drop_mah, drop_s)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       ON CONFLICT (device_id, day, preset) DO UPDATE SET
         active_s = EXCLUDED.active_s, standby_s = EXCLUDED.standby_s, off_s = EXCLUDED.off_s, fixes = EXCLUDED.fixes,
         moving_s = EXCLUDED.moving_s, still_s = EXCLUDED.still_s,
         cur_active_n = EXCLUDED.cur_active_n, cur_active_mean_ma = EXCLUDED.cur_active_mean_ma,
         cur_active_median_ma = EXCLUDED.cur_active_median_ma, cur_standby_n = EXCLUDED.cur_standby_n,
         cur_standby_mean_ma = EXCLUDED.cur_standby_mean_ma, cur_standby_median_ma = EXCLUDED.cur_standby_median_ma,
         cur_screen_n = EXCLUDED.cur_screen_n, cur_screen_mean_ma = EXCLUDED.cur_screen_mean_ma,
         cur_screen_median_ma = EXCLUDED.cur_screen_median_ma, drop_mah = EXCLUDED.drop_mah, drop_s = EXCLUDED.drop_s,
         updated_at = now()
       WHERE EXCLUDED.active_s + EXCLUDED.standby_s + EXCLUDED.off_s >= d.active_s + d.standby_s + d.off_s`,
      [
        deviceId,
        u.day,
        u.preset,
        u.activeS,
        u.standbyS,
        u.offS,
        u.fixes,
        u.movingS,
        u.stillS,
        c.active.n,
        c.active.mean,
        c.active.median,
        c.standby.n,
        c.standby.mean,
        c.standby.median,
        c.screen.n,
        c.screen.mean,
        c.screen.median,
        u.dropMah,
        u.dropS,
      ],
    );
  }
}

/** An upload is contact too. Throttled like last_seen_at. */
export async function touchHeartbeat(deviceId: string): Promise<void> {
  await q(
    `UPDATE devices SET heartbeat_at = now()
     WHERE id = $1 AND (heartbeat_at IS NULL OR heartbeat_at < now() - interval '1 minute')`,
    [deviceId],
  );
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
