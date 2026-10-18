import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { File, Paths } from "expo-file-system";
import { API_BASE } from "./api";

export const TASK = "matka-bg-location";
const INGEST_URL = `${API_BASE}/api/ingest`;

type QueuedPoint = {
  lat: number;
  lon: number;
  ts: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
};

// Points wait in a file until the server confirms them, so nothing is lost
// while offline or while the server is down. Oldest points are dropped only
// past MAX_QUEUED (~2 weeks of continuous recording at the 15 s floor).
const QUEUE = new File(Paths.document, "matka-queue.json");
const MAX_QUEUED = 100_000;
const BATCH = 500;

let knownCount = -1; // cached so the UI can poll without re-reading the file

function readQueue(): QueuedPoint[] {
  try {
    const q = QUEUE.exists ? (JSON.parse(QUEUE.textSync()) as QueuedPoint[]) : [];
    knownCount = q.length;
    return q;
  } catch (e) {
    console.error("[matka-bg] queue unreadable, starting fresh", e);
    return [];
  }
}

async function writeQueue(points: QueuedPoint[]): Promise<void> {
  if (!QUEUE.exists) QUEUE.create();
  await QUEUE.write(JSON.stringify(points));
  knownCount = points.length;
}

// One queue operation at a time within this JS runtime.
let chain: Promise<void> = Promise.resolve();
function serialized(fn: () => Promise<void>): Promise<void> {
  chain = chain.then(fn, fn);
  return chain;
}

/** Upload queued points oldest-first; stop at the first failure and keep the rest. */
async function drain(): Promise<void> {
  let queue = readQueue();
  while (queue.length > 0) {
    const batch = queue.slice(0, BATCH);
    let res: Response;
    try {
      res = await fetch(INGEST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: batch }),
      });
    } catch (e) {
      console.warn(`[matka-bg] upload failed, ${queue.length} points kept`, e);
      return;
    }
    if (!res.ok) {
      console.warn(`[matka-bg] server returned ${res.status}, ${queue.length} points kept`);
      return;
    }
    queue = queue.slice(batch.length);
    await writeQueue(queue);
  }
}

function enqueue(points: QueuedPoint[]): Promise<void> {
  return serialized(async () => {
    const queue = readQueue().concat(points);
    await writeQueue(queue.length > MAX_QUEUED ? queue.slice(-MAX_QUEUED) : queue);
    await drain();
  });
}

/** Retry uploading anything still queued (e.g. when the app opens). */
export function flushQueue(): Promise<void> {
  return serialized(drain);
}

export function queuedCount(): number {
  return knownCount >= 0 ? knownCount : readQueue().length;
}

// Background task — runs even when the app is backgrounded / screen locked.
TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error) {
    console.error("[matka-bg] task error", error);
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] })
    ?.locations;
  if (!locations || locations.length === 0) return;
  const points: QueuedPoint[] = locations.map((l) => ({
    lat: l.coords.latitude,
    lon: l.coords.longitude,
    ts: Math.floor(l.timestamp / 1000),
    accuracy: l.coords.accuracy ?? null,
    altitude: l.coords.altitude ?? null,
    speed: l.coords.speed ?? null,
  }));
  try {
    await enqueue(points);
  } catch (e) {
    console.error("[matka-bg] could not queue points", e);
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
