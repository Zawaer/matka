// Recording watchdog: pure decision logic (no native imports, unit-tested).
//
// Android (OnePlus especially) can stop background location updates without
// telling anyone: the task stays "wanted" but no fixes arrive. watchdog.ts
// runs check() from a periodic background task (~every 15 min, OS-scheduled),
// when the app comes to the foreground and on motion events, and acts on the
// decision made here.

import type { CustomSettings } from "./preset-logic";
import type { UsageRow } from "./usage-logic";

/** No fix for this long while motion says we're moving: updates are broken. */
export const MOVING_STALE_MS = 20 * 60_000;
/** A moving activity reading counts as "moving recently" for this long. */
export const MOVING_RECENT_MS = 30 * 60_000;
/**
 * No fix for this long outside standby (GPS mode) when smart tracking would
 * have put a still phone in standby: active and silent means broken.
 */
export const ACTIVE_STALE_MS = 45 * 60_000;
/**
 * Outside standby when it can't tell (smart tracking off, "Low power", no
 * motion sensor): a still phone gets no fixes (distance filter), so wait longer.
 */
export const QUIET_ACTIVE_STALE_MS = 2 * 60 * 60_000;
/** No fix for this long in standby (a still phone legitimately goes quiet). */
export const STANDBY_STALE_MS = 6 * 60 * 60_000;
/** Consecutive stale recoveries without a fix in between double the wait, up to this. */
export const MAX_STALE_WAIT_MS = 6 * 60 * 60_000;
/** Never act more often than this (foreground + motion events can fire in bursts). */
export const MIN_RECOVERY_GAP_MS = 5 * 60_000;
/** Hard cap on recoveries in any 24 h. */
export const MAX_RECOVERIES_PER_DAY = 12;
/** Recoveries kept in the kv store (and shown, most recent first). */
export const KEEP_RECOVERIES = 20;
/** Heartbeats from the foreground/motion path are throttled to this; the background task always sends. */
export const HEARTBEAT_EVERY_MS = 15 * 60_000;

const DAY_MS = 24 * 60 * 60_000;

export type Mode = "active" | "standby";

/**
 * "start": updates aren't registered; start them.
 * "reregister": registered but silent; hand the options to the task again
 *   (Android re-subscribes the location request, the service keeps running).
 * "restart": a re-register didn't help; stop and start from scratch.
 */
export type Action = "none" | "start" | "reregister" | "restart";
export type Reason = "not_running" | "stale_moving" | "stale_active" | "stale_standby";

export type Recovery = {
  at: number;
  reason: Reason;
  action: Exclude<Action, "none">;
  /** Newest fix when it happened (null: none yet). */
  lastFixAt: number | null;
  ok: boolean;
  error?: string;
};

export type WatchdogInput = {
  now: number;
  /** The user turned recording on. */
  enabled: boolean;
  /** Foreground + background location permission still granted. */
  permitted: boolean;
  /** Location.hasStartedLocationUpdatesAsync for the task. */
  running: boolean;
  /** The mode last applied to the task. */
  mode: Mode;
  lastFixAt: number | null;
  /** Time of the newest confident moving activity reading, if any. */
  lastMovingAt: number | null;
  /** Smart tracking applies and motion detection works, so a still phone would be in standby. */
  standbyPossible: boolean;
  /** When recording was last (re)started by the user or app launch: the clock starts there, not at an old fix. */
  startedAt: number | null;
  recoveries: Recovery[];
};

export type Decision = { action: Action; reason: Reason | null; why: string };

const none = (why: string): Decision => ({ action: "none", reason: null, why });

/** How long without a fix counts as broken, given the state. */
export function staleAfter(
  input: Pick<WatchdogInput, "now" | "mode" | "lastMovingAt" | "standbyPossible">,
): { ms: number; reason: Reason } {
  const movingRecently = input.lastMovingAt != null && input.now - input.lastMovingAt <= MOVING_RECENT_MS;
  if (movingRecently) return { ms: MOVING_STALE_MS, reason: "stale_moving" };
  if (input.mode === "standby") return { ms: STANDBY_STALE_MS, reason: "stale_standby" };
  return { ms: input.standbyPossible ? ACTIVE_STALE_MS : QUIET_ACTIVE_STALE_MS, reason: "stale_active" };
}

export function decide(input: WatchdogInput): Decision {
  const { now } = input;
  if (!input.enabled) return none("recording is off");
  if (!input.permitted) return none("background location permission is missing");

  const recent = input.recoveries.filter((r) => now - r.at < DAY_MS);
  const last = recent.reduce<Recovery | null>((a, r) => (!a || r.at > a.at ? r : a), null);
  if (last && now - last.at < MIN_RECOVERY_GAP_MS) return none("recovered moments ago");
  if (recent.length >= MAX_RECOVERIES_PER_DAY) return none("too many recoveries today");

  if (!input.running) return { action: "start", reason: "not_running", why: "updates had stopped" };

  // The clock runs from the newest of: last fix, last (re)start, last recovery.
  const since = Math.max(input.lastFixAt ?? -Infinity, input.startedAt ?? -Infinity, last?.at ?? -Infinity);
  if (!Number.isFinite(since)) return none("no reference time yet");

  // Stale recoveries since the last fix: each one that didn't bring a fix doubles the wait.
  const fixAt = input.lastFixAt ?? -Infinity;
  const failed = recent.filter((r) => r.reason !== "not_running" && r.at > fixAt);
  const { ms, reason } = staleAfter(input);
  const wait = Math.min(ms * 2 ** failed.length, Math.max(ms, MAX_STALE_WAIT_MS));
  if (now - since < wait) return none("fixes are recent enough");

  // A gentle re-register first; if one already failed to bring a fix, a full restart.
  const action: Action = failed.length > 0 ? "restart" : "reregister";
  return { action, reason, why: describeStale(reason, input.lastFixAt, now) };
}

function describeStale(reason: Reason, lastFixAt: number | null, now: number): string {
  const gap = lastFixAt == null ? "a while" : duration(now - lastFixAt);
  if (reason === "stale_moving") return `no location for ${gap} while moving`;
  if (reason === "stale_standby") return `no location for ${gap} in standby`;
  return `no location for ${gap}`;
}

/** "45 min", "3 h", "2 d". */
export function duration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

const REASONS: readonly string[] = ["not_running", "stale_moving", "stale_active", "stale_standby"];
const ACTIONS: readonly string[] = ["start", "reregister", "restart"];

/** Reads the persisted list, dropping anything malformed. Newest first. */
export function parseRecoveries(json: string | null | undefined): Recovery[] {
  if (!json) return [];
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  const out: Recovery[] = [];
  for (const o of v) {
    if (!o || typeof o !== "object") continue;
    const r = o as Record<string, unknown>;
    if (typeof r.at !== "number" || !Number.isFinite(r.at)) continue;
    if (typeof r.reason !== "string" || !REASONS.includes(r.reason)) continue;
    if (typeof r.action !== "string" || !ACTIONS.includes(r.action)) continue;
    out.push({
      at: r.at,
      reason: r.reason as Reason,
      action: r.action as Recovery["action"],
      lastFixAt: typeof r.lastFixAt === "number" && Number.isFinite(r.lastFixAt) ? r.lastFixAt : null,
      ok: r.ok !== false,
      ...(typeof r.error === "string" ? { error: r.error } : {}),
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

export function addRecovery(list: Recovery[], r: Recovery): Recovery[] {
  return [r, ...list].sort((a, b) => b.at - a.at).slice(0, KEEP_RECOVERIES);
}

export function recoveriesSince(list: Recovery[], since: number): number {
  return list.filter((r) => r.at >= since).length;
}

/**
 * One plain line for the Recorder screen:
 * "No location for 25 min while moving — restarted at 14:02".
 */
export function describeRecovery(r: Recovery, time: (ms: number) => string): string {
  const what =
    r.reason === "not_running"
      ? "The phone stopped recording"
      : r.lastFixAt == null
        ? "No location arrived"
        : `No location for ${duration(r.at - r.lastFixAt)}${r.reason === "stale_moving" ? " while moving" : r.reason === "stale_standby" ? " in standby" : ""}`;
  if (r.ok) return `${what} — restarted at ${time(r.at)}`;
  return `${what} — couldn't restart at ${time(r.at)}${r.error ? ` (${r.error})` : ""}`;
}

// ---- Heartbeat ---------------------------------------------------------------


export type HeartbeatMode = "active" | "standby" | "off";

export type Heartbeat = {
  recording: boolean;
  mode: HeartbeatMode;
  /** ISO-8601, or null before the first fix. */
  lastFixAt: string | null;
  queued: number;
  appVersion: string | null;
  /** Recoveries in the last 24 h. */
  recoveries: number;
  /** Recording is wanted but can't run (e.g. "permission"), else null. */
  problem: string | null;
  /** The recording preset (low | balanced | precise | max | custom), its custom values, Smart Tracking. */
  preset?: string;
  custom?: CustomSettings | null;
  smartTracking?: boolean;
  /** What the recorder did today and yesterday (usage-logic.ts). */
  usage?: UsageRow[];
};

export function buildHeartbeat(s: {
  now: number;
  enabled: boolean;
  running: boolean;
  permitted: boolean;
  mode: Mode;
  lastFixAt: number | null;
  queued: number;
  appVersion: string | null;
  recoveries: Recovery[];
  preset?: { key: string; custom: CustomSettings | null; smartTracking: boolean };
  usage?: UsageRow[];
}): Heartbeat {
  const problem = !s.enabled ? null : !s.permitted ? "permission" : !s.running ? "not_running" : null;
  return {
    recording: s.enabled,
    mode: s.enabled ? s.mode : "off",
    lastFixAt: s.lastFixAt != null && Number.isFinite(s.lastFixAt) ? new Date(s.lastFixAt).toISOString() : null,
    queued: Math.max(0, Math.round(s.queued)),
    appVersion: s.appVersion,
    recoveries: recoveriesSince(s.recoveries, s.now - DAY_MS),
    problem,
    ...(s.preset
      ? {
          preset: s.preset.key,
          custom: s.preset.key === "custom" ? s.preset.custom : null,
          smartTracking: s.preset.smartTracking,
        }
      : {}),
    ...(s.usage ? { usage: s.usage } : {}),
  };
}

/** Foreground/motion heartbeats only every HEARTBEAT_EVERY_MS; the background task always sends. */
export function heartbeatDue(lastSentAt: number | null, now: number, force: boolean): boolean {
  return force || lastSentAt == null || now - lastSentAt >= HEARTBEAT_EVERY_MS;
}
