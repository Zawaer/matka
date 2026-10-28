// Read-only viewer client (docs/API.md → "Viewer (read-only)" and "Map in a
// WebView"). Same bearer token and transport as the collector (src/api.ts);
// responses are checked and normalised here so the screens can trust the
// shapes. Pure apart from fetch, so it is unit-tested with a mocked fetch.

import { authHeaders, request } from "./api";
import { sameOrigin } from "./embed-logic";
import type { Pairing } from "./pairing";
import type { PostResult } from "./upload-logic";

export type ViewerResult<T> =
  | { ok: true; data: T }
  | { ok: false; unauthorized: boolean; error: string };

export type Overview = {
  totals: {
    points: number;
    visits: number;
    trips: number;
    days: number;
    /** metres */
    distance: number;
    first: string | null;
    last: string | null;
  };
  /** last 12 months, oldest first; distance in metres */
  months: { year: number; month: number; distance: number }[];
  topPlaces: { id: number; name: string | null; hours: number }[];
  recent: { id: number; placeId: number; name: string | null; startedAt: string; duration: number | null }[];
};

export const MODES = [
  "walking",
  "running",
  "cycling",
  "driving",
  "bus",
  "tram",
  "metro",
  "train",
  "flying",
  "boat",
  "motorcycle",
  "stationary",
  "unknown",
] as const;
export type Mode = (typeof MODES)[number];

/** A name the user may pick for a place ("Visited X?"); category: OSM value, null for the address. */
export type PlaceCandidate = { name: string; category: string | null; address: boolean };

export type LatLon = { lat: number; lon: number };

export type Visit = {
  id: number;
  startedAt: string;
  endedAt: string;
  duration: number | null;
  placeId: number;
  placeName: string | null;
  category: string | null;
  /** Saved kind (home, work…), or null. */
  placeKind?: SavedKind | null;
  /** OSM key of the place's geocoded feature (shop, amenity…), for its icon. */
  osmKey?: string | null;
  lat: number | null;
  lon: number | null;
  /** Set when the name is a guess among several ("Visited X?"): the names to pick from. */
  candidates?: PlaceCandidate[] | null;
};

export const LEG_KINDS = ["bus", "tram", "metro", "train", "boat"] as const;
export type LegKind = (typeof LEG_KINDS)[number];

/** One ride on a public transport line within a move (server: lib/transit). */
export type Leg = {
  kind: LegKind;
  /** Best match first; several on a shared corridor. */
  lines: string[];
  fromStop: string | null;
  toStop: string | null;
  /** ISO instants of the ride; null from an older server. */
  startedAt: string | null;
  endedAt: string | null;
};

/** A transfer the server folded into a move ("Waited at Kamppi"). */
export type Wait = { startedAt: string; endedAt: string; stop: string | null };

export type Move = {
  id: number;
  startedAt: string;
  endedAt: string;
  distance: number | null;
  duration: number | null;
  mode: Mode;
  legs: Leg[];
  waits: Wait[];
  /** Set when the user fixed this trip ("edited"): the correction to undo. */
  correctionId?: number | null;
  /** A trip the user added where nothing was recorded ("Add travel"). */
  added?: boolean;
  /** Where the move started and ended, when known. */
  from?: LatLon | null;
  to?: LatLon | null;
  /** The move's line, simplified to a few dozen points (for the day map's sketch); null from an older server. */
  path?: LatLon[] | null;
};

export type TimelineItem = { kind: "visit"; visit: Visit } | { kind: "move"; track: Move };

export type Timeline = {
  day: { date: string; items: TimelineItem[] };
  dates: string[];
  minDate: string | null;
  maxDate: string | null;
};

/** What the user saved a place as on the web (Places page); null = not saved. */
export const SAVED_KINDS = ["home", "family", "school", "work", "other"] as const;
export type SavedKind = (typeof SAVED_KINDS)[number];
export const asSavedKind = (v: unknown): SavedKind | null =>
  (SAVED_KINDS as readonly unknown[]).includes(v) ? (v as SavedKind) : null;

export type Place = {
  id: number;
  name: string | null;
  city: string | null;
  country: string | null;
  category: string | null;
  visitCount: number;
  totalTime: number;
  lastVisit: string | null;
  kind: SavedKind | null;
};

// ---- parsing ---------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const objs = (v: unknown): Obj[] => arr(v).filter(isObj);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** An ISO instant that parses, else null. */
const instant = (v: unknown): string | null => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null);

export function parseOverview(body: unknown): Overview | null {
  if (!isObj(body) || !isObj(body.totals)) return null;
  const t = body.totals;
  return {
    totals: {
      points: num(t.points),
      visits: num(t.visits),
      trips: num(t.trips),
      days: num(t.days),
      distance: num(t.distance),
      first: str(t.first),
      last: str(t.last),
    },
    months: objs(body.months)
      .filter((m) => typeof m.year === "number" && typeof m.month === "number")
      .map((m) => ({ year: num(m.year), month: num(m.month), distance: num(m.distance) })),
    topPlaces: objs(body.topPlaces)
      .filter((p) => typeof p.id === "number")
      .map((p) => ({ id: num(p.id), name: str(p.name), hours: num(p.hours) })),
    recent: objs(body.recent)
      .filter((r) => typeof r.id === "number" && typeof r.startedAt === "string")
      .map((r) => ({
        id: num(r.id),
        placeId: num(r.placeId),
        name: str(r.name),
        startedAt: r.startedAt as string,
        duration: numOrNull(r.duration),
      })),
  };
}

function parseLegs(raw: unknown): Leg[] {
  return objs(raw).flatMap((l) => {
    const lines = arr(l.lines).filter((x): x is string => typeof x === "string" && x.length > 0);
    if (!(LEG_KINDS as readonly string[]).includes(l.kind as string) || lines.length === 0) return [];
    return [
      {
        kind: l.kind as LegKind,
        lines,
        fromStop: str(l.fromStop),
        toStop: str(l.toStop),
        startedAt: instant(l.startedAt),
        endedAt: instant(l.endedAt),
      },
    ];
  });
}

function parseWaits(raw: unknown): Wait[] {
  return objs(raw).flatMap((w) => {
    const startedAt = instant(w.startedAt);
    const endedAt = instant(w.endedAt);
    return startedAt && endedAt ? [{ startedAt, endedAt, stop: str(w.stop) || null }] : [];
  });
}

const latLon = (v: unknown): LatLon | null =>
  isObj(v) && typeof v.lat === "number" && typeof v.lon === "number" && Number.isFinite(v.lat) && Number.isFinite(v.lon)
    ? { lat: v.lat, lon: v.lon }
    : null;

/** The server's simplified `path` ([lon, lat] pairs), when it has two or more good points. */
function parsePath(v: unknown): LatLon[] | null {
  if (!Array.isArray(v)) return null;
  const out: LatLon[] = [];
  for (const p of v) {
    if (!Array.isArray(p) || typeof p[0] !== "number" || typeof p[1] !== "number") continue;
    const [lon, lat] = p as [number, number];
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) out.push({ lat, lon });
  }
  return out.length >= 2 ? out : null;
}

function parseCandidates(raw: unknown): PlaceCandidate[] | null {
  if (!Array.isArray(raw)) return null;
  const out = objs(raw).flatMap((c) =>
    typeof c.name === "string" && c.name ? [{ name: c.name, category: str(c.category), address: c.address === true }] : [],
  );
  return out.length ? out : null;
}

function parseItem(it: Obj): TimelineItem | null {
  if (it.kind === "visit" && isObj(it.visit)) {
    const v = it.visit;
    if (typeof v.id !== "number" || typeof v.startedAt !== "string" || typeof v.endedAt !== "string") return null;
    return {
      kind: "visit",
      visit: {
        id: v.id,
        startedAt: v.startedAt,
        endedAt: v.endedAt,
        duration: numOrNull(v.duration),
        placeId: num(v.placeId),
        placeName: str(v.placeName),
        category: str(v.category),
        placeKind: asSavedKind(v.placeKind),
        osmKey: str(v.osmKey),
        lat: numOrNull(v.lat),
        lon: numOrNull(v.lon),
        candidates: parseCandidates(v.candidates),
      },
    };
  }
  if (it.kind === "move" && isObj(it.track)) {
    const t = it.track;
    if (typeof t.id !== "number" || typeof t.startedAt !== "string" || typeof t.endedAt !== "string") return null;
    const mode = (MODES as readonly string[]).includes(t.mode as string) ? (t.mode as Mode) : "unknown";
    return {
      kind: "move",
      track: {
        id: t.id,
        startedAt: t.startedAt,
        endedAt: t.endedAt,
        distance: numOrNull(t.distance),
        duration: numOrNull(t.duration),
        mode,
        legs: parseLegs(t.legs),
        waits: parseWaits(t.waits),
        correctionId: typeof t.correctionId === "number" && Number.isSafeInteger(t.correctionId) ? t.correctionId : null,
        added: t.added === true,
        from: latLon(t.from),
        to: latLon(t.to),
        path: parsePath(t.path),
      },
    };
  }
  return null; // unknown kinds from a newer server are skipped
}

export function parseTimeline(body: unknown): Timeline | null {
  if (!isObj(body) || !isObj(body.day)) return null;
  const items = objs(body.day.items)
    .map(parseItem)
    .filter((x): x is TimelineItem => x !== null);
  const dates = arr(body.dates).filter((d): d is string => typeof d === "string" && DATE_RE.test(d));
  return {
    day: { date: str(body.day.date) ?? "", items },
    dates,
    minDate: str(body.minDate),
    maxDate: str(body.maxDate),
  };
}

export function parsePlaces(body: unknown): Place[] | null {
  if (!isObj(body) || !Array.isArray(body.places)) return null;
  return objs(body.places)
    .filter((p) => typeof p.id === "number")
    .map((p) => ({
      id: num(p.id),
      name: str(p.name),
      city: str(p.city),
      country: str(p.country),
      category: str(p.category),
      visitCount: num(p.visitCount),
      totalTime: num(p.totalTime),
      lastVisit: str(p.lastVisit),
      kind: asSavedKind(p.kind),
    }));
}

// ---- requests --------------------------------------------------------------

/** Turns a transport result into a ViewerResult, applying the 401 rule. */
export function toResult<T>(r: PostResult, parse: (body: unknown) => T | null): ViewerResult<T> {
  if (r.status === 401) {
    return { ok: false, unauthorized: true, error: "The server rejected this device's token (401)." };
  }
  if (r.status == null) return { ok: false, unauthorized: false, error: `Can't reach the server: ${r.error}.` };
  if (r.status !== 200) {
    const msg = isObj(r.body) && typeof r.body.error === "string" ? `: ${r.body.error}` : "";
    return { ok: false, unauthorized: false, error: `Server answered ${r.status}${msg}.` };
  }
  const data = parse(r.body);
  if (data == null) {
    return { ok: false, unauthorized: false, error: "The server's answer doesn't look like Matka data." };
  }
  return { ok: true, data };
}

const get = (p: Pairing, path: string) =>
  request(`${p.server}${path}`, { method: "GET", headers: authHeaders(p.token) });

export async function getOverview(p: Pairing): Promise<ViewerResult<Overview>> {
  return toResult(await get(p, "/api/overview"), parseOverview);
}

/** `date` is YYYY-MM-DD in the account's time zone; omitted = latest day with data. */
export async function getTimeline(p: Pairing, date?: string | null): Promise<ViewerResult<Timeline>> {
  if (date != null && !DATE_RE.test(date)) {
    return { ok: false, unauthorized: false, error: `Invalid date ${date}.` };
  }
  return toResult(await get(p, date ? `/api/timeline?date=${date}` : "/api/timeline"), parseTimeline);
}

export async function getPlaces(p: Pairing): Promise<ViewerResult<Place[]>> {
  return toResult(await get(p, "/api/places"), parsePlaces);
}

/**
 * `POST /api/device/embed-ticket` → a one-minute URL that logs the map
 * WebView in with a cookie. The URL must be on the paired server's origin:
 * the WebView is locked to that origin, and the ticket must not go elsewhere.
 */
export async function getEmbedTicket(p: Pairing): Promise<ViewerResult<string>> {
  const r = await request(`${p.server}/api/device/embed-ticket`, {
    method: "POST",
    headers: authHeaders(p.token),
  });
  const res = toResult(r, (b) => (isObj(b) && typeof b.url === "string" ? b.url : null));
  if (res.ok && !sameOrigin(res.data, p.server)) {
    return {
      ok: false,
      unauthorized: false,
      error:
        "The server returned a map link on a different address than the one this phone is paired with. " +
        "Check the server's public URL setting, or pair using that address.",
    };
  }
  return res;
}

// ---- trip corrections ("Fix this trip", docs/API.md) -----------------------

/** A public transport line, from the server's GTFS routes. */
export type Route = { line: string; kind: LegKind; name: string | null };

export function parseRoutes(body: unknown): Route[] | null {
  if (!isObj(body) || !Array.isArray(body.routes)) return null;
  return objs(body.routes).flatMap((r) =>
    typeof r.line === "string" && r.line && (LEG_KINDS as readonly unknown[]).includes(r.kind)
      ? [{ line: r.line, kind: r.kind as LegKind, name: str(r.name) }]
      : [],
  );
}

/** `GET /api/transit/routes?q=`: lines matching "159", "M1"... */
export async function searchRoutes(p: Pairing, q: string): Promise<ViewerResult<Route[]>> {
  return toResult(await get(p, `/api/transit/routes?q=${encodeURIComponent(q)}`), parseRoutes);
}

/** `GET /api/transit/stops?q=`: stop names starting with q (for "changed at"). */
export async function searchStops(p: Pairing, q: string): Promise<ViewerResult<string[]>> {
  return toResult(await get(p, `/api/transit/stops?q=${encodeURIComponent(q)}`), (b) =>
    isObj(b) && Array.isArray(b.stops) ? b.stops.filter((x): x is string => typeof x === "string") : null,
  );
}

export type CorrectionBody = {
  startedAt: string;
  endedAt: string;
  mode: Mode;
  legs: { kind: LegKind; line: string; transferStop: string | null }[];
  /** "Add travel": a trip where none was recorded, between these points. */
  added?: true;
  from?: LatLon;
  to?: LatLon;
};

/** `POST /api/corrections`: show this trip as `mode`, with these rides. Answers the correction id. */
export async function postCorrection(p: Pairing, body: CorrectionBody): Promise<ViewerResult<number>> {
  const r = await request(`${p.server}/api/corrections`, {
    method: "POST",
    headers: { ...authHeaders(p.token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return toResult(r, (b) => (isObj(b) && isObj(b.correction) && typeof b.correction.id === "number" ? b.correction.id : null));
}

/** `DELETE /api/corrections/:id`: undo a fix. */
export async function deleteCorrection(p: Pairing, id: number): Promise<ViewerResult<true>> {
  const r = await request(`${p.server}/api/corrections/${id}`, { method: "DELETE", headers: authHeaders(p.token) });
  return toResult(r, () => true as const);
}

// ---- "Visited X?" (docs/API.md) ---------------------------------------------

/** `POST /api/places/:id/confirm`: yes to the shown name, or a name to use (picked or typed). */
export async function postPlaceChoice(
  p: Pairing,
  placeId: number,
  choice: { confirm: true } | { name: string; category?: string | null },
): Promise<ViewerResult<true>> {
  const r = await request(`${p.server}/api/places/${placeId}/confirm`, {
    method: "POST",
    headers: { ...authHeaders(p.token), "Content-Type": "application/json" },
    body: JSON.stringify(choice),
  });
  return toResult(r, () => true as const);
}

// ---- photos of a day (docs/API.md) -----------------------------------------

/** One visit's or trip's photos: key as selectionKey ("v-<id>", "m-<id>"), ids oldest first. */
export type ItemPhotos = { key: string; ids: string[]; total: number };
export type DayPhotos = {
  configured: boolean;
  /** Still being looked up on the server: ask again in a few seconds. */
  pending: boolean;
  /** Immich's web address for "Open in Immich", or null. */
  linkBase: string | null;
  items: ItemPhotos[];
};

export function parseDayPhotos(body: unknown): DayPhotos | null {
  if (!isObj(body)) return null;
  const linkBase = str(body.linkBase);
  return {
    configured: body.configured === true,
    pending: body.pending === true,
    linkBase: linkBase && /^https?:\/\//.test(linkBase) ? linkBase.replace(/\/+$/, "") : null,
    items: objs(body.items).flatMap((it) => {
      const ids = arr(it.ids).filter((x): x is string => typeof x === "string" && x.length > 0);
      return typeof it.key === "string" && ids.length ? [{ key: it.key, ids, total: Math.max(ids.length, num(it.total)) }] : [];
    }),
  };
}

/** `GET /api/timeline/photos?date=`: the Immich photos taken during each visit and trip of a day. */
export async function getDayPhotos(p: Pairing, date: string): Promise<ViewerResult<DayPhotos>> {
  if (!DATE_RE.test(date)) return { ok: false, unauthorized: false, error: `Invalid date ${date}.` };
  return toResult(await get(p, `/api/timeline/photos?date=${date}`), parseDayPhotos);
}

/** A photo in Immich's own web UI. */
export const immichPhotoUrl = (linkBase: string, id: string) => `${linkBase}/photos/${encodeURIComponent(id)}`;
