// Transport modes. trips.mode stores these keys; detect.ts assigns them.

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

export function isModeKey(s: string): s is ModeKey {
  return s in MODE_META;
}

export const MODE_META: Record<
  ModeKey,
  { label: string; icon: string; color: string }
> = {
  unknown: { label: "Move", icon: "•", color: "var(--mk-muted)" },
  stationary: { label: "Stationary", icon: "⏸", color: "var(--mk-muted)" },
  walking: { label: "Walk", icon: "🚶", color: "var(--mk-walk)" },
  running: { label: "Run", icon: "🏃", color: "#fb923c" },
  cycling: { label: "Cycle", icon: "🚲", color: "var(--mk-bike)" },
  driving: { label: "Drive", icon: "🚗", color: "var(--mk-car)" },
  bus: { label: "Bus", icon: "🚌", color: "#a78bfa" },
  train: { label: "Train", icon: "🚆", color: "var(--mk-transit)" },
  flying: { label: "Flight", icon: "✈️", color: "#22d3ee" },
  boat: { label: "Boat", icon: "⛴️", color: "#2dd4bf" },
  motorcycle: { label: "Motorbike", icon: "🏍️", color: "#f87171" },
};
