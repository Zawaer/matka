import type { LegKind } from "../viewer";

/**
 * Line badges in HSL's own colours, so they look like the signs at the stop.
 * Text colour chosen for 4.5:1 contrast on each (matches web lib/transit/colors.ts).
 */
export const LEG_BADGE: Record<LegKind, { label: string; bg: string; fg: string }> = {
  bus: { label: "Bus", bg: "#007AC9", fg: "#FFFFFF" },
  tram: { label: "Tram", bg: "#00985F", fg: "#16161F" },
  metro: { label: "Metro", bg: "#FF6319", fg: "#16161F" },
  train: { label: "Train", bg: "#8C4799", fg: "#FFFFFF" },
  boat: { label: "Ferry", bg: "#00B9E4", fg: "#16161F" },
};
