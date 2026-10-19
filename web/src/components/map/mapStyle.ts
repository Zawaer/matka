// Shared by the big map (MapView) and the timeline's day map (DayMap).

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
