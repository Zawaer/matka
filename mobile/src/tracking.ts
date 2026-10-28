// Background location: task definition, presets, start/stop/resume.
//
// Import this module from index.ts BEFORE registering the root component:
// TaskManager tasks must be defined at module scope so that a headless
// (app-not-running) launch can find the task.

import * as BackgroundTask from "expo-background-task";
import * as Battery from "expo-battery";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { AppState, PermissionsAndroid, Platform } from "react-native";
import * as db from "./db";
import { batteryPercent, fixToPoint, type QueuedPoint } from "./points";
import {
  addActivityListener,
  currentActivity,
  latestActivity,
  startActivityUpdates,
  stopActivityUpdates,
} from "../modules/matka-activity";
import { customDeferral, parseCustom, serializeCustom, type CustomSettings } from "./preset-logic";
import { INITIAL_STATE, MIN_CONFIDENCE, parseSmartState, step, type Fix, type Mode } from "./smart-logic";
import { maybeUploadFromTask } from "./uploader";
import { recordMotion, recordUsage } from "./usage";
import { addRecovery, parseRecoveries, type Recovery } from "./watchdog-logic";

export const TASK = "matka-bg-location";
/** Periodic watchdog (expo-background-task); defined in watchdog.ts. */
export const WATCHDOG_TASK = "matka-watchdog";
/** Minutes; Android's WorkManager floor is 15. The OS decides when it actually runs. */
const WATCHDOG_INTERVAL_MIN = 15;

export type PresetKey = "low" | "balanced" | "precise" | "max" | "custom";

export type Preset = {
  key: PresetKey;
  label: string;
  description: string;
  options: Location.LocationTaskOptions;
};

const FOREGROUND_SERVICE: Location.LocationTaskOptions["foregroundService"] = {
  notificationTitle: "Matka is recording",
  // Title only: the body adds a line and nothing the user needs to know.
  notificationBody: "",
  // No notificationColor: expo-location then colorizes the whole card with it.
  killServiceOnDestroy: false,
};

export const PRESETS: Record<PresetKey, Preset> = {
  low: {
    key: "low",
    label: "Low power",
    description: "Lowest battery · rough routes",
    options: {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 120_000,
      distanceInterval: 100,
      deferredUpdatesInterval: 10 * 60_000,
      deferredUpdatesDistance: 500,
      // iOS may pause when stationary and only resume on significant movement
      // or when the app is opened; acceptable for the low-power preset only.
      pausesUpdatesAutomatically: true,
      activityType: Location.ActivityType.Other,
      showsBackgroundLocationIndicator: false,
      foregroundService: FOREGROUND_SERVICE,
    },
  },
  balanced: {
    key: "balanced",
    label: "Balanced",
    description: "All-day use · recommended",
    options: {
      accuracy: Location.Accuracy.High,
      timeInterval: 30_000,
      distanceInterval: 25,
      deferredUpdatesInterval: 2 * 60_000,
      deferredUpdatesDistance: 100,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.Other,
      showsBackgroundLocationIndicator: false,
      foregroundService: FOREGROUND_SERVICE,
    },
  },
  precise: {
    key: "precise",
    label: "Precise",
    description: "Detailed routes · more battery",
    options: {
      accuracy: Location.Accuracy.Highest,
      timeInterval: 10_000,
      distanceInterval: 10,
      deferredUpdatesInterval: 60_000,
      deferredUpdatesDistance: 50,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.Fitness,
      showsBackgroundLocationIndicator: false,
      foregroundService: FOREGROUND_SERVICE,
    },
  },
  max: {
    key: "max",
    label: "Max detail",
    description: "Hikes and runs · drains fast",
    options: {
      // iOS: navigation-grade accuracy. Android maps this to high accuracy, same as High.
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 2_000,
      distanceInterval: 5,
      deferredUpdatesInterval: 15_000,
      deferredUpdatesDistance: 0,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.Fitness,
      showsBackgroundLocationIndicator: false,
      foregroundService: FOREGROUND_SERVICE,
    },
  },
  custom: {
    key: "custom",
    label: "Custom",
    description: "Choose accuracy, distance and time",
    // Placeholder: the real options come from customOptions() with the stored choices.
    options: { accuracy: Location.Accuracy.High, foregroundService: FOREGROUND_SERVICE },
  },
};

const CUSTOM_ACCURACY: Record<CustomSettings["accuracy"], Location.Accuracy> = {
  balanced: Location.Accuracy.Balanced,
  high: Location.Accuracy.High,
  highest: Location.Accuracy.Highest,
};

/**
 * A preset's settings in the Custom preset's terms (position source, metres,
 * ms), read from its task options so Settings describes what actually runs.
 * Highest and BestForNavigation are both "highest" (Android: high accuracy).
 */
export function presetSettings(key: PresetKey, custom: CustomSettings): CustomSettings {
  if (key === "custom") return custom;
  const o = PRESETS[key].options;
  const a = o.accuracy ?? Location.Accuracy.Balanced;
  return {
    accuracy: a >= Location.Accuracy.Highest ? "highest" : a >= Location.Accuracy.High ? "high" : "balanced",
    distance: o.distanceInterval ?? 0,
    time: o.timeInterval ?? 0,
  };
}

/** "Low power" is already about as frugal as standby, so smart tracking leaves it alone. */
export const smartApplies = (preset: PresetKey) => preset !== "low";

export function customOptions(c: CustomSettings): Location.LocationTaskOptions {
  const deferral = customDeferral(c);
  return {
    accuracy: CUSTOM_ACCURACY[c.accuracy],
    timeInterval: c.time,
    distanceInterval: c.distance,
    deferredUpdatesInterval: deferral.interval,
    deferredUpdatesDistance: deferral.distance,
    pausesUpdatesAutomatically: false,
    activityType: c.time <= 10_000 ? Location.ActivityType.Fitness : Location.ActivityType.Other,
    showsBackgroundLocationIndicator: false,
    foregroundService: FOREGROUND_SERVICE,
  };
}

/**
 * Smart tracking's standby: Wi-Fi/cell positioning only (GPS sleeps), and a
 * fix only after ~100 m of movement, delivered at once so the task can
 * switch back quickly.
 */
const STANDBY_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 120_000,
  distanceInterval: 100,
  deferredUpdatesInterval: 0,
  deferredUpdatesDistance: 0,
  pausesUpdatesAutomatically: false,
  activityType: Location.ActivityType.Other,
  showsBackgroundLocationIndicator: false,
  foregroundService: FOREGROUND_SERVICE,
};


export const DEFAULT_PRESET: PresetKey = "balanced";

const isPreset = (v: unknown): v is PresetKey => typeof v === "string" && v in PRESETS;

// ---- The task --------------------------------------------------------------

TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  try {
    if (error) {
      await db.setKv("last_task_error", `${new Date().toISOString()} ${error.message}`);
      return;
    }
    const locations = data?.locations ?? [];
    if (locations.length === 0) return;

    let battery: number | null = null;
    try {
      battery = batteryPercent(await Battery.getBatteryLevelAsync());
    } catch {
      // battery is optional
    }
    const points = locations
      .map((l) => fixToPoint(l, battery, currentActivity(l.timestamp)))
      .filter((p): p is QueuedPoint => p != null);
    await db.enqueue(points);
    if (points.length > 0) await db.setNum("last_fix_at", Math.max(...points.map((p) => p.ts)));
    // Per-day recorder usage and a whole-phone battery reading (we're awake anyway).
    await recordUsage({ fixes: points.length, battery: true });
    await evaluateSmart(
      locations.map(
        (l): Fix => ({
          ts: l.timestamp,
          lat: l.coords.latitude,
          lon: l.coords.longitude,
          accuracy: l.coords.accuracy ?? null,
          speed: l.coords.speed ?? null,
        }),
      ),
    ).catch((e) => db.setKv("last_task_error", `${new Date().toISOString()} smart: ${String(e)}`));
    await maybeUploadFromTask();
  } catch (e) {
    // Never let an exception escape the task; the fixes already queued are safe.
    try {
      await db.setKv("last_task_error", `${new Date().toISOString()} ${String(e)}`);
    } catch {
      // nothing more we can do
    }
  }
});

// ---- Permissions -----------------------------------------------------------

export type PermissionState = {
  foreground: Location.PermissionStatus;
  background: Location.PermissionStatus;
  /** iOS "precise location" / Android fine vs coarse. */
  precise: boolean;
};

export async function getPermissions(): Promise<PermissionState> {
  const [fg, bg] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);
  const precise =
    Platform.OS === "android" ? fg.android?.accuracy !== "coarse" : fg.ios?.accuracy !== "reduced";
  return { foreground: fg.status, background: bg.status, precise };
}

export type StartResult = { ok: true } | { ok: false; error: string };

async function requestPermissions(): Promise<StartResult> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") {
    return { ok: false, error: "Location permission was denied. Enable it in system settings." };
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") {
    return {
      ok: false,
      error:
        Platform.OS === "android"
          ? 'Background location is needed. In settings choose Location → "Allow all the time".'
          : 'Background location is needed. In Settings choose Location → "Always".',
    };
  }
  // Android 13+: without this the foreground-service notification is hidden
  // (the service still runs). Not fatal if denied.
  if (Platform.OS === "android" && Number(Platform.Version) >= 33) {
    try {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    } catch {
      // ignore
    }
  }
  return { ok: true };
}

// ---- Start / stop / resume -------------------------------------------------

export async function getPreset(): Promise<PresetKey> {
  const v = await db.getKv("preset");
  return isPreset(v) ? v : DEFAULT_PRESET;
}

export async function isTrackingEnabled(): Promise<boolean> {
  return (await db.getKv("tracking_enabled")) === "1";
}

export async function isTrackingRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(TASK);
  } catch {
    return false;
  }
}

export async function getCustom(): Promise<CustomSettings> {
  return parseCustom(await db.getKv("custom_preset"));
}

/** Smart tracking is on unless the user turned it off. */
export async function isSmartTracking(): Promise<boolean> {
  return (await db.getKv("smart_tracking")) !== "0";
}

async function presetOptions(preset: PresetKey): Promise<{ options: Location.LocationTaskOptions; key: string }> {
  if (preset !== "custom") return { options: PRESETS[preset].options, key: preset };
  const c = await getCustom();
  return { options: customOptions(c), key: `custom:${serializeCustom(c)}` };
}

/** The mode smart tracking wants right now ("active" when it's off or doesn't apply). */
async function wantedMode(preset: PresetKey): Promise<Mode> {
  if (!smartApplies(preset) || !(await isSmartTracking())) return "active";
  return parseSmartState(await db.getKv("smart_state")).mode;
}

/**
 * Hands new options to the running task. Re-registering an existing task only
 * updates its options (the foreground service keeps running). Android refuses
 * the foregroundService option while the app is in the background, so from
 * the background the options go without it; the service is not stopped by
 * that, and resumeTracking re-adds it when the app is next opened.
 */
async function applyOptions(options: Location.LocationTaskOptions): Promise<void> {
  try {
    await Location.startLocationUpdatesAsync(TASK, options);
    await db.setKv("applied_fg", "1");
  } catch (e) {
    if (Platform.OS !== "android" || AppState.currentState === "active") throw e;
    const { foregroundService: _omit, ...rest } = options;
    await Location.startLocationUpdatesAsync(TASK, rest);
    await db.setKv("applied_fg", "0");
  }
}

/** Full (re)start from the foreground: user actions and app launch. */
async function startUpdates(preset: PresetKey): Promise<void> {
  const mode = await wantedMode(preset);
  const { options, key } = await presetOptions(preset);
  if (await isTrackingRunning()) await Location.stopLocationUpdatesAsync(TASK);
  await Location.startLocationUpdatesAsync(TASK, mode === "standby" ? STANDBY_OPTIONS : options);
  await db.setKv("applied_fg", "1");
  await db.setKv("applied_preset", key);
  await db.setKv("applied_mode", mode);
  // The watchdog's "no fixes for too long" clock starts here, not at an old fix.
  await db.setNum("tracking_started_at", Date.now());
  await recordUsage();
}

// ---- Watchdog support --------------------------------------------------------

/** Schedules the periodic watchdog (idempotent). Never throws: recording works without it. */
export async function registerWatchdog(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(WATCHDOG_TASK)) return;
    await BackgroundTask.registerTaskAsync(WATCHDOG_TASK, { minimumInterval: WATCHDOG_INTERVAL_MIN });
  } catch (e) {
    await db.setKv("watchdog_error", `${new Date().toISOString()} register: ${String(e)}`).catch(() => undefined);
  }
}

export async function unregisterWatchdog(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(WATCHDOG_TASK)) await BackgroundTask.unregisterTaskAsync(WATCHDOG_TASK);
  } catch {
    // not registered / module missing in an old build
  }
}

export async function getRecoveries(): Promise<Recovery[]> {
  return parseRecoveries(await db.getKv("watchdog_recoveries"));
}

export async function recordRecovery(r: Recovery): Promise<void> {
  await db.setKv("watchdog_recoveries", JSON.stringify(addRecovery(await getRecoveries(), r)));
}

/**
 * The watchdog's fix (watchdog-logic.ts decides which). In the foreground a
 * full stop + start with the foreground service. In the background Android
 * may refuse to (re)start the foreground service, so: "start"/"reregister"
 * hand the options to the task (which re-subscribes the location request and
 * keeps a running service), "restart" stops first. applied_fg "0" makes the
 * next app open re-add the service properly.
 */
export function recoverUpdates(action: "start" | "reregister" | "restart"): Promise<void> {
  return serialSmart(async () => {
    const preset = await getPreset();
    if (AppState.currentState === "active") {
      await startUpdates(preset);
      return;
    }
    const mode = await wantedMode(preset);
    const { options, key } = await presetOptions(preset);
    if (action === "restart" && (await isTrackingRunning())) await Location.stopLocationUpdatesAsync(TASK);
    await applyOptions(mode === "standby" ? STANDBY_OPTIONS : options);
    if (Platform.OS === "android") await db.setKv("applied_fg", "0");
    await db.setKv("applied_preset", key);
    await db.setKv("applied_mode", mode);
    await recordUsage();
  });
}

// ---- Smart tracking --------------------------------------------------------

// The task, the activity listener and the Settings screen can all touch the
// smart state concurrently; run those read-modify-writes one at a time.
let smartChain: Promise<unknown> = Promise.resolve();
function serialSmart<T>(fn: () => Promise<T>): Promise<T> {
  const p = smartChain.then(fn, fn);
  smartChain = p.catch(() => undefined);
  return p;
}

/**
 * Folds the latest activity reading and any new fixes into the smart-tracking
 * state and switches between the preset and standby when it says so. Never
 * stops the task: only its options change.
 */
export function evaluateSmart(fixes: Fix[] = []): Promise<void> {
  const run = async () => {
    if (!(await isTrackingEnabled()) || !(await isSmartTracking())) return;
    const preset = await getPreset();
    const prev = parseSmartState(await db.getKv("smart_state"));
    const now = Date.now();
    const { state, switchTo } = step(prev, { activity: latestActivity(), fixes }, now);
    if (!smartApplies(preset)) {
      await db.setKv("smart_state", JSON.stringify({ ...state, mode: "active" }));
      return;
    }
    let next = state;
    if (switchTo && (await isTrackingRunning())) {
      try {
        const { options, key } = await presetOptions(preset);
        await applyOptions(switchTo === "standby" ? STANDBY_OPTIONS : options);
        await db.setKv("applied_preset", key);
        await db.setKv("applied_mode", switchTo);
        await db.setNum("smart_switched_at", now);
        await recordUsage();
      } catch (e) {
        // Keep the old mode; lastSwitchAt makes the retry wait a little.
        next = { ...state, mode: prev.mode, anchor: prev.anchor };
        await db.setKv("last_task_error", `${new Date().toISOString()} smart switch: ${String(e)}`);
      }
    } else if (switchTo) {
      next = { ...state, mode: prev.mode, anchor: prev.anchor };
    }
    await db.setKv("smart_state", JSON.stringify(next));
  };
  return serialSmart(run);
}

const MOVING_TYPES: readonly string[] = ["walking", "running", "on_bicycle", "in_vehicle"];

// Activity changes wake us up (new native builds) so standby starts and ends
// without waiting for a fix. Older builds never fire this; fixes still work.
addActivityListener((a) => {
  evaluateSmart().catch(() => undefined);
  // Moving vs still minutes for the usage stats (unknown or unsure readings: neither).
  const motion =
    a.confidence < MIN_CONFIDENCE ? null : a.type === "still" ? "still" : MOVING_TYPES.includes(a.type) ? "moving" : null;
  recordMotion(motion).catch(() => undefined);
});

export function setSmartTracking(on: boolean): Promise<void> {
  return serialSmart(async () => {
    await db.setKv("smart_tracking", on ? "1" : "0");
    const keep = parseSmartState(await db.getKv("smart_state"));
    await db.setKv(
      "smart_state",
      JSON.stringify({ ...INITIAL_STATE, stillSince: keep.stillSince, lastFix: keep.lastFix, lastSwitchAt: Date.now() }),
    );
    if ((await isTrackingEnabled()) && (await isTrackingRunning())) await startUpdates(await getPreset());
  });
}

/** User turned tracking on: ask for permissions, start, and remember the choice. */
export async function startTracking(): Promise<StartResult> {
  const perm = await requestPermissions();
  if (!perm.ok) return perm;
  await db.setKv("smart_state", null); // start from "recording"; standby needs a fresh still spell
  try {
    await startUpdates(await getPreset());
  } catch (e) {
    return { ok: false, error: `Couldn't start location updates: ${String(e)}` };
  }
  await db.setKv("tracking_enabled", "1");
  await registerWatchdog();
  // Motion activity (bike vs bus): asked for once; tracking works without it.
  await db.setKv("activity_status", await startActivityUpdates(true));
  return { ok: true };
}

export async function stopTracking(): Promise<void> {
  await db.setKv("tracking_enabled", "0");
  await db.setKv("smart_state", null);
  if (await isTrackingRunning()) await Location.stopLocationUpdatesAsync(TASK);
  await stopActivityUpdates();
  await unregisterWatchdog();
  await recordUsage();
}

/** Leaves standby (the next still spell re-enters it) and restarts with the current preset. */
function restartActive(): Promise<void> {
  return serialSmart(async () => {
    const keep = parseSmartState(await db.getKv("smart_state"));
    await db.setKv("smart_state", JSON.stringify({ ...keep, mode: "active", anchor: null, lastSwitchAt: Date.now() }));
    if ((await isTrackingEnabled()) && (await isTrackingRunning())) await startUpdates(await getPreset());
  });
}

export async function setPreset(preset: PresetKey): Promise<void> {
  await db.setKv("preset", preset);
  await restartActive();
  await recordUsage();
}

export async function setCustom(c: CustomSettings): Promise<void> {
  await db.setKv("custom_preset", serializeCustom(c));
  if ((await getPreset()) === "custom") await restartActive();
}

/**
 * On every launch: if the user wants tracking and permission is still
 * granted, make sure updates are running with the current preset. Never
 * prompts. Returns a reason when tracking is wanted but can't run.
 */
export async function resumeTracking(): Promise<string | null> {
  if (!(await isTrackingEnabled())) return null;
  const perm = await getPermissions();
  if (perm.foreground !== "granted" || perm.background !== "granted") {
    return "Tracking is on, but background location permission was revoked.";
  }
  // Re-subscribe to motion activity without prompting (updates don't survive a reboot).
  await db.setKv("activity_status", await startActivityUpdates(false));
  await registerWatchdog(); // installs from before the watchdog existed get it here

  const preset = await getPreset();
  const running = await isTrackingRunning();
  const [applied, appliedMode, appliedFg] = await Promise.all([
    db.getKv("applied_preset"),
    db.getKv("applied_mode"),
    db.getKv("applied_fg"),
  ]);
  const { key } = await presetOptions(preset);
  const mode = await wantedMode(preset);
  // applied_fg "0": a background switch had to drop the foreground-service option; re-add it.
  if (!running || applied !== key || (appliedMode ?? "active") !== mode || appliedFg === "0") {
    const lastFixAt = await db.getNum("last_fix_at");
    try {
      await startUpdates(preset);
    } catch (e) {
      if (!running) {
        await recordRecovery({ at: Date.now(), reason: "not_running", action: "start", lastFixAt, ok: false, error: String(e) });
      }
      return `Couldn't restart location updates: ${String(e)}`;
    }
    // Wanted but not registered: the OS dropped the updates. Shown on the Recorder screen.
    if (!running) await recordRecovery({ at: Date.now(), reason: "not_running", action: "start", lastFixAt, ok: true });
  }
  await evaluateSmart().catch(() => undefined);
  return null;
}
