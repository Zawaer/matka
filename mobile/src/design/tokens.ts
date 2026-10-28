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
    barMuted: "#D5D3F6",
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
    barMuted: "#35335E",
    grid: "#26262C",
    skeleton: "#24242A",
    scrim: "rgba(0,0,0,0.6)",
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
  // 11 modes, 8 validated slots: these share a slot with their closest mode; the
  // timeline row's icon, label and line badge tell them apart.
  const key = mode === "motorcycle" ? "driving" : mode === "tram" ? "bus" : mode === "metro" ? "train" : mode;
  const i = (MODE_ORDER as readonly string[]).indexOf(key);
  return i >= 0 ? MODE_SLOTS[scheme][i] : mutedFallback;
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
  fontWeight: "400" | "500" | "800";
  letterSpacing?: number;
  textTransform?: "uppercase";
};

/**
 * Type scale: the iOS sizes (11 / 12 / 13 / 15 / 17 / 22 / 28 / 34), nothing in
 * between. Weight carries hierarchy before size: 400 for reading, 500 for row
 * titles and labels, 800 only for screen titles and big numbers. (Measured on the
 * phone, Android draws 600 and 700 as regular; 500 is Roboto Medium, 800 a real bold.)
 */
export const type = {
  /** One hero number per screen (Overview total). */
  display: { fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -0.8 },
  /** Screen titles. */
  title1: { fontSize: 28, lineHeight: 34, fontWeight: "800", letterSpacing: -0.5 },
  /** Detail titles, the day / month in a pager. */
  title2: { fontSize: 22, lineHeight: 28, fontWeight: "800", letterSpacing: -0.3 },
  /** Section headers and card titles. */
  title3: { fontSize: 17, lineHeight: 22, fontWeight: "500", letterSpacing: -0.1 },
  /** Stat tiles (tabular). */
  stat: { fontSize: 28, lineHeight: 32, fontWeight: "800", letterSpacing: -0.5 },
  /** Small stats: the timeline's day totals, row values. */
  statSm: { fontSize: 17, lineHeight: 22, fontWeight: "800", letterSpacing: -0.2 },
  /** Row titles. */
  headline: { fontSize: 15, lineHeight: 20, fontWeight: "500" },
  /** Paragraphs. */
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" },
  /** Row metadata, secondary lines. */
  callout: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  /** Button and chip labels. */
  label: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  /** Captions, axis labels, footnotes. */
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
  /** Group labels above lists (Settings, Recorder). */
  overline: { fontSize: 12, lineHeight: 16, fontWeight: "500", letterSpacing: 0.6, textTransform: "uppercase" },
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
