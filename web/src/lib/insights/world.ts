// Cities and countries, from places.city/country (filled by the geocoder).
// Pure: takes the Places list (lib/places.ts getPlaces) and groups it.

import type { PlaceListItem } from "../places";

export type WorldEntry = {
  /** City name, or the country name for a country entry. */
  name: string;
  country: string | null;
  places: number;
  visits: number;
  /** Seconds spent at visits. */
  duration: number;
  /** ISO timestamp of the most recent visit's end. */
  lastVisit: string | null;
  /** Countries only: number of distinct cities. */
  cities?: number;
  /** The mean position of its places (for map dots). */
  lat: number;
  lon: number;
};

export type World = {
  countries: WorldEntry[];
  cities: WorldEntry[];
  /** Places the geocoder hasn't given a city/country yet. */
  unplaced: number;
};

export const WORLD_SORTS = ["visits", "places", "time", "recent", "name"] as const;
export type WorldSort = (typeof WORLD_SORTS)[number];

export function isWorldSort(s: string | null | undefined): s is WorldSort {
  return (WORLD_SORTS as readonly string[]).includes(s ?? "");
}

function later(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function add(map: Map<string, WorldEntry>, key: string, name: string, country: string | null, p: PlaceListItem) {
  const e = map.get(key) ?? { name, country, places: 0, visits: 0, duration: 0, lastVisit: null, lat: 0, lon: 0 };
  // Running mean of the places' positions.
  e.lat += (p.lat - e.lat) / (e.places + 1);
  e.lon += (p.lon - e.lon) / (e.places + 1);
  e.places++;
  e.visits += p.visitCount;
  e.duration += p.totalTime;
  e.lastVisit = later(e.lastVisit, p.lastVisit);
  map.set(key, e);
}

/** Places without visits don't count. Country entries count cities too. */
export function groupWorld(places: PlaceListItem[], sort: WorldSort = "visits"): World {
  const countries = new Map<string, WorldEntry>();
  const cities = new Map<string, WorldEntry>();
  const citySets = new Map<string, Set<string>>();
  let unplaced = 0;
  for (const p of places) {
    if (p.visitCount === 0) continue;
    if (!p.country && !p.city) {
      unplaced++;
      continue;
    }
    if (p.country) {
      add(countries, p.country, p.country, null, p);
      if (p.city) {
        const s = citySets.get(p.country) ?? new Set();
        s.add(p.city);
        citySets.set(p.country, s);
      }
    }
    if (p.city) add(cities, `${p.city}\u0000${p.country ?? ""}`, p.city, p.country, p);
  }
  for (const [k, e] of countries) e.cities = citySets.get(k)?.size ?? 0;
  return {
    countries: sortWorld([...countries.values()], sort),
    cities: sortWorld([...cities.values()], sort),
    unplaced,
  };
}

export function sortWorld(list: WorldEntry[], sort: WorldSort): WorldEntry[] {
  const byName = (a: WorldEntry, b: WorldEntry) => a.name.localeCompare(b.name, "en");
  const cmp: Record<WorldSort, (a: WorldEntry, b: WorldEntry) => number> = {
    visits: (a, b) => b.visits - a.visits || b.duration - a.duration || byName(a, b),
    places: (a, b) => b.places - a.places || b.visits - a.visits || byName(a, b),
    time: (a, b) => b.duration - a.duration || byName(a, b),
    recent: (a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? "") || byName(a, b),
    name: byName,
  };
  return [...list].sort(cmp[sort]);
}

/** Places in one city, most visited first. */
export function cityPlaces(places: PlaceListItem[], city: string, country: string | null): PlaceListItem[] {
  return places
    .filter((p) => p.city === city && (country == null || p.country === country) && p.visitCount > 0)
    .sort((a, b) => b.visitCount - a.visitCount || b.totalTime - a.totalTime);
}

let regionCodes: Map<string, string> | null = null;
/** Withdrawn or non-country codes that share a name with a current one ("DD" East Germany is "Germany"). */
const RETIRED = new Set(["DD", "FX", "CS", "YU", "SU", "BU", "TP", "ZR", "NT", "YD", "VD", "DY", "HV", "RH", "NH", "AN", "QO", "EU", "EZ", "UN", "UK"]);

/**
 * A country's two-letter ISO code from its name ("Finland" → "FI", also
 * "Suomi", "Deutschland"), via Intl's region names; null when unknown.
 */
export function countryCode(name: string): string | null {
  if (!regionCodes) {
    regionCodes = new Map();
    const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const names = ["en", "fi", "sv", "de", "et"].map((l) => new Intl.DisplayNames([l], { type: "region", fallback: "none" }));
    for (const a of A)
      for (const b of A) {
        const code = a + b;
        if (RETIRED.has(code)) continue;
        for (const dn of names) {
          let n: string | undefined;
          try {
            n = dn.of(code);
          } catch {
            n = undefined;
          }
          if (n && !regionCodes.has(n.toLowerCase())) regionCodes.set(n.toLowerCase(), code);
        }
      }
  }
  return regionCodes.get(name.trim().toLowerCase()) ?? null;
}
