import Native, { type NativeActivity, type PermissionResponse } from "./src/MatkaActivityModule";

export type Activity = "still" | "walking" | "running" | "on_bicycle" | "in_vehicle";
export type { NativeActivity, PermissionResponse };

const KNOWN: readonly string[] = ["still", "walking", "running", "on_bicycle", "in_vehicle"];
/**
 * A reading further than this from a fix (either way: Android may deliver fixes
 * in deferred batches), or less sure than MIN_CONFIDENCE, isn't attached.
 */
export const MAX_AGE_MS = 3 * 60_000;
export const MIN_CONFIDENCE = 50;
const INTERVAL_MS = 30_000;

/** Pure: which activity (if any) to attach to a fix taken at `now`. */
export function usableActivity(a: NativeActivity | null | undefined, now: number): Activity | null {
  if (!a || !KNOWN.includes(a.type) || a.confidence < MIN_CONFIDENCE) return null;
  if (!(Math.abs(now - a.at) <= MAX_AGE_MS)) return null;
  return a.type as Activity;
}

export function isActivityAvailable(): boolean {
  try {
    return Native?.isAvailable() ?? false;
  } catch {
    return false;
  }
}

/** The latest reading if it's confident and close to `at` (a fix's time); else null. */
export function currentActivity(at = Date.now()): Activity | null {
  try {
    return usableActivity(Native?.latest(), at);
  } catch {
    return null;
  }
}

/** The latest raw reading, whatever its age or confidence (smart tracking judges it itself). */
export function latestActivity(): NativeActivity | null {
  try {
    return Native?.latest() ?? null;
  } catch {
    return null;
  }
}

/**
 * Calls `listener` on each new reading while this JS runtime is alive. Returns
 * null when the native module is missing or too old to emit events.
 */
export function addActivityListener(listener: (a: NativeActivity) => void): { remove(): void } | null {
  try {
    return Native?.addListener ? Native.addListener("onActivity", listener) : null;
  } catch {
    return null;
  }
}

export async function getActivityPermission(): Promise<PermissionResponse | null> {
  return Native ? Native.getPermissionsAsync() : null;
}

/** Starts updates, asking for the permission first if `ask`. Never throws. */
export async function startActivityUpdates(ask = true): Promise<"on" | "denied" | "unavailable"> {
  if (!Native || !isActivityAvailable()) return "unavailable";
  try {
    let p = await Native.getPermissionsAsync();
    if (!p.granted && p.canAskAgain && ask) p = await Native.requestPermissionsAsync();
    if (!p.granted) return "denied";
    return (await Native.startAsync(INTERVAL_MS)) ? "on" : "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function stopActivityUpdates(): Promise<void> {
  try {
    await Native?.stopAsync();
  } catch {
    // not running
  }
}
