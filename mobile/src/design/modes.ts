import type { IconName } from "./icons";

/** Label and icon per travel mode (same wording as the web app's lib/modes.ts and the timeline). */
export const MODE_META: Record<string, { label: string; icon: IconName }> = {
  unknown: { label: "Move", icon: "move" },
  stationary: { label: "Stationary", icon: "stationary" },
  walking: { label: "Walk", icon: "walk" },
  running: { label: "Run", icon: "run" },
  cycling: { label: "Cycle", icon: "cycle" },
  driving: { label: "Drive", icon: "drive" },
  bus: { label: "Bus", icon: "bus" },
  tram: { label: "Tram", icon: "tram" },
  metro: { label: "Metro", icon: "metro" },
  train: { label: "Train", icon: "train" },
  flying: { label: "Flight", icon: "flight" },
  boat: { label: "Ferry", icon: "ferry" },
  motorcycle: { label: "Motorbike", icon: "motorbike" },
};

export const modeMeta = (mode: string) => MODE_META[mode] ?? MODE_META.unknown;
