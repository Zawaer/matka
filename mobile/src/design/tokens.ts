/**
 * Matka design tokens: the single source of truth for colour, type, spacing,
 * radii and elevation. Screens never hard-code a value; they read the theme
 * (see theme.tsx). Rules behind the values: docs/DESIGN_REFERENCES.md and
 * docs/REDESIGN.md ("Round 1 (app)").
 *
 * Neutral first: one cool grey scale for every surface, border and text, and
 * one indigo accent used only for the primary action, selection and links.
 * Travel-mode colours are data and appear only on marks and mode glyphs;
 * status colours (danger, warning, success) only where they say something.
 */

export type Scheme = "light" | "dark";

export type Colors = {
  /** Page. */
  bg: string;
  /** Cards, sheets, the tab bar (level 2). */
  surface: string;
  /** Inputs, tiles, segmented tracks, pressed rows (level 3, tonal). */
  surfaceAlt: string;
  /** The selected thumb of a segmented control (sits on surfaceAlt). */
  raised: string;
  /** Hairlines: card borders and dividers. */
  border: string;
  /** Meaningful borders: inputs, outlined buttons, the timeline rail. */
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  /** Selected pill, accent tile background. */
  primarySoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  successSoft: string;
  /** Unselected chart bars: neutral, 3:1 on surface (the accent marks only the selection). */
  barMuted: string;
  grid: string;
  skeleton: string;
  scrim: string;
};

export const palette: Record<Scheme, Colors> = {
  light: {
    bg: "#F4F4F6",
    surface: "#FFFFFF",
    surfaceAlt: "#EEEEF2",
    raised: "#FFFFFF",
    border: "#E4E4EA",
    borderStrong: "#85858F",
    text: "#18181D",
    textSecondary: "#52525C",
    textMuted: "#686873",
    primary: "#4F46E5",
    primaryPressed: "#4338CA",
    onPrimary: "#FFFFFF",
    primarySoft: "#ECECFD",
    danger: "#C4362B",
    dangerSoft: "#FCECEA",
    warning: "#8F5600",
    warningSoft: "#FDF2DE",
    success: "#14775A",
    successSoft: "#E2F3EB",
    barMuted: "#8E8E99",
    grid: "#EAEAEF",
    skeleton: "#E9E9EE",
    scrim: "rgba(10,10,14,0.45)",
  },
  dark: {
    bg: "#0E0E11",
    surface: "#18181C",
    surfaceAlt: "#232328",
    raised: "#34343C",
    border: "#2A2A30",
    borderStrong: "#6E6E78",
    text: "#EDEDF0",
    textSecondary: "#B3B3BD",
    textMuted: "#91919C",
    primary: "#A09BFF",
    primaryPressed: "#B6B2FF",
    onPrimary: "#15132E",
    primarySoft: "#282650",
    danger: "#FF8A80",
    dangerSoft: "#3A1F1F",
    warning: "#F2B652",
    warningSoft: "#33291A",
    success: "#5BCFA3",
    successSoft: "#16302A",
    barMuted: "#66666F",
    grid: "#26262C",
    skeleton: "#24242A",
    scrim: "rgba(0,0,0,0.6)",
  },
};

/**
 * Travel-mode colours: the shared round-2 palette (docs/redesign/palette.md, the
 * same values as the web's --mk-*). Eight slots, every one at least 3:1 on every
 * surface in its theme, Train/Metro a slate well away from the indigo accent and
 * Flight a plum away from danger. Tram shares Bus, Metro shares Train and
 * Motorbike shares Drive: the row, legend and line badge carry the name.
 */
const MODE_COLORS: Record<Scheme, Record<string, string>> = {
  light: {
    driving: "#2a6fdb",
    cycling: "#c4620f",
    walking: "#1d8a5a",
    bus: "#9c7a00",
    running: "#cc4a86",
    boat: "#0b5e7a",
    train: "#686b8f",
    flying: "#8c3aa3",
  },
  dark: {
    driving: "#3d86e0",
    cycling: "#e0782f",
    walking: "#36b27a",
    bus: "#d6a52a",
    running: "#e8679f",
    boat: "#4cb8d0",
    train: "#8f93b3",
    flying: "#b45fd0",
  },
};

export type ModeKey = "driving" | "cycling" | "walking" | "bus" | "running" | "boat" | "train" | "flying" | "motorcycle" | "stationary" | "unknown";

export function modeColor(mode: string, scheme: Scheme, mutedFallback: string): string {
  const key = mode === "motorcycle" ? "driving" : mode === "tram" ? "bus" : mode === "metro" ? "train" : mode;
  return MODE_COLORS[scheme][key] ?? mutedFallback;
}

/** The 4 px grid. Inside a card 12 or 16; between groups 24 or 32. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** One radius per component type: badges 6, controls 10, cards 14, sheets 28, pills. */
export const radius = { xs: 6, sm: 10, md: 14, xl: 28, pill: 999 } as const;

export const layout = {
  /** Page inset. */
  gutter: 16,
  /** Minimum touch target (Android 48 dp). */
  touch: 48,
  /** List rows: one line, two lines. */
  row: 56,
  row2: 68,
  /** Leading icon tile in lists. */
  tile: 40,
} as const;

export type TypeStyle = {
  fontSize: number;
  lineHeight: number;
  fontWeight: "400" | "500" | "600";
  letterSpacing?: number;
};

/** The app's one typeface, bundled at 400 / 500 / 600 (app.json expo-font plugin; design/fonts). */
export const FONT_FAMILY = "Inter";

/**
 * Type scale: the iOS sizes (11 / 12 / 13 / 15 / 17 / 22 / 28), nothing in
 * between. Inter at three weights: 400 for reading, 500 for row titles and
 * labels, 600 for titles and numbers. Nothing heavier: hierarchy comes from
 * weight and tone, not from shouting.
 */
export const type = {
  /** One hero number per screen (Overview total). */
  display: { fontSize: 28, lineHeight: 34, fontWeight: "600", letterSpacing: -0.5 },
  /** App bar titles (tabs and pushed views). */
  title1: { fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.3 },
  /** Sheet titles, cover titles over photos. */
  title2: { fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.3 },
  /** Section headers (one style everywhere, sentence case). */
  title3: { fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.2 },
  /** Big numbers in a stat card (tabular). */
  stat: { fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.3 },
  /** Small stats: row values, the day's totals. */
  statSm: { fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.2 },
  /** Row titles. */
  headline: { fontSize: 15, lineHeight: 20, fontWeight: "500" },
  /** Paragraphs. */
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" },
  /** Row metadata, secondary lines, trailing values. */
  callout: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  /** Button and chip labels. */
  label: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  /** Captions, axis labels, footnotes. */
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
  /** Small group labels (sentence case, never uppercase). */
  overline: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  /** The smallest text: badges in tight spots, axis ticks. */
  micro: { fontSize: 11, lineHeight: 13, fontWeight: "500" },
} satisfies Record<string, TypeStyle>;

export type TypeVariant = keyof typeof type;

/**
 * Elevation. Cards are flat (tone and a hairline separate them); only things that
 * float over the page cast a shadow. Dark mode uses lighter surfaces, no shadow.
 */
export const elevation: Record<Scheme, { none: string; overlay: string }> = {
  light: {
    none: "0 0 0 rgba(0,0,0,0)",
    overlay: "0 -1px 2px rgba(16,16,24,0.06), 0 -8px 28px rgba(16,16,24,0.12)",
  },
  dark: {
    none: "0 0 0 rgba(0,0,0,0)",
    overlay: "0 0 0 rgba(0,0,0,0)",
  },
};
