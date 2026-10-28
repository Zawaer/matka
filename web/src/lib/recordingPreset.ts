// The phone app's recording preset as it reports it in heartbeats
// (mobile/src/tracking.ts PRESETS, mobile/src/preset-logic.ts for "custom").
// Pure: validation, a canonical form for change detection, and labels.

export const PRESET_KEYS = ["low", "balanced", "precise", "max", "custom"] as const;
export type PresetKey = (typeof PRESET_KEYS)[number];
export const CUSTOM_ACCURACIES = ["balanced", "high", "highest"] as const;
export type CustomAccuracy = (typeof CUSTOM_ACCURACIES)[number];

/** The "Custom" preset's choices: accuracy, metres, milliseconds. */
export type CustomPreset = { accuracy: CustomAccuracy; distance: number; time: number };

/** What the phone records with (the jsonb of device_preset_log.preset). */
export type RecordingPreset = {
  preset: PresetKey;
  /** Only for "custom". */
  custom: CustomPreset | null;
  /** Smart Tracking (standby while still); null when the app didn't say. */
  smartTracking: boolean | null;
};

export const PRESET_LABELS: Record<PresetKey, string> = {
  low: "Low power",
  balanced: "Balanced",
  precise: "Precise",
  max: "Max detail",
  custom: "Custom",
};

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);
const between = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

/** The custom choices, or null when any is missing or out of range. */
export function parseCustomPreset(v: unknown): CustomPreset | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!oneOf(CUSTOM_ACCURACIES, o.accuracy) || !between(o.distance, 0, 10_000) || !between(o.time, 0, 3_600_000)) {
    return null;
  }
  return { accuracy: o.accuracy, distance: Math.round(o.distance), time: Math.round(o.time) };
}

/**
 * Reads `{preset, custom?, smartTracking?}` (a heartbeat body, devices.status or
 * a device_preset_log row). Null without a known `preset`; a "custom" preset
 * with bad values keeps `custom: null`.
 */
export function parseRecordingPreset(v: unknown): RecordingPreset | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!oneOf(PRESET_KEYS, o.preset)) return null;
  return {
    preset: o.preset,
    custom: o.preset === "custom" ? parseCustomPreset(o.custom) : null,
    smartTracking: typeof o.smartTracking === "boolean" ? o.smartTracking : null,
  };
}

/** Same string for the same settings (key order fixed), for change detection. */
export function presetKey(p: RecordingPreset): string {
  const c = p.custom;
  return [p.preset, c ? `${c.accuracy}/${c.distance}/${c.time}` : "", p.smartTracking ?? ""].join("|");
}

const seconds = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);

/** "Balanced", "Custom (Best GPS, 10 s / 10 m)", "Precise, Smart Tracking off". */
export function presetLabel(p: RecordingPreset): string {
  let s = PRESET_LABELS[p.preset];
  if (p.custom) {
    const src = p.custom.accuracy === "balanced" ? "Wi-Fi/cell" : p.custom.accuracy === "highest" ? "Best GPS" : "GPS";
    s += ` (${src}, ${seconds(p.custom.time)} / ${p.custom.distance} m)`;
  }
  if (p.smartTracking === false) s += ", Smart Tracking off";
  return s;
}
