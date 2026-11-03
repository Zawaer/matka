// Recording watchdog: notices when the OS has silently stopped background
// location and restarts it, flushes the queue and tells the server we're alive.
//
// Runs from:
//  - a periodic expo-background-task (Android WorkManager / iOS BGTaskScheduler,
//    ~every 15 min at the OS's discretion, only with network), registered when
//    recording starts. WorkManager survives reboots, so this also brings
//    recording back after one if Android didn't;
//  - the app coming to the foreground (App.tsx);
//  - motion activity events (throttled).
// The decisions are in watchdog-logic.ts. Import this module from index.ts:
// the task must be defined at module scope for a headless launch.

import * as Application from "expo-application";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import * as api from "./api";
import { loadPairing } from "./credentials";
import * as db from "./db";
import { addActivityListener, latestActivity, startActivityUpdates } from "../modules/matka-activity";
import { MIN_CONFIDENCE } from "./smart-logic";
import {
  getCustom,
  getPermissions,
  getPreset,
  getRecoveries,
  isSmartTracking,
  isTrackingEnabled,
  isTrackingRunning,
  recordRecovery,
  recoverUpdates,
  repairForegroundService,
  unregisterWatchdog,
  WATCHDOG_TASK,
} from "./tracking";
import { markPairingLost, uploadNow } from "./uploader";
import { recordUsage, usageForHeartbeat } from "./usage";
import { buildHeartbeat, decide, heartbeatDue, type Decision } from "./watchdog-logic";

export type Trigger = "background" | "foreground" | "motion";

const MOVING: readonly string[] = ["walking", "running", "on_bicycle", "in_vehicle"];
/** Motion events arrive every ~30 s; check at most this often from them. */
const MOTION_CHECK_EVERY_MS = 2 * 60_000;

TaskManager.defineTask(WATCHDOG_TASK, async () => {
  try {
    await runWatchdog("background");
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    await db.setKv("watchdog_error", `${new Date().toISOString()} ${String(e)}`).catch(() => undefined);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

const appVersion = (): string | null => {
  const v = Application.nativeApplicationVersion;
  const b = Application.nativeBuildVersion;
  return v ? (b ? `${v} (${b})` : v) : null;
};

let running: Promise<Decision | null> | null = null;

/** One watchdog pass (joins one already in progress). */
export function runWatchdog(trigger: Trigger): Promise<Decision | null> {
  if (!running) {
    running = doRun(trigger).finally(() => {
      running = null;
    });
  }
  return running;
}

async function doRun(trigger: Trigger): Promise<Decision | null> {
  const enabled = await isTrackingEnabled();
  await db.setNum("watchdog_checked_at", Date.now());
  if (!enabled) {
    // Recording was turned off: the periodic task has nothing to watch.
    if (trigger === "background") {
      await sendHeartbeat(true).catch(() => undefined);
      await unregisterWatchdog();
    }
    return null;
  }

  const perm = await getPermissions().catch(() => null);
  const permitted = perm?.foreground === "granted" && perm.background === "granted";

  // Motion updates don't survive a reboot; re-subscribe (no prompt) from the background task.
  if (trigger === "background" && permitted && (await db.getKv("activity_status")) === "on") {
    await db.setKv("activity_status", await startActivityUpdates(false));
  }

  // Usage so far, with a whole-phone battery reading.
  await recordUsage({ battery: true });

  const now = Date.now();
  const [runningNow, mode, lastFixAt, startedAt, storedMovingAt, recoveries, preset, smart, activityStatus] = await Promise.all([
    isTrackingRunning(),
    db.getKv("applied_mode"),
    db.getNum("last_fix_at"),
    db.getNum("tracking_started_at"),
    db.getNum("last_moving_at"),
    getRecoveries(),
    getPreset(),
    isSmartTracking(),
    db.getKv("activity_status"),
  ]);
  const a = latestActivity();
  const liveMovingAt = a && MOVING.includes(a.type) && a.confidence >= MIN_CONFIDENCE ? a.at : null;
  const lastMovingAt = Math.max(storedMovingAt ?? -Infinity, liveMovingAt ?? -Infinity);

  const decision = decide({
    now,
    enabled,
    permitted,
    running: runningNow,
    mode: mode === "standby" ? "standby" : "active",
    lastFixAt,
    lastMovingAt: Number.isFinite(lastMovingAt) ? lastMovingAt : null,
    standbyPossible: smart && preset !== "low" && activityStatus === "on",
    startedAt,
    recoveries,
  });

  let recovered = false;
  if (decision.action !== "none" && decision.reason) {
    let error: string | undefined;
    try {
      await recoverUpdates(decision.action);
    } catch (e) {
      error = String(e);
    }
    await recordRecovery({ at: now, reason: decision.reason, action: decision.action, lastFixAt, ok: !error, ...(error ? { error } : {}) });
    recovered = true;
  }

  // Running without the foreground service (process was killed and relaunched): restore it.
  if (trigger !== "foreground" && !recovered && runningNow) await repairForegroundService().catch(() => undefined);

  // The foreground path uploads and sends its own heartbeat afterwards (App.tsx).
  if (trigger === "background") await uploadNow("task").catch(() => null);
  if (trigger !== "foreground") await sendHeartbeat(trigger === "background" || recovered).catch(() => undefined);
  return decision;
}

/** POST /api/devices/heartbeat, unless one went out recently (`force` skips that). */
export async function sendHeartbeat(force = false): Promise<void> {
  const now = Date.now();
  if (!heartbeatDue(await db.getNum("heartbeat_sent_at"), now, force)) return;
  const pairing = await loadPairing();
  if (!pairing || (await db.getKv("auth_lost")) === "1") return;

  const [enabled, runningNow, perm, mode, lastFixAt, queued, recoveries, preset, custom, smart, usage] = await Promise.all([
    isTrackingEnabled(),
    isTrackingRunning(),
    getPermissions().catch(() => null),
    db.getKv("applied_mode"),
    db.getNum("last_fix_at"),
    db.count(),
    getRecoveries(),
    getPreset(),
    getCustom(),
    isSmartTracking(),
    usageForHeartbeat().catch(() => undefined),
  ]);
  const body = buildHeartbeat({
    now,
    enabled,
    running: runningNow,
    permitted: perm?.foreground === "granted" && perm.background === "granted",
    mode: mode === "standby" ? "standby" : "active",
    lastFixAt,
    queued,
    appVersion: appVersion(),
    recoveries,
    preset: { key: preset, custom, smartTracking: smart },
    usage,
  });
  const r = await api.postHeartbeat(pairing, body);
  if (r.status === 200) {
    await db.setNum("heartbeat_sent_at", now);
    await db.setKv("heartbeat_error", null);
  } else if (r.status === 401) {
    await markPairingLost();
  } else {
    // 404 = a server from before heartbeats; harmless, try again next time.
    await db.setKv("heartbeat_error", r.status == null ? (r.error ?? "network error") : `HTTP ${r.status}`);
  }
}

/** The user changed the preset or Smart Tracking: tell the server now (stats split at the change). */
export function presetChanged(): void {
  sendHeartbeat(true).catch(() => undefined);
}

// Motion events: remember when we last moved (survives the process, so the
// background task knows) and check that recording keeps up.
let lastMotionCheck = 0;
let lastMovingWrite = 0;
addActivityListener((a) => {
  const now = Date.now();
  if (MOVING.includes(a.type) && a.confidence >= MIN_CONFIDENCE && now - lastMovingWrite > 60_000) {
    lastMovingWrite = now;
    db.setNum("last_moving_at", a.at).catch(() => undefined);
  }
  if (now - lastMotionCheck < MOTION_CHECK_EVERY_MS) return;
  lastMotionCheck = now;
  runWatchdog("motion").catch(() => undefined);
});
