// What the timeline's day map draws, kept out of the component so it can be
// tested without MapLibre: numbered stops, the day's route lines, and the
// tracks request window.

import { placeTitle } from "@/components/places/category";
import { type PlaceIconGroup, placeIconGroup } from "@/lib/placeIcons";
import type { TimelineDay, TimelineItem } from "@/lib/types";

type FC = GeoJSON.FeatureCollection;

/** The id a row and its map feature share: "v-<visit id>" or "m-<trip id>". */
export function selectionKey(item: TimelineItem): string {
  return item.kind === "visit" ? `v-${item.visit.id}` : `m-${item.track.id}`;
}

/** One marker: a place, with every visit to it that day, numbered in timeline order. */
export type Stop = {
  placeId: number;
  lat: number;
  lon: number;
  name: string;
  /** 1-based visit numbers (moves aren't counted). */
  numbers: number[];
  /** selectionKey of each visit, same order as `numbers`. */
  keys: string[];
  /** Category icon (lib/placeIcons.ts). */
  icon: PlaceIconGroup;
};

/**
 * The day's stops, one per place: going home twice is one marker labelled
 * "1·7", not two markers on top of each other.
 */
export function dayStops(items: TimelineItem[]): Stop[] {
  const byPlace = new Map<number, Stop>();
  let n = 0;
  for (const it of items) {
    if (it.kind !== "visit") continue;
    n++;
    const v = it.visit;
    if (!Number.isFinite(v.lat) || !Number.isFinite(v.lon)) continue;
    const s = byPlace.get(v.placeId);
    if (s) {
      s.numbers.push(n);
      s.keys.push(selectionKey(it));
    } else {
      byPlace.set(v.placeId, {
        placeId: v.placeId,
        lat: v.lat,
        lon: v.lon,
        name: placeTitle(v.placeName, v.category),
        numbers: [n],
        keys: [selectionKey(it)],
        icon: placeIconGroup(v.placeKind, v.category, v.osmKey),
      });
    }
  }
  return [...byPlace.values()];
}

/** "3", "1·7", or "1·4…" for a place visited more than twice. */
export function stopLabel(numbers: number[]): string {
  if (numbers.length <= 2) return numbers.join("·");
  return `${numbers[0]}·${numbers[1]}…`;
}

/**
 * The label of several stops drawn as one marker (they are too close to
 * tell apart at this zoom): "1–4" for a run, "2·5" for two, "1–3·7" otherwise.
 */
export function clusterLabel(numbers: number[]): string {
  const ns = [...new Set(numbers)].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < ns.length; ) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    runs.push(j > i ? `${ns[i]}–${ns[j]}` : String(ns[i]));
    i = j + 1;
  }
  const label = runs.join("·");
  return label.length > 7 ? `${ns[0]}–${ns.at(-1)}` : label;
}

/** Whether there is anything to draw: a stop, or a trip that went somewhere. */
export function dayHasMap(items: TimelineItem[]): boolean {
  return items.some((it) =>
    it.kind === "visit"
      ? Number.isFinite(it.visit.lat) && Number.isFinite(it.visit.lon)
      : it.track.mode !== "stationary",
  );
}

/** The local day as epoch seconds for /api/tracks/geojson?from&to, or null. */
export function dayWindow(day: Pick<TimelineDay, "start" | "end">): { from: number; to: number } | null {
  if (!day.start || !day.end) return null;
  const from = Math.floor(new Date(day.start).getTime() / 1000);
  const to = Math.floor(new Date(day.end).getTime() / 1000);
  return Number.isFinite(from) && Number.isFinite(to) && to > from ? { from, to } : null;
}

/**
 * The trip lines the timeline lists, each carrying the timeline's mode (so a
 * line has the colour of its row) and its selection key. Stationary
 * "moves" are GPS jitter around a stop and would only scribble over it.
 */
export function dayTracks(fc: FC | null, items: TimelineItem[]): FC {
  const modes = new Map<number, string>();
  for (const it of items) if (it.kind === "move") modes.set(it.track.id, it.track.mode);
  const features: GeoJSON.Feature[] = (fc?.features ?? []).flatMap((f): GeoJSON.Feature[] => {
    const id = Number(f.properties?.id);
    const mode = modes.get(id);
    if (mode == null || mode === "stationary" || !f.geometry) return [];
    return [{ ...f, properties: { ...f.properties, id, mode, key: `m-${id}` } }];
  });
  // Trips the user added: a straight line between where they were (drawn dashed).
  for (const it of items) {
    if (it.kind !== "move" || !it.track.added || !it.track.from || !it.track.to) continue;
    const { id, mode, from, to } = it.track;
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[from.lon, from.lat], [to.lon, to.lat]] },
      properties: { id, mode, key: `m-${id}`, added: true },
    });
  }
  return { type: "FeatureCollection", features };
}

/**
 * Groups screen points (photo markers) that would overlap: greedy, in the
 * given order, each joining the first group whose first point is within
 * `cell` pixels on both axes. Returns the members' indexes per group.
 */
export function clusterPoints(points: { x: number; y: number }[], cell: number): number[][] {
  const groups: { x: number; y: number; members: number[] }[] = [];
  points.forEach((p, i) => {
    const g = groups.find((g) => Math.abs(g.x - p.x) < cell && Math.abs(g.y - p.y) < cell);
    if (g) g.members.push(i);
    else groups.push({ x: p.x, y: p.y, members: [i] });
  });
  return groups.map((g) => g.members);
}

/** Bounding box [w, s, e, n] of some lines and points, or null when empty. */
export function bboxOf(fc: FC, points: { lat: number; lon: number }[] = []): [number, number, number, number] | null {
  let b: [number, number, number, number] | null = null;
  const add = (lon: number, lat: number) => {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    b = b
      ? [Math.min(b[0], lon), Math.min(b[1], lat), Math.max(b[2], lon), Math.max(b[3], lat)]
      : [lon, lat, lon, lat];
  };
  const walk = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number" && typeof c[1] === "number") add(c[0], c[1]);
    else for (const x of c) walk(x);
  };
  for (const f of fc.features) walk((f.geometry as { coordinates?: unknown } | null)?.coordinates);
  for (const p of points) add(p.lon, p.lat);
  return b;
}

/**
 * Which visit a tap on a stop selects: the first, or the next one after the
 * current selection, so tapping home again steps from "1" to "7".
 */
export function nextStopKey(stop: Stop, selected: string | null): string {
  const i = selected ? stop.keys.indexOf(selected) : -1;
  return stop.keys[(i + 1) % stop.keys.length];
}
