import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FOLD_FROM,
  FOLD_TO,
  MatchLevel,
  fold,
  likeAnywhere,
  matchLevel,
  queryTokens,
  rankAreas,
  rankPlaces,
  type SearchCandidate,
  formatDate,
  formatTimeSpent,
} from "./search";

describe("fold", () => {
  it("drops case and accents", () => {
    expect(fold("Café Ekberg")).toBe("cafe ekberg");
    expect(fold("SÄRKÄNNIEMI")).toBe("sarkanniemi");
    expect(fold("Łódź Øresund İstanbul")).toBe("lodz oresund istanbul");
    expect(fold(null)).toBe("");
  });

  it("treats a decomposed accent like a composed one", () => {
    expect(fold("Café")).toBe("cafe");
  });

  it("maps one character to one, as Postgres translate() needs", () => {
    expect([...FOLD_FROM].length).toBe([...FOLD_TO].length);
    expect(new Set(FOLD_FROM).size).toBe([...FOLD_FROM].length);
  });

  it("matches the database's matka_fold() in the migration", () => {
    const sql = readFileSync(path.join(__dirname, "../../migrations/014_search.sql"), "utf8");
    expect(sql).toContain(`'${FOLD_FROM}'`);
    expect(sql).toContain(`'${FOLD_TO}'`);
  });
});

describe("queryTokens", () => {
  it("splits and folds", () => {
    expect(queryTokens("  Tin  Tin Tángo ")).toEqual(["tin", "tin", "tango"]);
    expect(queryTokens("   ")).toEqual([]);
  });
});

describe("likeAnywhere", () => {
  it("escapes LIKE wildcards", () => {
    expect(likeAnywhere("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});

describe("matchLevel", () => {
  const lvl = (text: string, q: string) => matchLevel(text, queryTokens(q));
  it("ranks exact > prefix > word prefix > substring > scattered words", () => {
    expect(lvl("Tin Tin Tango", "tin tin tango")).toBe(MatchLevel.Exact);
    expect(lvl("Tin Tin Tango", "tin tin")).toBe(MatchLevel.Prefix);
    expect(lvl("Tin Tin Tango", "tango")).toBe(MatchLevel.WordPrefix);
    expect(lvl("Café Regatta", "gatt")).toBe(MatchLevel.Substring);
    expect(lvl("Tin Tin Tango", "tango tin")).toBe(MatchLevel.Words);
    expect(lvl("Tin Tin Tango", "salsa")).toBe(MatchLevel.None);
  });
  it("is accent-insensitive both ways", () => {
    expect(lvl("Cafe Regatta", "café")).toBe(MatchLevel.Prefix);
    expect(lvl("Särkänniemi", "sarkan")).toBe(MatchLevel.Prefix);
  });
});

describe("rankPlaces", () => {
  const place = (name: string, visitCount: number, extra: Partial<SearchCandidate> = {}): SearchCandidate => ({
    name,
    visitCount,
    lastVisit: null,
    ...extra,
  });

  it("puts better name matches first, then more visits", () => {
    const ranked = rankPlaces(
      [
        place("Kahvila Tango", 50),
        place("Tango", 1),
        place("Tangomarkkinat", 3),
        place("Tangomarkkinat 2", 9),
        place("Somewhere", 99, { street: "Tangokatu" }),
      ],
      queryTokens("tango"),
    );
    expect(ranked.map((p) => p.name)).toEqual([
      "Tango",
      "Tangomarkkinat 2",
      "Tangomarkkinat",
      "Kahvila Tango",
      "Somewhere",
    ]);
    expect(ranked[0].field).toBe("name");
    expect(ranked.at(-1)!.field).toBe("address");
  });

  it("breaks ties on visits by the latest visit", () => {
    const ranked = rankPlaces(
      [
        place("Cafe A", 2, { lastVisit: "2026-01-01T10:00:00Z" }),
        place("Cafe B", 2, { lastVisit: "2026-10-01T10:00:00Z" }),
      ],
      queryTokens("cafe"),
    );
    expect(ranked.map((p) => p.name)).toEqual(["Cafe B", "Cafe A"]);
  });

  it("finds places by kind, type and city, below name matches", () => {
    const places = [
      place("Kotikatu 12", 80, { kind: "home", city: "Espoo" }),
      place("Homebase Bar", 1, { city: "Espoo" }),
      place("Café Regatta", 9, { category: "cafe", city: "Helsinki" }),
      place("Oodi", 6, { category: "library", city: "Helsinki" }),
    ];
    expect(rankPlaces(places, queryTokens("home")).map((p) => p.name)).toEqual(["Homebase Bar", "Kotikatu 12"]);
    expect(rankPlaces(places, queryTokens("library")).map((p) => p.field)).toEqual(["category"]);
    // Words spread over name and city.
    const mixed = rankPlaces(places, queryTokens("regatta helsinki"));
    expect(mixed.map((p) => p.name)).toEqual(["Café Regatta"]);
    // A city alone lists its places by visits.
    expect(rankPlaces(places, queryTokens("helsinki")).map((p) => p.name)).toEqual(["Café Regatta", "Oodi"]);
  });

  it("matches a renamed place by its old name too", () => {
    const ranked = rankPlaces([place("Grandma's", 4, { altName: "Mallitie 7" })], queryTokens("mallit"));
    expect(ranked).toHaveLength(1);
    expect(ranked[0].field).toBe("name");
  });
});

describe("rankAreas", () => {
  const rows = [
    { city: "Tallinn", country: "Estonia", places: 4, visits: 6, duration: 3600, lastVisit: "2026-05-02T10:00:00.000Z" },
    { city: "Tartu", country: "Estonia", places: 1, visits: 1, duration: 600, lastVisit: "2026-06-02T10:00:00.000Z" },
    { city: "Espoo", country: "Finland", places: 7, visits: 200, duration: 9000, lastVisit: "2026-10-02T10:00:00.000Z" },
  ];

  it("returns matching cities with their World page", () => {
    const areas = rankAreas(rows, queryTokens("tallin"));
    expect(areas).toEqual([
      {
        type: "city",
        name: "Tallinn",
        country: "Estonia",
        places: 4,
        visits: 6,
        duration: 3600,
        lastVisit: "2026-05-02T10:00:00.000Z",
        href: "/insights/world/city?name=Tallinn&country=Estonia",
      },
    ]);
  });

  it("adds up a country's cities", () => {
    const [c] = rankAreas(rows, queryTokens("eston"));
    expect(c).toMatchObject({ type: "country", name: "Estonia", places: 5, visits: 7, duration: 4200 });
    expect(c.lastVisit).toBe("2026-06-02T10:00:00.000Z");
    expect(c.href).toBe("/insights/world?country=Estonia");
  });

  it("puts better matches first", () => {
    expect(rankAreas(rows, queryTokens("t")).map((a) => a.name)).toEqual(["Tallinn", "Tartu", "Estonia"]);
  });
});

describe("formatting", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  it("formats dates, with the year only when needed", () => {
    expect(formatDate("2026-10-18", false, now)).toBe("18 Oct");
    expect(formatDate("2026-10-18", true, now)).toBe("18 Oct 2026");
    expect(formatDate("2025-03-02", false, now)).toBe("2 Mar 2025");
  });
  it("rounds time spent", () => {
    expect(formatTimeSpent(0)).toBe("—");
    expect(formatTimeSpent(20)).toBe("1 min");
    expect(formatTimeSpent(45 * 60)).toBe("45 min");
    expect(formatTimeSpent(9 * 3600 + 1200)).toBe("9 h");
    expect(formatTimeSpent(3 * 86_400 + 4 * 3600)).toBe("3 d 4 h");
    expect(formatTimeSpent(3 * 86_400 + 23.8 * 3600)).toBe("4 d");
  });
});
