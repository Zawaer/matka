// A trip's routes as a small static drawing: the fallback cover of a trip
// card when Immich has no photo. Lines are projected with Web Mercator into a
// 16:9 box and drawn server-side as SVG, so a page of cards costs one query
// and no map tiles. Also the trip's overnight stays (for the stops on the
// card and the numbered markers on the trip page).

import type { User } from "../auth";
import { q } from "../db";
import { PLACE_NAME_SQL } from "../places";
import { displayModeJoin, displayModeSql } from "../transit/run";
import type { AwayTrip } from "./awayTrips";
import { isWater } from "../water";
import { dayBounds } from "./time";

/** The sketch's box: 16:9. */
export const SKETCH_W = 320;
export const SKETCH_H = 180;

export type SketchLine = { mode: string; points: [number, number][] };
export type Overnight = { placeId: number; name: string | null; lat: number; lon: number };

export type RouteSketch = {
  /** One SVG path ("M x y L …") per trip, in its mode. */
  paths: { mode: string; d: string }[];
  /** Where the nights were spent, in the same box. */
  stops: { x: number; y: number }[];
  /** The land under the box as one SVG path (rows of cells), when known. */
  land?: string;
  /** Box (x, y) → lon/lat, for drawing what lies under the routes. */
  unproject?: (x: number, y: number) => [number, number];
};

const mercY = (lat: number) => {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + r / 2)) * (180 / Math.PI);
};

/**
 * Projects lines (lon/lat) and stops into the 16:9 box, keeping the aspect
 * ratio and a margin, centred. Null when there is nothing to draw.
 */
export function projectSketch(
  lines: SketchLine[],
  stops: { lat: number; lon: number }[] = [],
  // Vertically the routes fit the band above the title scrim (top 9 %–55 %:
  // 16 px from the top, clear of the title block).
  { w = SKETCH_W, h = SKETCH_H, margin = 0.1, top = 0.09, bottom = 0.55 } = {},
): RouteSketch | null {
  const xy = (lon: number, lat: number): [number, number] => [lon, mercY(lat)];
  const all: [number, number][] = [
    ...lines.flatMap((l) => l.points.map(([lon, lat]) => xy(lon, lat))),
    ...stops.map((s) => xy(s.lon, s.lat)),
  ];
  if (all.length === 0 || lines.every((l) => l.points.length < 2)) return null;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of all) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  // A tiny extent (a walk around one block) still gets a sensible scale.
  const spanX = Math.max(x1 - x0, 0.01);
  const spanY = Math.max(y1 - y0, 0.01);
  const s = Math.min((w * (1 - 2 * margin)) / spanX, (h * (bottom - top)) / spanY);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const px = (lon: number, lat: number): [number, number] => {
    const [x, y] = xy(lon, lat);
    return [Math.round((w / 2 + (x - cx) * s) * 10) / 10, Math.round((h * ((top + bottom) / 2) - (y - cy) * s) * 10) / 10];
  };
  const midY = h * ((top + bottom) / 2);
  const unproject = (x: number, y: number): [number, number] => {
    const mx = (x - w / 2) / s + cx;
    const my = -(y - midY) / s + cy;
    const lat = (2 * Math.atan(Math.exp((my * Math.PI) / 180)) - Math.PI / 2) * (180 / Math.PI);
    return [mx, lat];
  };
  // A line shorter than 3 px is a GPS stub, not a route: it draws as a stray tick.
  const extent = (pts: [number, number][]) => {
    const p = pts.map(([lon, lat]) => px(lon, lat));
    const xs = p.map((q) => q[0]);
    const ys = p.map((q) => q[1]);
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  };
  return {
    unproject,
    paths: lines
      .filter((l) => l.points.length >= 2 && extent(l.points) >= 3)
      .map((l) => ({
        mode: l.mode,
        d: l.points.map(([lon, lat], i) => `${i ? "L" : "M"}${px(lon, lat).join(" ")}`).join(""),
      })),
    stops: stops.map((st) => {
      const [x, y] = px(st.lon, st.lat);
      return { x, y };
    }),
  };
}

/**
 * The land in a sketch's box as an SVG path: the box is sampled on a
 * `cols` × `rows` grid and each row's runs of land become one rectangle.
 * `isWater` answers true (water), false (land) or null (unknown, drawn as
 * land). Undefined when the box is all land: the backdrop is land already.
 */
/** Where each cell is sampled (fractions of the cell): centre and four quarters. */
const SAMPLES: [number, number][] = [
  [0.5, 0.5],
  [0.2, 0.2],
  [0.8, 0.2],
  [0.2, 0.8],
  [0.8, 0.8],
];

export function landPath(
  unproject: (x: number, y: number) => [number, number],
  isWater: (lat: number, lon: number) => boolean | null,
  { w = SKETCH_W, h = SKETCH_H, cols = 128, rows = 72 } = {},
): string | undefined {
  const cw = w / cols;
  const ch = h / rows;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  let d = "";
  let anyWater = false;
  for (let r = 0; r < rows; r++) {
    let start = -1;
    for (let c = 0; c <= cols; c++) {
      let land = false;
      if (c < cols) {
        // Water only where most of the cell is water: small lakes and
        // single-sample specks would read as noise at this size.
        let wet = 0;
        for (const [dx, dy] of SAMPLES) {
          const [lon, lat] = unproject((c + dx) * cw, (r + dy) * ch);
          if (isWater(lat, lon) === true) wet++;
        }
        const water = wet >= 4;
        if (water) anyWater = true;
        land = !water;
      }
      if (land && start < 0) start = c;
      if (!land && start >= 0) {
        // Rows overlap by a hair so no seams show between them.
        d += `M${r1(start * cw)} ${r1(r * ch)}h${r1((c - start) * cw)}v${r1(ch + 0.3)}h${r1(-(c - start) * cw)}z`;
        start = -1;
      }
    }
  }
  return anyWater ? d : undefined;
}

/** A trip's time window in epoch ms: leaving home to getting back (or the end of its last day). */
export const tripWindow = (t: Pick<AwayTrip, "departure" | "arrival" | "endDate">, tz: string): [number, number] => [
  t.departure,
  t.arrival ?? dayBounds(t.endDate, tz)[1],
];

/**
 * Overnight stays of each window, in order: places with a visit that runs
 * across a local midnight for at least three hours. One query for all windows.
 */
export async function loadOvernights(userId: string, windows: [number, number][], tz: string): Promise<Overnight[][]> {
  const out: Overnight[][] = windows.map(() => []);
  if (windows.length === 0) return out;
  const rows = await q<{ i: string; place_id: string; name: string | null; lat: number; lon: number }>(
    `WITH w AS (SELECT * FROM unnest($2::float8[], $3::float8[]) WITH ORDINALITY AS w(s, e, i))
     SELECT w.i, v.place_id, ${PLACE_NAME_SQL} AS name, ST_Y(p.geom::geometry) AS lat, ST_X(p.geom::geometry) AS lon,
            min(v.started_at) AS first
     FROM w
     JOIN visits v ON v.user_id = $1 AND v.ended_at > to_timestamp(w.s / 1000) AND v.started_at < to_timestamp(w.e / 1000)
     JOIN places p ON p.id = v.place_id
     WHERE (v.ended_at AT TIME ZONE $4)::date > (v.started_at AT TIME ZONE $4)::date
       AND v.ended_at - v.started_at >= interval '3 hours'
     GROUP BY w.i, v.place_id, p.id
     ORDER BY w.i, first`,
    [userId, windows.map((x) => x[0]), windows.map((x) => x[1]), tz],
  );
  for (const r of rows) {
    out[Number(r.i) - 1]?.push({ placeId: Number(r.place_id), name: r.name, lat: Number(r.lat), lon: Number(r.lon) });
  }
  return out;
}

/** Route sketches for these trips, keyed by trip id; trips with no lines are left out. */
export async function getRouteSketches(
  user: Pick<User, "id" | "timezone" | "transitLines">,
  trips: Pick<AwayTrip, "id" | "departure" | "arrival" | "endDate">[],
): Promise<Map<string, RouteSketch>> {
  const out = new Map<string, RouteSketch>();
  if (trips.length === 0) return out;
  const windows = trips.map((t) => tripWindow(t, user.timezone));
  const [rows, nights] = await Promise.all([
    q<{ i: string; mode: string; geom: string }>(
      // ~500 m simplification: plenty for a 320 px drawing of a trip.
      `WITH w AS (SELECT * FROM unnest($2::float8[], $3::float8[]) WITH ORDINALITY AS w(s, e, i))
       SELECT w.i, ${displayModeSql("$4")} AS mode,
              ST_AsGeoJSON(ST_Simplify(t.path::geometry, 0.005), 4) AS geom
       FROM w
       JOIN trips t ON t.user_id = $1 AND t.path IS NOT NULL
            AND t.ended_at >= to_timestamp(w.s / 1000) AND t.started_at <= to_timestamp(w.e / 1000)
       ${displayModeJoin("$4")}
       ORDER BY w.i, t.started_at`,
      [user.id, windows.map((x) => x[0]), windows.map((x) => x[1]), user.transitLines],
    ),
    loadOvernights(user.id, windows, user.timezone),
  ]);
  const lines: SketchLine[][] = trips.map(() => []);
  for (const r of rows) {
    const g = JSON.parse(r.geom) as GeoJSON.Geometry;
    const parts =
      g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
    for (const p of parts) lines[Number(r.i) - 1]?.push({ mode: r.mode, points: p as [number, number][] });
  }
  trips.forEach((t, i) => {
    const s = projectSketch(lines[i], nights[i]);
    if (!s) return;
    // Server components pass sketches to the page as plain data: drop the function.
    const { unproject, ...plain } = s;
    out.set(t.id, { ...plain, land: unproject ? landPath(unproject, isWater) : undefined });
  });
  return out;
}
