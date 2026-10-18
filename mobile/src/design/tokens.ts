/**
 * Matka design tokens: the single source of truth for colour, type, spacing,
 * radii and elevation. Screens never hard-code a value; they read the theme
 * (see theme.tsx). The web app mirrors the colour values in web/src/app/globals.css.
 *
 * Personality: "birch & aurora". A warm paper-white (light) or midnight ink (dark)
 * canvas, one confident violet, and a lingonberry-coral for anything live.
 */

export type Scheme = "light" | "dark";

type Tint = { fg: string; bg: string };

export type Colors = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  primarySoft: string;
  accent: string;
  accentSoft: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  hero: string;
  onHero: string;
  onHeroMuted: string;
  heroRing: string;
  barMuted: string;
  grid: string;
  skeleton: string;
  tabBar: string;
  /** Decorative per-stat hues; never used as chart series colours. */
  tint: { violet: Tint; coral: Tint; amber: Tint; mint: Tint; sky: Tint; slate: Tint };
};

export const palette: Record<Scheme, Colors> = {
  light: {
    bg: "#F7F5F0",
    surface: "#FFFFFF",
    surfaceAlt: "#F0EDE6",
    border: "#E8E3D9",
    borderStrong: "#D6D0C3",
    text: "#16161F",
    textSecondary: "#505065",
    textMuted: "#6E6E80",
    primary: "#5144E8",
    primaryPressed: "#4034C9",
    onPrimary: "#FFFFFF",
    primarySoft: "#ECEAFE",
    accent: "#E5483A",
    accentSoft: "#FDE9E6",
    danger: "#D2382B",
    dangerSoft: "#FDE9E6",
    success: "#12805C",
    successSoft: "#DDF4EA",
    hero: "#4B3FE0",
    onHero: "#FFFFFF",
    onHeroMuted: "rgba(255,255,255,0.74)",
    heroRing: "rgba(255,255,255,0.20)",
    barMuted: "#D9D5F9",
    grid: "#ECE8DF",
    skeleton: "#ECE8DF",
    tabBar: "#FFFFFF",
    tint: {
      violet: { fg: "#5144E8", bg: "#ECEAFE" },
      coral: { fg: "#D2432F", bg: "#FDEAE5" },
      amber: { fg: "#A86500", bg: "#FFF1D3" },
      mint: { fg: "#0E7F5E", bg: "#DDF4EA" },
      sky: { fg: "#1B6BC4", bg: "#E1EEFC" },
      slate: { fg: "#5B5D72", bg: "#EEEBE4" },
    },
  },
  dark: {
    bg: "#0E0F1C",
    surface: "#171A2B",
    surfaceAlt: "#1F2338",
    border: "#2A2F4A",
    borderStrong: "#3A4163",
    text: "#F2F1FA",
    textSecondary: "#B6B8CF",
    textMuted: "#8A8DAA",
    primary: "#9C8FFF",
    primaryPressed: "#B3A9FF",
    onPrimary: "#14112E",
    primarySoft: "#272355",
    accent: "#FF8A75",
    accentSoft: "#3B2330",
    danger: "#FF8A75",
    dangerSoft: "#3B2330",
    success: "#4FD1A1",
    successSoft: "#15332B",
    hero: "#3A32A6",
    onHero: "#FFFFFF",
    onHeroMuted: "rgba(255,255,255,0.72)",
    heroRing: "rgba(255,255,255,0.16)",
    barMuted: "#2F2B5E",
    grid: "#232842",
    skeleton: "#212640",
    tabBar: "#12142A",
    tint: {
      violet: { fg: "#B1A7FF", bg: "#272355" },
      coral: { fg: "#FF9D8B", bg: "#3B2330" },
      amber: { fg: "#F2B84B", bg: "#38301A" },
      mint: { fg: "#58D6A8", bg: "#15332B" },
      sky: { fg: "#7DB6F5", bg: "#172C47" },
      slate: { fg: "#A3A6C0", bg: "#262A41" },
    },
  },
};

/**
 * Travel-mode colours: the data-viz categorical palette, fixed slot order, validated
 * with the dataviz skill's validator in both modes (adjacent CVD dE >= 8.4, normal
 * vision dE >= 19). The most common modes take slots 1-3 so they also pass the
 * strict all-pairs check. Walking, bus and running fall under 3:1 on white, so
 * every leg is always shown with an icon and a text label (the relief rule).
 */
const MODE_SLOTS: Record<Scheme, string[]> = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
};
const MODE_ORDER = ["driving", "cycling", "walking", "bus", "running", "boat", "train", "flying"] as const;

export type ModeKey =
  | (typeof MODE_ORDER)[number]
  | "motorcycle"
  | "stationary"
  | "unknown";

export function modeColor(mode: string, scheme: Scheme, mutedFallback: string): string {
  const key = mode === "motorcycle" ? "driving" : mode;
  const i = (MODE_ORDER as readonly string[]).indexOf(key);
  return i >= 0 ? MODE_SLOTS[scheme][i] : mutedFallback;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 40 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const layout = { gutter: 20, tabBarHeight: 68, maxBar: 24 } as const;

export type TypeStyle = {
  fontSize: number;
  lineHeight: number;
  fontWeight: "400" | "500" | "600" | "700" | "800";
  letterSpacing?: number;
  textTransform?: "uppercase";
};

/** Type scale. System font: weight, size and tracking carry the personality. */
export const type = {
  display: { fontSize: 56, lineHeight: 60, fontWeight: "800", letterSpacing: -2 },
  title1: { fontSize: 30, lineHeight: 36, fontWeight: "800", letterSpacing: -0.7 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.4 },
  title3: { fontSize: 18, lineHeight: 24, fontWeight: "700", letterSpacing: -0.2 },
  stat: { fontSize: 26, lineHeight: 30, fontWeight: "800", letterSpacing: -0.6 },
  // 700, not 600: Android's Roboto has no semibold and renders 600 as regular.
  headline: { fontSize: 16, lineHeight: 22, fontWeight: "700" },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" },
  callout: { fontSize: 14, lineHeight: 20, fontWeight: "500" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: "700", letterSpacing: 0.9, textTransform: "uppercase" },
} satisfies Record<string, TypeStyle>;

export type TypeVariant = keyof typeof type;

/** Elevation as CSS-style box shadows (React Native 0.76+, and react-native-web). */
export const elevation: Record<Scheme, { e0: string; e1: string; e2: string; glow: string }> = {
  light: {
    e0: "0 0 0 rgba(0,0,0,0)",
    e1: "0 1px 2px rgba(40,34,20,0.06), 0 1px 1px rgba(40,34,20,0.03)",
    e2: "0 2px 6px rgba(40,34,20,0.05), 0 10px 28px -8px rgba(40,34,20,0.14)",
    glow: "0 14px 32px -10px rgba(81,68,232,0.55)",
  },
  dark: {
    e0: "0 0 0 rgba(0,0,0,0)",
    e1: "0 1px 2px rgba(0,0,0,0.35)",
    e2: "0 10px 28px -8px rgba(0,0,0,0.65)",
    glow: "0 14px 34px -12px rgba(120,100,255,0.55)",
  },
};
