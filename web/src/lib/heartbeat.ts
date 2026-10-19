// Device heartbeats (docs/API.md → POST /api/devices/heartbeat) and the
// recording-health line on the Devices page. Pure, so it is unit-tested.

import { toEpochSeconds } from "./ingest";

export const MAX_HEARTBEAT_BYTES = 4096;
/** Recording on and nothing heard from the phone for this long: warn. */
export const NO_CONTACT_WARN_MS = 3 * 60 * 60_000;

export const MODES = ["active", "standby", "off"] as const;
export type HeartbeatMode = (typeof MODES)[number];
export const PROBLEMS = ["permission", "not_running"] as const;
export type Problem = (typeof PROBLEMS)[number];

/** What the phone said in its last heartbeat (stored in devices.status). */
export type DeviceStatus = {
  recording: boolean;
  mode: HeartbeatMode;
  /** ISO-8601, or null before the first fix. */
  lastFixAt: string | null;
  queued: number | null;
  appVersion: string | null;
  /** Watchdog restarts in the last 24 h. */
  recoveries: number;
  problem: Problem | null;
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

/** Validates a heartbeat body. `recording` and `mode` are required; bad optional fields become null/0. */
export function parseHeartbeat(
  body: unknown,
  now = Date.now(),
): { ok: true; status: DeviceStatus } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "expected an object" };
  const b = body as Record<string, unknown>;
  if (typeof b.recording !== "boolean") return { ok: false, error: "recording must be a boolean" };
  if (!oneOf(MODES, b.mode)) return { ok: false, error: "mode must be active, standby or off" };
  const fixS = b.lastFixAt == null ? null : toEpochSeconds(b.lastFixAt, now);
  return {
    ok: true,
    status: {
      recording: b.recording,
      mode: b.recording ? b.mode : "off",
      lastFixAt: fixS == null ? null : new Date(fixS * 1000).toISOString(),
      queued: finite(b.queued) && b.queued >= 0 ? Math.round(b.queued) : null,
      appVersion: typeof b.appVersion === "string" && b.appVersion.trim() ? b.appVersion.trim().slice(0, 64) : null,
      recoveries: finite(b.recoveries) && b.recoveries >= 0 ? Math.min(Math.round(b.recoveries), 1000) : 0,
      problem: b.recording && oneOf(PROBLEMS, b.problem) ? b.problem : null,
    },
  };
}

/** Reads a stored status back (jsonb from the DB), or null if absent/malformed. */
export function readStatus(v: unknown): DeviceStatus | null {
  const r = parseHeartbeat(v, Date.now());
  return r.ok ? r.status : null;
}

/** "0 min", "12 min", "5 h", "3 d". */
export function span(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}
const ago = (ms: number) => (ms < 60_000 ? "just now" : `${span(ms)} ago`);

export type Health = { tone: "ok" | "warn" | "bad" | "muted"; text: string };

/**
 * One line about a (non-revoked) device's recording: "Recording · last location
 * 12 min ago · standby", "No contact for 5 h while recording was on", …
 * Returns null for devices that never sent a heartbeat (older apps).
 */
export function deviceHealth(
  d: { heartbeat_at: Date | null; last_seen_at: Date | null; status: unknown },
  now = Date.now(),
): Health | null {
  const s = readStatus(d.status);
  if (!s) return null;
  const contacts = [d.heartbeat_at, d.last_seen_at].filter((x): x is Date => x != null).map((x) => x.getTime());
  const lastContact = contacts.length > 0 ? Math.max(...contacts) : null;
  const silent = lastContact == null ? Infinity : now - lastContact;

  if (!s.recording) {
    return { tone: "warn", text: `Recording is off on this phone${lastContact != null ? ` · last contact ${ago(silent)}` : ""}` };
  }
  if (silent > NO_CONTACT_WARN_MS) {
    return { tone: "bad", text: `No contact for ${span(silent)} while recording was on` };
  }
  if (s.problem === "permission") {
    return { tone: "bad", text: "Recording is on, but background location permission is missing" };
  }
  if (s.problem === "not_running") {
    return { tone: "bad", text: "Recording is on, but location updates aren't running" };
  }
  const parts = ["Recording"];
  const fix = s.lastFixAt ? Date.parse(s.lastFixAt) : NaN;
  parts.push(Number.isFinite(fix) ? `last location ${ago(now - fix)}` : "no location yet");
  if (s.mode === "standby") parts.push("standby");
  if (s.recoveries > 0) parts.push(`${s.recoveries === 1 ? "1 restart" : `${s.recoveries} restarts`} in 24 h`);
  return { tone: s.recoveries > 0 ? "warn" : "ok", text: parts.join(" · ") };
}
