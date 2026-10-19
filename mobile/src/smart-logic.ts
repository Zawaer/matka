// Smart tracking: pure decision logic (no native imports, unit-tested).
//
// When the phone's motion activity has confidently been "still" for STILL_MS,
// location updates drop to a low-power standby (no GPS). Any sign of movement
// (a moving activity reading, or a standby fix that moved away from the stay
// or reports speed) switches straight back to the selected preset.
//
// tracking.ts feeds this from the location task (fixes + the latest activity
// reading) and from the activity module's change events, and persists the
// state in the kv store.

export const STILL_MS = 3 * 60_000;
/** Entering standby needs this long since the previous switch (no restart thrash). */
export const MIN_STANDBY_GAP_MS = 60_000;
export const RESUME_DISTANCE_M = 100;
export const RESUME_SPEED_MS = 1;
/** Fixes vaguer than this don't count as evidence of speed. */
export const SPEED_MAX_ACCURACY_M = 50;
export const MIN_CONFIDENCE = 50;

const MOVING: readonly string[] = ["walking", "running", "on_bicycle", "in_vehicle"];

export type Mode = "active" | "standby";
export type LatLon = { lat: number; lon: number };

export type SmartState = {
  mode: Mode;
  /** Start of the current confident-still streak (or of the restarted countdown). */
  stillSince: number | null;
  lastSwitchAt: number | null;
  /** Where standby started; standby fixes far from it mean we left. */
  anchor: LatLon | null;
  lastFix: (LatLon & { ts: number }) | null;
};

export type ActivityReading = { type: string; confidence: number; at: number };
export type Fix = { ts: number; lat: number; lon: number; accuracy: number | null; speed: number | null };

export const INITIAL_STATE: SmartState = { mode: "active", stillSince: null, lastSwitchAt: null, anchor: null, lastFix: null };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): number | null => (finite(v) ? v : null);
const latLon = (v: unknown): LatLon | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return finite(o.lat) && finite(o.lon) ? { lat: o.lat, lon: o.lon } : null;
};

/** Reads a persisted state, falling back to the initial state for anything malformed. */
export function parseSmartState(json: string | null | undefined): SmartState {
  if (!json) return INITIAL_STATE;
  let o: Record<string, unknown>;
  try {
    const v: unknown = JSON.parse(json);
    if (!v || typeof v !== "object") return INITIAL_STATE;
    o = v as Record<string, unknown>;
  } catch {
    return INITIAL_STATE;
  }
  const fix = latLon(o.lastFix);
  const fixTs = o.lastFix && typeof o.lastFix === "object" ? (o.lastFix as Record<string, unknown>).ts : null;
  return {
    mode: o.mode === "standby" ? "standby" : "active",
    stillSince: numOrNull(o.stillSince),
    lastSwitchAt: numOrNull(o.lastSwitchAt),
    anchor: latLon(o.anchor),
    lastFix: fix && finite(fixTs) ? { ...fix, ts: fixTs } : null,
  };
}

/** Great-circle distance in metres. */
export function distanceM(a: LatLon, b: LatLon): number {
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Does this standby fix show that the phone left the stay? */
export function fixShowsMovement(f: Fix, anchor: LatLon | null): boolean {
  const acc = f.accuracy != null && f.accuracy >= 0 ? f.accuracy : null;
  if (f.speed != null && f.speed > RESUME_SPEED_MS && (acc == null || acc <= SPEED_MAX_ACCURACY_M)) return true;
  if (anchor && distanceM(anchor, f) > Math.max(RESUME_DISTANCE_M, acc ?? 0)) return true;
  return false;
}

export type StepResult = { state: SmartState; switchTo: Mode | null };

/**
 * Folds new evidence (the latest activity reading, which may be one already
 * seen, and any new fixes) into the state and says whether to switch modes.
 */
export function step(
  s: SmartState,
  input: { activity: ActivityReading | null; fixes: Fix[] },
  now: number,
): StepResult {
  let { stillSince, lastFix } = s;
  let moved = false;
  let activityMoving = false;

  const a = input.activity;
  if (a && finite(a.at) && a.confidence >= MIN_CONFIDENCE) {
    if (MOVING.includes(a.type)) {
      activityMoving = true;
      moved = true;
      stillSince = null;
    } else if (a.type === "still" && stillSince == null) {
      stillSince = Math.min(a.at, now);
    }
  }

  const fixes = input.fixes.filter((f) => finite(f.ts) && finite(f.lat) && finite(f.lon)).sort((x, y) => x.ts - y.ts);
  for (const f of fixes) {
    if (s.mode === "standby" && fixShowsMovement(f, s.anchor)) moved = true;
    if (!lastFix || f.ts >= lastFix.ts) lastFix = { lat: f.lat, lon: f.lon, ts: f.ts };
  }

  if (s.mode === "standby") {
    if (moved) {
      return {
        // A fix-only resume restarts the still countdown (the activity
        // reading may stay "still" if the phone barely moved).
        state: { mode: "active", stillSince: activityMoving ? null : now, lastSwitchAt: now, anchor: null, lastFix },
        switchTo: "active",
      };
    }
    return { state: { ...s, stillSince, lastFix }, switchTo: null };
  }

  const stillLongEnough = stillSince != null && now - stillSince >= STILL_MS;
  const gapOk = s.lastSwitchAt == null || now - s.lastSwitchAt >= MIN_STANDBY_GAP_MS;
  if (!moved && stillLongEnough && gapOk) {
    return {
      state: { mode: "standby", stillSince, lastSwitchAt: now, anchor: lastFix ? { lat: lastFix.lat, lon: lastFix.lon } : null, lastFix },
      switchTo: "standby",
    };
  }
  return { state: { ...s, stillSince, lastFix }, switchTo: null };
}
