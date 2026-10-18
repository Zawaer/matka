// Web stand-in for src/collector.ts. ?tracking=1&queued=37 control the state.
const q = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
let tracking = q.get("tracking") === "1";
let queued = Number(q.get("queued") ?? 0);

export const TASK = "matka-bg-location";
export async function isTracking() { return tracking; }
export async function requestPermissions() { return { fg: "granted", bg: "granted" }; }
export async function startTracking() { tracking = true; }
export async function stopTracking() { tracking = false; }
export async function flushQueue() {}
export function queuedCount() { return queued; }
