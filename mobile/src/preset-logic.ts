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

export function describeCustom(c: CustomSettings): string {
  const source = c.accuracy === "balanced" ? "Wi-Fi and cell" : c.accuracy === "highest" ? "Best GPS" : "GPS";
  return `${source} · every ${c.distance} m or ${formatInterval(c.time)}`;
}
