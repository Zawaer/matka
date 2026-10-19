import type { IconName } from "../ui/Icon";

/** Label and icon per travel mode (same wording as the web app's lib/modes.ts and the timeline). */
export const MODE_META: Record<string, { label: string; icon: IconName }> = {
  unknown: { label: "Move", icon: "dots-horizontal" },
  stationary: { label: "Stationary", icon: "pause-circle-outline" },
  walking: { label: "Walk", icon: "walk" },
  running: { label: "Run", icon: "run" },
  cycling: { label: "Cycle", icon: "bike" },
  driving: { label: "Drive", icon: "car" },
  bus: { label: "Bus", icon: "bus" },
  tram: { label: "Tram", icon: "tram" },
  metro: { label: "Metro", icon: "subway-variant" },
  train: { label: "Train", icon: "train" },
  flying: { label: "Flight", icon: "airplane" },
  boat: { label: "Ferry", icon: "ferry" },
  motorcycle: { label: "Motorbike", icon: "motorbike" },
};

export const modeMeta = (mode: string) => MODE_META[mode] ?? MODE_META.unknown;
