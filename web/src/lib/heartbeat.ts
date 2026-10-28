// Device heartbeats (docs/API.md → POST /api/devices/heartbeat) and the
// recording-health line on the Devices page. Pure, so it is unit-tested.

import { toEpochSeconds } from "./ingest";
import { isDate } from "./insights/time";
import {
  type CustomPreset,
  type PresetKey,
  PRESET_KEYS,
  type RecordingPreset,
  parseRecordingPreset,
} from "./recordingPreset";

export const MAX_HEARTBEAT_BYTES = 8192;
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
  /** The recording preset (apps from before it was reported: null). */
  preset: PresetKey | null;
  /** The "custom" preset's choices, else null. */
  custom: CustomPreset | null;
  smartTracking: boolean | null;
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

/** Whole-phone current samples (mA, discharge positive) in one state, unplugged. */
export type CurrentAgg = { n: number; mean: number | null; median: number | null };

/**
 * What the recorder did on one of the phone's local days with one preset
 * (running totals; stored in device_daily_usage).
 */
export type DailyUsage = {
  day: string;
  preset: PresetKey;
  activeS: number;
  standbyS: number;
  offS: number;
  fixes: number;
  movingS: number;
  stillS: number;
  /** Screen off with GPS active, screen off in standby, screen on. */
  current: { active: CurrentAgg; standby: CurrentAgg; screen: CurrentAgg };
  /** Charge-counter fall while unplugged (mAh) and the time it covers (s). */
  dropMah: number;
  dropS: number;
};

const MAX_USAGE_ROWS = 8;
const DAY_S = 90_000; // a 25 h DST day, with slack

const clampInt = (v: unknown, max: number) => (finite(v) && v >= 0 ? Math.min(Math.round(v), max) : 0);
const maOrNull = (v: unknown) => (finite(v) && v >= 0 && v <= 20_000 ? Math.round(v * 10) / 10 : null);

function parseCurrent(v: unknown): CurrentAgg {
  const o = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  const n = clampInt(o.n, 1_000_000);
  return n > 0 ? { n, mean: maOrNull(o.mean), median: maOrNull(o.median) } : { n: 0, mean: null, median: null };
}

/** The heartbeat's `usage` rows; malformed rows, unknown presets and days far from now are dropped. */
export function parseUsage(v: unknown, now = Date.now()): DailyUsage[] {
  if (!Array.isArray(v)) return [];
  const out: DailyUsage[] = [];
  const lo = new Date(now - 3 * 86_400_000).toISOString().slice(0, 10);
  const hi = new Date(now + 2 * 86_400_000).toISOString().slice(0, 10);
  for (const x of v.slice(0, MAX_USAGE_ROWS)) {
    if (typeof x !== "object" || x === null) continue;
    const o = x as Record<string, unknown>;
    if (typeof o.day !== "string" || !isDate(o.day) || o.day < lo || o.day > hi) continue;
    if (!oneOf(PRESET_KEYS, o.preset)) continue;
    if (out.some((u) => u.day === o.day && u.preset === o.preset)) continue;
    const cur = typeof o.current === "object" && o.current !== null ? (o.current as Record<string, unknown>) : {};
    out.push({
      day: o.day,
      preset: o.preset,
      activeS: clampInt(o.activeS, DAY_S),
      standbyS: clampInt(o.standbyS, DAY_S),
      offS: clampInt(o.offS, DAY_S),
      fixes: clampInt(o.fixes, 1_000_000),
      movingS: clampInt(o.movingS, DAY_S),
      stillS: clampInt(o.stillS, DAY_S),
      current: { active: parseCurrent(cur.active), standby: parseCurrent(cur.standby), screen: parseCurrent(cur.screen) },
      dropMah: finite(o.dropMah) && o.dropMah >= 0 ? Math.min(Math.round(o.dropMah * 10) / 10, 50_000) : 0,
      dropS: clampInt(o.dropS, DAY_S),
    });
  }
  return out;
}

/** Validates a heartbeat body. `recording` and `mode` are required; bad optional fields become null/0. */
export function parseHeartbeat(
  body: unknown,
  now = Date.now(),
): { ok: true; status: DeviceStatus; usage: DailyUsage[] } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "expected an object" };
  const b = body as Record<string, unknown>;
  if (typeof b.recording !== "boolean") return { ok: false, error: "recording must be a boolean" };
  if (!oneOf(MODES, b.mode)) return { ok: false, error: "mode must be active, standby or off" };
  const fixS = b.lastFixAt == null ? null : toEpochSeconds(b.lastFixAt, now);
  const preset = parseRecordingPreset(b);
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
      preset: preset?.preset ?? null,
      custom: preset?.custom ?? null,
      smartTracking: typeof b.smartTracking === "boolean" ? b.smartTracking : null,
    },
    usage: parseUsage(b.usage, now),
  };
}

/** Reads a stored status back (jsonb from the DB), or null if absent/malformed. */
export function readStatus(v: unknown): DeviceStatus | null {
  const r = parseHeartbeat(v, Date.now());
  return r.ok ? r.status : null;
}

/** The preset from a status, for device_preset_log; null when the app didn't report one. */
export function statusPreset(s: DeviceStatus): RecordingPreset | null {
  return s.preset ? { preset: s.preset, custom: s.custom, smartTracking: s.smartTracking } : null;
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
