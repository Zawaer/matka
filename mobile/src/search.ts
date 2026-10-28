// Place search (docs/API.md → GET /api/search): the client, its response
// parsing and the result formatting. Pure apart from fetch, so it is unit-tested
// with a mocked fetch like viewer.ts.

import { authHeaders, request } from "./api";
import { fmtLongDuration, group } from "./format";
import type { Pairing } from "./pairing";
import { asSavedKind, toResult, type SavedKind, type ViewerResult } from "./viewer";

export type SearchPlace = {
  id: number;
  name: string | null;
  kind: SavedKind | null;
  category: string | null;
  city: string | null;
  country: string | null;
  visitCount: number;
  /** Seconds. */
  totalTime: number;
  firstVisit: string | null;
  lastVisit: string | null;
  /** Local date (YYYY-MM-DD) of the latest visit. */
  lastVisitDate: string | null;
  /** Local dates with a visit, newest first (at most 5). */
  recentDates: string[];
  match: string;
};

export type SearchArea = {
  type: "city" | "country";
  name: string;
  country: string | null;
  places: number;
  visits: number;
  duration: number;
  lastVisit: string | null;
};

export type SearchResults = { query: string; places: SearchPlace[]; areas: SearchArea[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const objs = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const date = (v: unknown): string | null => (typeof v === "string" && DATE_RE.test(v) ? v : null);

export function parseSearch(body: unknown): SearchResults | null {
  if (!isObj(body) || !Array.isArray(body.places)) return null;
  return {
    query: str(body.query) ?? "",
    places: objs(body.places)
      .filter((p) => typeof p.id === "number")
      .map((p) => ({
        id: num(p.id),
        name: str(p.name),
        kind: asSavedKind(p.kind),
        category: str(p.category),
        city: str(p.city),
        country: str(p.country),
        visitCount: num(p.visitCount),
        totalTime: num(p.totalTime),
        firstVisit: str(p.firstVisit),
        lastVisit: str(p.lastVisit),
        lastVisitDate: date(p.lastVisitDate),
        recentDates: (Array.isArray(p.recentDates) ? p.recentDates : []).map(date).filter((d): d is string => d != null),
        match: str(p.match) ?? "name",
      })),
    areas: objs(body.areas)
      .filter((a) => (a.type === "city" || a.type === "country") && typeof a.name === "string")
      .map((a) => ({
        type: a.type as "city" | "country",
        name: a.name as string,
        country: str(a.country),
        places: num(a.places),
        visits: num(a.visits),
        duration: num(a.duration),
        lastVisit: str(a.lastVisit),
      })),
  };
}

export async function searchPlaces(p: Pairing, query: string): Promise<ViewerResult<SearchResults>> {
  const r = await request(`${p.server}/api/search?q=${encodeURIComponent(query.trim())}`, {
    method: "GET",
    headers: authHeaders(p.token),
  });
  // A server from before search answers 404: say so rather than "Server answered 404".
  if (r.status === 404) {
    return { ok: false, unauthorized: false, error: "This server doesn't support search yet. Update Matka on the server." };
  }
  return toResult(r, parseSearch);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-18" → "18 Oct", with the year when it isn't this year or `withYear` ("18 Oct 2025"). */
export function fmtDate(d: string, withYear = false, now = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return d;
  const base = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
  return withYear || Number(m[1]) !== now.getFullYear() ? `${base} ${m[1]}` : base;
}

/** Time spent somewhere: the app-wide total-of-time rule ("45 min", "9 h 10 min", "3 d 4 h", "46 d"). */
export const fmtTimeSpent = (seconds: number) => fmtLongDuration(seconds);

/** "12 visits · last 18 Oct" (the year only when it isn't this one), or "No visits yet". */
export function visitLine(p: Pick<SearchPlace, "lastVisitDate" | "visitCount" | "totalTime">, now = new Date()): string {
  if (!p.lastVisitDate || p.visitCount === 0) return "No visits yet";
  return `${group(p.visitCount)} ${p.visitCount === 1 ? "visit" : "visits"} · last ${fmtDate(p.lastVisitDate, false, now)}`;
}
