// Canonical transport-mode mapping, mirrored from Dawarich's Track::TRANSPORTATION_MODES.

export type ModeKey =
  | "unknown"
  | "stationary"
  | "walking"
  | "running"
  | "cycling"
  | "driving"
  | "bus"
  | "train"
  | "flying"
  | "boat"
  | "motorcycle";

export const MODE_BY_INT: Record<number, ModeKey> = {
  0: "unknown",
  1: "stationary",
  2: "walking",
  3: "running",
  4: "cycling",
  5: "driving",
  6: "bus",
  7: "train",
  8: "flying",
  9: "boat",
  10: "motorcycle",
};

export function modeFromInt(n: number | null | undefined): ModeKey {
  if (n == null) return "unknown";
  return MODE_BY_INT[n] ?? "unknown";
}

export const MODE_META: Record<
  ModeKey,
  { label: string; icon: string; color: string }
> = {
  unknown: { label: "Move", icon: "•", color: "var(--mk-muted)" },
  stationary: { label: "Stationary", icon: "⏸", color: "var(--mk-muted)" },
  walking: { label: "Walk", icon: "🚶", color: "var(--mk-walk)" },
  running: { label: "Run", icon: "🏃", color: "var(--mk-run)" },
  cycling: { label: "Cycle", icon: "🚲", color: "var(--mk-bike)" },
  driving: { label: "Drive", icon: "🚗", color: "var(--mk-car)" },
  bus: { label: "Bus", icon: "🚌", color: "var(--mk-bus)" },
  train: { label: "Train", icon: "🚆", color: "var(--mk-transit)" },
  flying: { label: "Flight", icon: "✈️", color: "var(--mk-fly)" },
  boat: { label: "Boat", icon: "⛴️", color: "var(--mk-boat)" },
  motorcycle: { label: "Motorbike", icon: "🏍️", color: "var(--mk-car)" },
};
