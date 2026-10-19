// Insights client (docs/API.md → "Viewer (read-only)": /api/insights/*). Same
// bearer token, transport and 401 rule as src/viewer.ts; responses are checked
// and normalised here so the screens can trust the shapes. Pure apart from
// fetch, so it is unit-tested with a mocked fetch.

import { authHeaders, request } from "./api";
import type { Pairing } from "./pairing";
import { MODES, parsePlaces, toResult, type Mode, type Place, type ViewerResult } from "./viewer";

export type ModeTotal = { mode: Mode; distance: number; duration: number; count: number };
export type MonthPoint = { month: string; distance: number; duration: number };

export type MonthModes = {
  month: string;
  /** metres */
  distance: number;
  /** seconds */
  duration: number;
  /** Every mode used in the six months ending at `month`, zeros included, in a fixed order. */
  modes: (ModeTotal & { history: MonthPoint[] })[];
  historyMonths: string[];
  firstMonth: string | null;
  lastMonth: string | null;
};

export const SAVED_KINDS = ["home", "family", "school", "work", "other"] as const;
export type SavedKind = (typeof SAVED_KINDS)[number];

export type SavedRow = { placeId: number; name: string | null; kind: SavedKind; seconds: number; nights: number };
export type SavedMonth = { month: string; saved: number; rows: SavedRow[] };

export type TripCity = { city: string; country: string | null; duration: number; firstSeen: string | null; away: boolean };
export type TripDay = { date: string; distance: number; duration: number; modes: ModeTotal[]; cities: string[] };

export type Trip = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  days: number;
  nights: number;
  departure: string | null;
  /** null while still away */
  arrival: string | null;
  cities: TripCity[];
  countries: string[];
  distance: number;
  duration: number;
  modes: ModeTotal[];
  /** Immich asset id of the cover photo. */
  cover: string | null;
};

export type TripDetail = Trip & { dayList: TripDay[]; photos: string[] };

export type Home = { nights: number; city: string | null; country: string | null; saved: string[] };
export type Trips = { home: Home | null; trips: Trip[] };

export const WORLD_SORTS = ["visits", "places", "time", "recent", "name"] as const;
export type WorldSort = (typeof WORLD_SORTS)[number];

export type WorldEntry = {
  name: string;
  country: string | null;
  places: number;
  visits: number;
  duration: number;
  lastVisit: string | null;
  /** countries only */
  cities: number | null;
};
export type World = { countries: WorldEntry[]; cities: WorldEntry[]; unplaced: number };
export type CityPlaces = { city: string; country: string | null; places: Place[] };

// ---- parsing ---------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const objs = (v: unknown): Obj[] => arr(v).filter(isObj);
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string" && x.length > 0);

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ASSET_RE = /^[0-9a-fA-F-]{36}$/;
const isMonth = (v: unknown): v is string => typeof v === "string" && MONTH_RE.test(v);
const isDate = (v: unknown): v is string => typeof v === "string" && DATE_RE.test(v);
const assetId = (v: unknown): string | null => (typeof v === "string" && ASSET_RE.test(v) ? v : null);

const asMode = (v: unknown): Mode => ((MODES as readonly string[]).includes(v as string) ? (v as Mode) : "unknown");

function parseModeTotals(v: unknown): ModeTotal[] {
  return objs(v).map((m) => ({ mode: asMode(m.mode), distance: num(m.distance), duration: num(m.duration), count: num(m.count) }));
}

export function parseMonthModes(body: unknown): MonthModes | null {
  if (!isObj(body) || !isMonth(body.month)) return null;
  return {
    month: body.month,
    distance: num(body.distance),
    duration: num(body.duration),
    modes: objs(body.modes).map((m) => ({
      mode: asMode(m.mode),
      distance: num(m.distance),
      duration: num(m.duration),
      count: num(m.count),
      history: objs(m.history)
        .filter((h) => isMonth(h.month))
        .map((h) => ({ month: h.month as string, distance: num(h.distance), duration: num(h.duration) })),
    })),
    historyMonths: arr(body.historyMonths).filter(isMonth),
    firstMonth: isMonth(body.firstMonth) ? body.firstMonth : null,
    lastMonth: isMonth(body.lastMonth) ? body.lastMonth : null,
  };
}

export function parseSavedMonth(body: unknown): SavedMonth | null {
  if (!isObj(body) || !isMonth(body.month)) return null;
  return {
    month: body.month,
    saved: num(body.saved),
    rows: objs(body.rows)
      .filter((r) => typeof r.placeId === "number")
      .map((r) => ({
        placeId: num(r.placeId),
        name: str(r.name),
        kind: (SAVED_KINDS as readonly string[]).includes(r.kind as string) ? (r.kind as SavedKind) : "other",
        seconds: num(r.seconds),
        nights: num(r.nights),
      })),
  };
}

function parseTrip(t: Obj): Trip | null {
  if (typeof t.id !== "string" || !isDate(t.startDate) || !isDate(t.endDate)) return null;
  return {
    id: t.id,
    name: str(t.name) || "Trip",
    startDate: t.startDate,
    endDate: t.endDate,
    days: num(t.days),
    nights: num(t.nights),
    departure: str(t.departure),
    arrival: str(t.arrival),
    cities: objs(t.cities)
      .filter((c) => typeof c.city === "string")
      .map((c) => ({
        city: c.city as string,
        country: str(c.country),
        duration: num(c.duration),
        firstSeen: str(c.firstSeen),
        away: c.away === true,
      })),
    countries: strs(t.countries),
    distance: num(t.distance),
    duration: num(t.duration),
    modes: parseModeTotals(t.modes),
    cover: assetId(t.cover),
  };
}

export function parseTrips(body: unknown): Trips | null {
  if (!isObj(body) || !Array.isArray(body.trips)) return null;
  const h = body.home;
  return {
    home: isObj(h) ? { nights: num(h.nights), city: str(h.city), country: str(h.country), saved: strs(h.saved) } : null,
    trips: objs(body.trips)
      .map(parseTrip)
      .filter((t): t is Trip => t !== null),
  };
}

export function parseTripDetail(body: unknown): TripDetail | null {
  if (!isObj(body) || !isObj(body.trip)) return null;
  const base = parseTrip(body.trip);
  if (!base) return null;
  return {
    ...base,
    dayList: objs(body.trip.dayList)
      .filter((d) => isDate(d.date))
      .map((d) => ({
        date: d.date as string,
        distance: num(d.distance),
        duration: num(d.duration),
        modes: parseModeTotals(d.modes),
        cities: strs(d.cities),
      })),
    photos: arr(body.trip.photos)
      .map(assetId)
      .filter((x): x is string => x !== null),
  };
}

function parseEntry(e: Obj): WorldEntry | null {
  if (typeof e.name !== "string" || !e.name) return null;
  return {
    name: e.name,
    country: str(e.country),
    places: num(e.places),
    visits: num(e.visits),
    duration: num(e.duration),
    lastVisit: str(e.lastVisit),
    cities: typeof e.cities === "number" ? e.cities : null,
  };
}

export function parseWorld(body: unknown): World | null {
  if (!isObj(body) || !Array.isArray(body.countries) || !Array.isArray(body.cities)) return null;
  const entries = (v: unknown) =>
    objs(v)
      .map(parseEntry)
      .filter((e): e is WorldEntry => e !== null);
  return { countries: entries(body.countries), cities: entries(body.cities), unplaced: num(body.unplaced) };
}

export function parseCity(body: unknown): CityPlaces | null {
  if (!isObj(body) || typeof body.city !== "string") return null;
  const places = parsePlaces(body);
  return places ? { city: body.city, country: str(body.country), places } : null;
}

// ---- requests --------------------------------------------------------------

const get = (p: Pairing, path: string) =>
  request(`${p.server}${path}`, { method: "GET", headers: authHeaders(p.token) });

const bad = (error: string) => ({ ok: false as const, unauthorized: false, error });

/** `month` YYYY-MM; omitted = the latest month with travel. */
export async function getMonthModes(p: Pairing, month?: string | null): Promise<ViewerResult<MonthModes>> {
  if (month != null && !MONTH_RE.test(month)) return bad(`Invalid month ${month}.`);
  return toResult(await get(p, month ? `/api/insights/modes?month=${month}` : "/api/insights/modes"), parseMonthModes);
}

export async function getSavedMonth(p: Pairing, month: string): Promise<ViewerResult<SavedMonth>> {
  if (!MONTH_RE.test(month)) return bad(`Invalid month ${month}.`);
  return toResult(await get(p, `/api/insights/saved?month=${month}`), parseSavedMonth);
}

export async function getTrips(p: Pairing): Promise<ViewerResult<Trips>> {
  return toResult(await get(p, "/api/insights/trips"), parseTrips);
}

export async function getTrip(p: Pairing, id: string): Promise<ViewerResult<TripDetail>> {
  if (!DATE_RE.test(id)) return bad(`Invalid trip ${id}.`);
  return toResult(await get(p, `/api/insights/trips/${id}`), parseTripDetail);
}

export async function getWorld(p: Pairing, sort: WorldSort = "visits"): Promise<ViewerResult<World>> {
  return toResult(await get(p, `/api/insights/world?sort=${sort}`), parseWorld);
}

export async function getCity(p: Pairing, city: string, country: string | null): Promise<ViewerResult<CityPlaces>> {
  const qs = `city=${encodeURIComponent(city)}${country ? `&country=${encodeURIComponent(country)}` : ""}`;
  return toResult(await get(p, `/api/insights/world?${qs}`), parseCity);
}

/**
 * An `<Image source>` for an Immich photo through the server's proxy. React
 * Native's Image sends `headers` with the request (ImageURISource.headers), so
 * the token stays out of the URL.
 */
export function assetSource(p: Pairing, id: string, size: "thumbnail" | "preview" = "preview") {
  return {
    uri: `${p.server}/api/immich/asset/${encodeURIComponent(id)}?size=${size}`,
    headers: { Authorization: `Bearer ${p.token}` },
  };
}
