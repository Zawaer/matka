// Shared by the big map (MapView) and the timeline's day map (DayMap).

import type { Map as MlMap } from "maplibre-gl";
import { MODE_META, type ModeKey } from "@/lib/modes";

type FC = GeoJSON.FeatureCollection;

/** Whether the app is currently rendering dark (mirrors globals.css logic). */
export function computeDark(): boolean {
  if (typeof window === "undefined") return true;
  const theme = document.documentElement.dataset.theme;
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * MapLibre's worker, our own copy (scripts/copy-maplibre-worker.mjs: the
 * bundler can't serve the one MapLibre looks for next to its module). The
 * version in the query makes it cacheable for good (next.config.ts).
 */
export const workerUrl = (version: string) => `/maplibre-gl-worker.mjs?v=${encodeURIComponent(version)}`;

// Key-free OpenFreeMap vector basemaps (CARTO raster now requires an API key).
export function styleUrl(dark: boolean): string {
  return dark
    ? "https://tiles.openfreemap.org/styles/dark"
    : "https://tiles.openfreemap.org/styles/positron";
}

/** Resolve a MODE_META color (which may be a CSS var) to a concrete color. */
export function resolveColor(value: string): string {
  const m = value.match(/^var\((--[^)]+)\)$/);
  if (!m) return value;
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(m[1])
    .trim();
  return resolved || "#888888";
}

/** Build a maplibre `match` expression: mode property → line color. */
export function modeColorExpression(): unknown {
  const expr: unknown[] = ["match", ["get", "mode"]];
  for (const key of Object.keys(MODE_META) as ModeKey[]) {
    expr.push(key, resolveColor(MODE_META[key].color));
  }
  expr.push(resolveColor(MODE_META.unknown.color)); // default
  return expr;
}

/** Extend a bounds accumulator over every coordinate in a FeatureCollection. */
export function extendBounds(acc: [number, number, number, number] | null, fc: FC) {
  let b = acc;
  const visit = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const [lon, lat] = coords as [number, number];
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      b = b
        ? [
            Math.min(b[0], lon),
            Math.min(b[1], lat),
            Math.max(b[2], lon),
            Math.max(b[3], lat),
          ]
        : [lon, lat, lon, lat];
      return;
    }
    for (const c of coords) visit(c);
  };
  for (const f of fc.features)
    if (f.geometry)
      visit(
        (f.geometry as GeoJSON.Geometry & { coordinates?: unknown })
          .coordinates,
      );
  return b;
}


type StyleLayer = {
  id: string;
  type: string;
  "source-layer"?: string;
  minzoom?: number;
  filter?: unknown;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
};
type Style = { layers: StyleLayer[] } & Record<string, unknown>;

/** Dark-style fills that read as one family with the app's dark surfaces. */
const DARK_FILLS: Record<string, string> = {
  background: "#101117",
  water: "#232633",
  waterway: "#232633",
  landuse_residential: "#13141a",
  landcover_wood: "#171a1c",
  landuse_park: "#171a1c",
  building: "#16171e",
  highway_path: "#1d1f28",
  highway_minor: "#20222b",
  highway_major_inner: "#272a35",
  highway_major_subtle: "#272a35",
  highway_motorway_subtle: "#20222b",
  road_area_pier: "#101117",
  road_pier: "#101117",
};

/** Layers that are noise on a personal map: road shields (their sprites are
 * missing, so they draw as empty boxes), state/province names and borders'
 * labels, river labels. */
const HIDDEN = /shield|^place_state$|^label_state$|waterway.*label|^road_oneway/;

/**
 * Quiets an OpenFreeMap style before it is handed to MapLibre (so nothing
 * flashes untamed), the same in light and dark:
 *  - no road shields, no state/province names, no river labels
 *  - water names only for seas and oceans (no straits, bays or sounds)
 *  - Latin-script labels ("Belarus", not "Belarus / Беларусь"), regular weight,
 *    sentence case (the dark style's labels are ALL CAPS) and no letter-spacing
 *  - place labels in a muted ink; in dark, water lifted to about surface-3
 *    and roads a step above the land
 * Pure: returns a new style object. Tested in mapStyle.test.ts.
 */
export function transformStyle<T extends Style>(style: T, dark: boolean): T {
  const latin = ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]];
  const ink = dark ? "#a3a5b5" : "#5f5f6b";
  const layers: StyleLayer[] = [];
  for (const src of style.layers) {
    if (HIDDEN.test(src.id)) continue;
    // Copies, never `layout: undefined` (MapLibre rejects an explicit undefined).
    const l: StyleLayer = { ...src };
    if (src.layout) l.layout = { ...src.layout };
    if (src.paint) l.paint = { ...src.paint };
    if (dark && DARK_FILLS[l.id] && l.paint) {
      const key = l.type === "background" ? "background-color" : l.type === "line" ? "line-color" : "fill-color";
      if (key in l.paint || l.type === "background") l.paint[key] = DARK_FILLS[l.id];
    }
    if (l.type === "symbol" && l.layout && "text-field" in l.layout) {
      l.layout["text-field"] = latin;
      if ("text-transform" in l.layout) l.layout["text-transform"] = "none";
      if ("text-letter-spacing" in l.layout) l.layout["text-letter-spacing"] = 0;
      const font = l.layout["text-font"];
      if (Array.isArray(font)) l.layout["text-font"] = font.map((f) => (typeof f === "string" ? f.replace("Bold", "Regular") : f));
      if (l["source-layer"] === "place") l.paint = { ...l.paint, "text-color": ink };
      if (l["source-layer"] === "water_name") {
        const sea = ["match", ["get", "class"], ["ocean", "sea"], true, false];
        if (!JSON.stringify(l.filter ?? null).includes('["ocean","sea"]')) l.filter = l.filter ? ["all", l.filter, sea] : sea;
        l.paint = { ...l.paint, "text-color": dark ? "#7d8296" : "#6f7a82" };
      }
    }
    layers.push(l);
  }
  return { ...style, layers };
}

const styleCache = new Map<boolean, Promise<Style>>();

/**
 * The basemap style for a theme, fetched once and passed through
 * transformStyle. Falls back to the plain URL if the fetch fails (MapLibre
 * then loads and reports it itself).
 */
export function loadStyle(dark: boolean): Promise<Style | string> {
  let p = styleCache.get(dark);
  if (!p) {
    p = fetch(styleUrl(dark))
      .then((r) => (r.ok ? (r.json() as Promise<Style>) : Promise.reject(new Error(String(r.status)))))
      .then((st) => transformStyle(st, dark));
    p.catch(() => styleCache.delete(dark));
    styleCache.set(dark, p);
  }
  return p.catch(() => styleUrl(dark));
}

/**
 * Kept for maps whose style came from a URL (a failed fetch above): the same
 * label clean-up, applied to the live map. A no-op on transformed styles.
 */
export function tameBasemap(m: MlMap, dark = computeDark()) {
  const style = m.getStyle() as unknown as Style | undefined;
  if (!style?.layers) return;
  const tamed = transformStyle(style, dark);
  const keep = new Set(tamed.layers.map((l) => l.id));
  for (const l of style.layers) {
    if (keep.has(l.id)) continue;
    try {
      m.setLayoutProperty(l.id, "visibility", "none");
    } catch {
      // gone already
    }
  }
  for (const l of tamed.layers) {
    if (l.type !== "symbol" || !l.layout || !("text-field" in l.layout)) continue;
    try {
      m.setLayoutProperty(l.id, "text-field", l.layout["text-field"] as never);
      if ("text-transform" in l.layout) m.setLayoutProperty(l.id, "text-transform", "none");
      if (l.layout["text-font"]) m.setLayoutProperty(l.id, "text-font", l.layout["text-font"] as never);
      if (l.paint?.["text-color"] && (l["source-layer"] === "place" || l["source-layer"] === "water_name"))
        m.setPaintProperty(l.id, "text-color", l.paint["text-color"] as never);
      if (l["source-layer"] === "water_name") m.setFilter(l.id, l.filter as never);
    } catch {
      // A layer the style doesn't allow changing: leave it.
    }
  }
}

/**
 * Padding for fitBounds that keeps marks clear of the map's own chrome: the
 * zoom buttons top-right, a legend or attribution along the bottom.
 */
export function fitPadding(
  width: number,
  height: number,
  { top = 56, right = 56, bottom = 40, left = 24 }: Partial<Record<"top" | "right" | "bottom" | "left", number>> = {},
) {
  // Never more than a third of either side, so tiny maps still fit something.
  const cap = (v: number, size: number) => Math.max(8, Math.min(v, Math.floor(size / 3)));
  return { top: cap(top, height), right: cap(right, width), bottom: cap(bottom, height), left: cap(left, width) };
}
