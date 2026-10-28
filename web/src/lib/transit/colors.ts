import type { TransitLeg } from "../types";

/** HSL's own line colours, so badges look like the signs at the stop. */
const HSL: Record<TransitLeg["kind"], string> = {
  bus: "#007AC9",
  tram: "#00985F",
  metro: "#FF6319",
  train: "#8C4799",
  boat: "#00B9E4",
};
export const KIND_LABEL: Record<TransitLeg["kind"], string> = {
  bus: "Bus",
  tram: "Tram",
  metro: "Metro",
  train: "Train",
  boat: "Ferry",
};

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Badge background and a text colour that clears 4.5:1 on it (white or near-black). */
export function badgeColors(kind: TransitLeg["kind"]): { bg: string; fg: string } {
  const bg = HSL[kind];
  const L = lum(bg);
  const white = 1.05 / (L + 0.05);
  const dark = (L + 0.05) / (lum("#16161f") + 0.05);
  return { bg, fg: white >= 4.5 || white >= dark ? "#ffffff" : "#16161f" };
}

/** "Metro M1", or every line still possible on shared track: "Metro M1/M2", "Bus 102N/510". */
export const legBadgeText = (kind: TransitLeg["kind"], lines: string[]) => `${KIND_LABEL[kind]} ${lines.join("/")}`;
