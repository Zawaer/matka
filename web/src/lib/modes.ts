// Transport modes. trips.mode stores these keys; detect.ts assigns them.
// Icons: components/ui/icons.tsx (MODE_ICONS).

export type ModeKey =
  | "unknown"
  | "stationary"
  | "walking"
  | "running"
  | "cycling"
  | "driving"
  | "bus"
  | "tram"
  | "metro"
  | "train"
  | "flying"
  | "boat"
  | "motorcycle";

export function isModeKey(s: string): s is ModeKey {
  return s in MODE_META;
}

export const MODE_META: Record<
  ModeKey,
  { label: string; color: string }
> = {
  unknown: { label: "Move", color: "var(--mk-muted)" },
  stationary: { label: "Stationary", color: "var(--mk-muted)" },
  walking: { label: "Walk", color: "var(--mk-walk)" },
  running: { label: "Run", color: "var(--mk-run)" },
  cycling: { label: "Cycle", color: "var(--mk-bike)" },
  driving: { label: "Drive", color: "var(--mk-car)" },
  bus: { label: "Bus", color: "var(--mk-bus)" },
  tram: { label: "Tram", color: "var(--mk-tram)" },
  metro: { label: "Metro", color: "var(--mk-metro)" },
  train: { label: "Train", color: "var(--mk-transit)" },
  flying: { label: "Flight", color: "var(--mk-fly)" },
  boat: { label: "Ferry", color: "var(--mk-boat)" },
  motorcycle: { label: "Motorbike", color: "var(--mk-car)" },
};
