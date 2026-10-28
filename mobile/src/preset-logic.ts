// The "Custom" recording preset: the user's choices, validated (pure, unit-tested).

export type CustomAccuracy = "balanced" | "high" | "highest";

export const CUSTOM_ACCURACIES: readonly { key: CustomAccuracy; label: string }[] = [
  { key: "balanced", label: "Wi-Fi/cell" },
  { key: "high", label: "GPS" },
  { key: "highest", label: "Best GPS" },
];
export const CUSTOM_DISTANCES = [5, 10, 25, 50, 100] as const;
export const CUSTOM_TIMES = [2_000, 10_000, 30_000, 60_000, 120_000] as const;

export type CustomSettings = { accuracy: CustomAccuracy; distance: number; time: number };

export const DEFAULT_CUSTOM: CustomSettings = { accuracy: "high", distance: 25, time: 30_000 };

const isAccuracy = (v: unknown): v is CustomAccuracy => CUSTOM_ACCURACIES.some((a) => a.key === v);
const isDistance = (v: unknown): v is number => (CUSTOM_DISTANCES as readonly unknown[]).includes(v);
const isTime = (v: unknown): v is number => (CUSTOM_TIMES as readonly unknown[]).includes(v);

/** Parses stored settings; each invalid or missing field falls back to its default. */
export function parseCustom(json: string | null | undefined): CustomSettings {
  let o: Record<string, unknown> = {};
  try {
    const v: unknown = json ? JSON.parse(json) : null;
    if (v && typeof v === "object" && !Array.isArray(v)) o = v as Record<string, unknown>;
  } catch {
    // fall through to defaults
  }
  return {
    accuracy: isAccuracy(o.accuracy) ? o.accuracy : DEFAULT_CUSTOM.accuracy,
    distance: isDistance(o.distance) ? o.distance : DEFAULT_CUSTOM.distance,
    time: isTime(o.time) ? o.time : DEFAULT_CUSTOM.time,
  };
}

export const serializeCustom = (c: CustomSettings) =>
  JSON.stringify({ accuracy: c.accuracy, distance: c.distance, time: c.time });

/** Batch delivery to the app scales with the chosen density; never more than 2 min / 100 m. */
export function customDeferral(c: CustomSettings): { interval: number; distance: number } {
  return { interval: Math.min(c.time * 4, 120_000), distance: Math.min(c.distance * 4, 100) };
}

export function formatInterval(ms: number): string {
  return ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`;
}

// ---- What each preset records, in numbers (Settings) ---------------------------

/**
 * Typical accuracy per position source, outdoors with a clear sky. On Android
 * (expo-location → fused location provider) "balanced" is
 * PRIORITY_BALANCED_POWER_ACCURACY: Wi-Fi and cell towers, no GPS, block-level
 * at best and hundreds of metres on cell only. "high" and "highest" are both
 * PRIORITY_HIGH_ACCURACY (GPS); "highest" comes with short intervals (≤ 10 s),
 * so the GPS stays locked between fixes instead of re-acquiring, which is
 * what tightens the typical range.
 */
export const ACCURACY_CLASSES: Record<CustomAccuracy, { source: string; typical: string }> = {
  balanced: { source: "Wi-Fi/cell", typical: "50–500 m" },
  high: { source: "GPS", typical: "5–15 m" },
  highest: { source: "Best GPS", typical: "3–10 m" },
};

/**
 * "every 30 s, at least 25 m apart": the request interval, and the minimum
 * distance the fused provider wants between two points (setMinUpdateDistanceMeters).
 */
function cadence(c: CustomSettings): string {
  return `every ${formatInterval(c.time)}${c.distance > 0 ? `, at least ${c.distance} m apart` : ""}`;
}

/**
 * The spec lines of a preset, one fact each: position source and typical
 * accuracy, how often it records while moving, and what happens while still.
 * `smart`: Smart Tracking is on and applies to this preset (not Low power).
 */
export function presetSpecLines(c: CustomSettings, smart: boolean): string[] {
  const a = ACCURACY_CLASSES[c.accuracy];
  const accuracy =
    c.accuracy === "balanced" ? `${a.source} · typically ${a.typical}` : `${a.source} · typically ${a.typical} outdoors`;
  const still = smart
    ? "Still: GPS rests, Wi-Fi/cell standby"
    : c.accuracy === "balanced"
      ? "Still: stays on Wi-Fi/cell"
      : "Still: GPS stays on";
  return [accuracy, `Moving: a point ${cadence(c)}`, still];
}
