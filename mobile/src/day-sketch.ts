// The day map's placeholder (pure, tested in __tests__/day-sketch.test.ts):
// the day's moves and stops drawn from the timeline the app already has,
// framed exactly as the web day map frames them (MapLibre fitBounds with
// DayMap.tsx's phone padding, Web Mercator, 512 px tiles), so the real map
// fades in over the same picture.

import type { LatLon, Mode, TimelineItem } from "./viewer";

export type SketchLine = { key: string; mode: Mode; added: boolean; points: { x: number; y: number }[] };
export type SketchStop = { key: string; x: number; y: number };
export type DaySketch = { lines: SketchLine[]; stops: SketchStop[] };

/** DayMap.tsx paddingFor() under 640 px, and its fitBounds limits. */
const PAD = { top: 40, right: 32, bottom: 32, left: 28 };
const MAX_ZOOM = 16;
const POINT_ZOOM = 14;
const TILE = 512;
const MAX_LAT = 85.051129;

/** Web Mercator, the world as a unit square (x right, y down). */
export function mercator(p: LatLon): { x: number; y: number } {
  const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, p.lat));
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: (p.lon + 180) / 360, y: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) };
}

/** mapStyle.ts fitPadding: never more than a third of either side. */
function padding(w: number, h: number) {
  const cap = (v: number, size: number) => Math.max(8, Math.min(v, Math.floor(size / 3)));
  return { top: cap(PAD.top, h), right: cap(PAD.right, w), bottom: cap(PAD.bottom, h), left: cap(PAD.left, w) };
}

/**
 * A projection from lat/lon to the w×h view that shows all of `points` the
 * way the web map's fit does; null without points or room.
 */
export function fitView(points: LatLon[], w: number, h: number): ((p: LatLon) => { x: number; y: number }) | null {
  if (!points.length || w <= 0 || h <= 0) return null;
  const m = points.map(mercator);
  const x0 = Math.min(...m.map((p) => p.x));
  const x1 = Math.max(...m.map((p) => p.x));
  const y0 = Math.min(...m.map((p) => p.y));
  const y1 = Math.max(...m.map((p) => p.y));
  let zoom: number;
  let cx = w / 2;
  let cy = h / 2;
  if (x0 === x1 && y0 === y1) zoom = POINT_ZOOM;
  else {
    const pad = padding(w, h);
    const sx = (w - pad.left - pad.right) / ((x1 - x0) * TILE);
    const sy = (h - pad.top - pad.bottom) / ((y1 - y0) * TILE);
    zoom = Math.min(MAX_ZOOM, Math.log2(Math.min(sx, sy)));
    cx += (pad.left - pad.right) / 2;
    cy += (pad.top - pad.bottom) / 2;
  }
  const size = TILE * 2 ** zoom;
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  return (p) => {
    const q = mercator(p);
    return { x: cx + (q.x - mx) * size, y: cy + (q.y - my) * size };
  };
}

/** The line a move is drawn with: its simplified path, else straight from start to end. */
function moveLine(m: Extract<TimelineItem, { kind: "move" }>["track"]): LatLon[] {
  if (m.path && m.path.length >= 2 && !m.added) return m.path;
  return m.from && m.to ? [m.from, m.to] : [];
}

/**
 * The day's moves (not lying still) and stops in view coordinates, or null
 * when there's nothing with a position to draw.
 */
export function daySketch(items: TimelineItem[], w: number, h: number): DaySketch | null {
  const lines: { key: string; mode: Mode; added: boolean; pts: LatLon[] }[] = [];
  const stops: { key: string; p: LatLon }[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (it.kind === "visit") {
      const v = it.visit;
      if (v.lat == null || v.lon == null) continue;
      // One mark per place, as on the map.
      const at = `${v.placeId}`;
      if (seen.has(at)) continue;
      seen.add(at);
      stops.push({ key: `v-${v.id}`, p: { lat: v.lat, lon: v.lon } });
    } else if (it.track.mode !== "stationary") {
      const pts = moveLine(it.track);
      if (pts.length >= 2) lines.push({ key: `m-${it.track.id}`, mode: it.track.mode, added: it.track.added === true, pts });
    }
  }
  const project = fitView([...lines.flatMap((l) => l.pts), ...stops.map((s) => s.p)], w, h);
  if (!project) return null;
  return {
    lines: lines.map((l) => ({ key: l.key, mode: l.mode, added: l.added, points: l.pts.map(project) })),
    stops: stops.map((s) => ({ key: s.key, ...project(s.p) })),
  };
}

/** An SVG path ("M x y L x y …") through view points, rounded to 0.1 px. */
export function svgPath(points: { x: number; y: number }[]): string {
  const r = (n: number) => Math.round(n * 10) / 10;
  return points.map((p, i) => `${i ? "L" : "M"}${r(p.x)} ${r(p.y)}`).join(" ");
}
