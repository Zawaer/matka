import { describe, expect, it } from "vitest";
import type { PlaceListItem } from "../places";
import { cityPlaces, groupWorld } from "./world";

let id = 0;
const place = (city: string | null, country: string | null, visits: number, hours: number, last: string): PlaceListItem => ({
  id: ++id,
  name: `P${id}`,
  city,
  country,
  category: null,
  visitCount: visits,
  totalTime: hours * 3600,
  lastVisit: last,
  kind: null,
  radius: null,
});

const PLACES = [
  place("Espoo", "Finland", 40, 900, "2026-10-18T10:00:00Z"),
  place("Espoo", "Finland", 5, 20, "2026-10-01T10:00:00Z"),
  place("Helsinki", "Finland", 12, 50, "2026-10-18T21:00:00Z"),
  place("Stockholm", "Sweden", 8, 30, "2026-10-04T17:00:00Z"),
  place(null, null, 3, 1, "2026-03-01T10:00:00Z"),
  place("Kitee", "Finland", 0, 0, "2026-09-27T10:00:00Z"),
];

describe("world", () => {
  it("groups places by city and country", () => {
    const w = groupWorld(PLACES);
    expect(w.unplaced).toBe(1);
    expect(w.countries.map((c) => [c.name, c.places, c.visits, c.cities])).toEqual([
      ["Finland", 3, 57, 2],
      ["Sweden", 1, 8, 1],
    ]);
    expect(w.cities.map((c) => c.name)).toEqual(["Espoo", "Helsinki", "Stockholm"]);
    expect(w.cities[0].lastVisit).toBe("2026-10-18T10:00:00Z");
  });

  it("sorts by recency and name", () => {
    expect(groupWorld(PLACES, "recent").cities.map((c) => c.name)).toEqual(["Helsinki", "Espoo", "Stockholm"]);
    expect(groupWorld(PLACES, "name").countries.map((c) => c.name)).toEqual(["Finland", "Sweden"]);
    expect(groupWorld(PLACES, "places").cities[0].name).toBe("Espoo");
  });

  it("lists a city's visited places", () => {
    expect(cityPlaces(PLACES, "Espoo", "Finland").map((p) => p.visitCount)).toEqual([40, 5]);
    expect(cityPlaces(PLACES, "Kitee", "Finland")).toEqual([]);
  });
});
