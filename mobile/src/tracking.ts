// Background location: task definition, presets, start/stop/resume.
//
// Import this module from index.ts BEFORE registering the root component:
// TaskManager tasks must be defined at module scope so that a headless
// (app-not-running) launch can find the task.

import * as Battery from "expo-battery";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { PermissionsAndroid, Platform } from "react-native";
import * as db from "./db";
import { batteryPercent, fixToPoint, type QueuedPoint } from "./points";
import { currentActivity, startActivityUpdates, stopActivityUpdates } from "../modules/matka-activity";
import { maybeUploadFromTask } from "./uploader";

export const TASK = "matka-bg-location";

export type PresetKey = "low" | "balanced" | "precise";

export type Preset = {
  key: PresetKey;
  label: string;
  description: string;
  options: Location.LocationTaskOptions;
};

const FOREGROUND_SERVICE: Location.LocationTaskOptions["foregroundService"] = {
  notificationTitle: "Matka is recording your location",
  notificationBody: "Points are stored on the phone and uploaded in batches.",
  notificationColor: "#14b8a6",
  killServiceOnDestroy: false,
};

export const PRESETS: Record<PresetKey, Preset> = {
  low: {
    key: "low",
    label: "Low power",
    description: "Wi-Fi/cell positioning, a point every ≥2 min / 100 m. Coarse trips, lowest drain.",
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
    description: "GPS, a point every ≥30 s / 25 m while moving. Recommended for all-day use.",
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
    description: "GPS, a point every ≥10 s / 10 m. Detailed routes, noticeably more battery.",
    options: {
      accuracy: Location.Accuracy.High,
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

async function startUpdates(preset: PresetKey): Promise<void> {
  if (await isTrackingRunning()) await Location.stopLocationUpdatesAsync(TASK);
  await Location.startLocationUpdatesAsync(TASK, PRESETS[preset].options);
  await db.setKv("applied_preset", preset);
}

/** User turned tracking on: ask for permissions, start, and remember the choice. */
export async function startTracking(): Promise<StartResult> {
  const perm = await requestPermissions();
  if (!perm.ok) return perm;
  try {
    await startUpdates(await getPreset());
  } catch (e) {
    return { ok: false, error: `Couldn't start location updates: ${String(e)}` };
  }
  await db.setKv("tracking_enabled", "1");
  // Motion activity (bike vs bus): asked for once; tracking works without it.
  await db.setKv("activity_status", await startActivityUpdates(true));
  return { ok: true };
}

export async function stopTracking(): Promise<void> {
  await db.setKv("tracking_enabled", "0");
  if (await isTrackingRunning()) await Location.stopLocationUpdatesAsync(TASK);
  await stopActivityUpdates();
}

export async function setPreset(preset: PresetKey): Promise<void> {
  await db.setKv("preset", preset);
  if ((await isTrackingEnabled()) && (await isTrackingRunning())) await startUpdates(preset);
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
  const preset = await getPreset();
  const running = await isTrackingRunning();
  const applied = await db.getKv("applied_preset");
  if (!running || applied !== preset) {
    try {
      await startUpdates(preset);
    } catch (e) {
      return `Couldn't restart location updates: ${String(e)}`;
    }
  }
  return null;
}
