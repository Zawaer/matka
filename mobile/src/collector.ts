import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { API_BASE } from "./api";

export const TASK = "matka-bg-location";
const INGEST_URL = `${API_BASE}/api/ingest`;

// Background task — runs even when the app is backgrounded / screen locked.
TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error) {
    console.error("[matka-bg] task error", error);
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] })
    ?.locations;
  if (!locations || locations.length === 0) return;
  const points = locations.map((l) => ({
    lat: l.coords.latitude,
    lon: l.coords.longitude,
    ts: Math.floor(l.timestamp / 1000),
    accuracy: l.coords.accuracy ?? null,
    altitude: l.coords.altitude ?? null,
    speed: l.coords.speed ?? null,
  }));
  try {
    await fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points }),
    });
  } catch (e) {
    console.error("[matka-bg] POST failed", e);
  }
});

export async function isTracking(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
}

export async function requestPermissions(): Promise<{
  fg: string;
  bg: string;
}> {
  const f = await Location.requestForegroundPermissionsAsync();
  if (f.status !== "granted") return { fg: f.status, bg: "undetermined" };
  const b = await Location.requestBackgroundPermissionsAsync();
  return { fg: f.status, bg: b.status };
}

export async function startTracking(): Promise<void> {
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.High,
    // Production-ish: motion-gated + modest time floor (vs the 3s spike).
    timeInterval: 15000,
    distanceInterval: 20,
    pausesUpdatesAutomatically: true,
    activityType: Location.ActivityType.Other,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Matka",
      notificationBody: "Recording your location",
      notificationColor: "#14b8a6",
    },
  });
}

export async function stopTracking(): Promise<void> {
  const started = await isTracking();
  if (started) await Location.stopLocationUpdatesAsync(TASK);
}
