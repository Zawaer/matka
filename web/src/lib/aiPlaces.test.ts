import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ q: vi.fn() }));
const { aiCandidates, pickPhotonName } = await import("./processing/geocode");
const { buildPrompt, parsePicks, pickedName, isCandidates, MIN_CONFIDENCE } = await import("./aiPlaces");
type F = Parameters<typeof aiCandidates>[0][number];
type Input = Parameters<typeof buildPrompt>[0][number];

/** A Photon reverse feature `north` m north and `east` m east of (lat, lon). */
function feat(lat: number, lon: number, north: number, east: number, props: NonNullable<F["properties"]>): F {
  return {
    geometry: { type: "Point", coordinates: [lon + east / 55_500, lat + north / 111_200] },
    properties: { country: "Suomi", city: "Espoo", ...props },
  };
}

const [lat, lon] = [60.1756, 24.8045];
// A corner in Tapiola: a gym, a café and a pub around the stay, and the address.
const corner = [
  feat(lat, lon, 4, 3, { osm_key: "highway", osm_value: "footway", name: "Tapionaukio" }),
  feat(lat, lon, 8, -4, { osm_key: "building", osm_value: "apartments", street: "Tapionaukio", housenumber: "4" }),
  feat(lat, lon, 12, 6, { osm_key: "amenity", osm_value: "pub", name: "Tapiolan Ölkkä", street: "Tapionaukio", housenumber: "4" }),
  feat(lat, lon, 20, -10, { osm_key: "leisure", osm_value: "fitness_centre", name: "Elixia Tapiola" }),
  feat(lat, lon, -25, 15, { osm_key: "amenity", osm_value: "cafe", name: "Café Tapio" }),
  feat(lat, lon, 30, 30, { osm_key: "amenity", osm_value: "place_of_worship", name: "Tapiolan kirkko" }),
  feat(lat, lon, -40, -30, { osm_key: "amenity", osm_value: "clinic", name: "Terveystalo" }),
  feat(lat, lon, 150, 0, { osm_key: "shop", osm_value: "mall", name: "Ainoa" }),
];

describe("aiCandidates", () => {
  it("keeps only POIs pickPhotonName could assert, within 60 m, nearest first", () => {
    const c = aiCandidates(corner, lat, lon)!;
    expect(c.pois.map((p) => p.name)).toEqual(["Elixia Tapiola", "Café Tapio"]);
    expect(c.pois[0]).toMatchObject({ key: "leisure", kind: "fitness_centre" });
    expect(c.pois[0].d).toBeGreaterThan(15);
    expect(c.address).toBe("Tapionaukio 4");
    expect(JSON.stringify(c)).not.toMatch(/Ölkkä|kirkko|Terveystalo|Ainoa/);
  });

  it("is null with fewer than two candidates, and doesn't change pickPhotonName", () => {
    const one = corner.filter((f) => f.properties?.name !== "Café Tapio");
    expect(aiCandidates(one, lat, lon)).toBeNull();
    expect(pickPhotonName(corner, lat, lon).name).toBe("Elixia Tapiola"); // its own rules, as before
  });

  it("drops duplicate names", () => {
    const dup = [...corner, feat(lat, lon, 22, -11, { osm_key: "leisure", osm_value: "sports_centre", name: "Elixia Tapiola" })];
    expect(aiCandidates(dup, lat, lon)!.pois.filter((p) => p.name === "Elixia Tapiola")).toHaveLength(1);
  });
});

const gymCafe = (): Input => ({
  candidates: {
    pois: [
      { name: "Elixia Tapiola", key: "leisure", kind: "fitness_centre", d: 22 },
      { name: "Café Tapio", key: "amenity", kind: "cafe", d: 29 },
    ],
    address: "Tapionaukio 4",
  },
  stats: { visits: 31, startHour: 18, minutes: 72, weekendShare: 0.12, nightShare: 0 },
});

describe("buildPrompt", () => {
  it("sends names, types, distances and the visit pattern, never the address", () => {
    const p = buildPrompt([gymCafe(), { ...gymCafe(), candidates: { ...gymCafe().candidates, address: null } }]);
    const rows = JSON.parse(p.slice(p.indexOf("[")));
    expect(rows[0]).toEqual({
      place: 1,
      candidates: [
        { name: "Elixia Tapiola", type: "fitness centre", metres: 20 },
        { name: "Café Tapio", type: "cafe", metres: 30 },
      ],
      address_option: true,
      visits: 31,
      typical_start: "18:00",
      typical_minutes: 75,
      weekend_share: 0.1,
      night_share: 0,
    });
    expect(rows[1].address_option).toBe(false);
    expect(p).not.toMatch(/Tapionaukio|60\.17|24\.80/);
  });
});

describe("parsePicks", () => {
  const places = [gymCafe(), gymCafe(), { ...gymCafe(), candidates: { ...gymCafe().candidates, address: null } }];

  it("accepts confident picks of listed names and address", () => {
    const reply = `\`\`\`json
{"picks":[{"place":1,"choice":"elixia  tapiola","confidence":0.9},{"place":2,"choice":"address","confidence":0.8}]}
\`\`\``;
    const picks = parsePicks(reply, places)!;
    expect(picks).toHaveLength(2);
    expect(picks[0]).toMatchObject({ index: 0, choice: { kind: "poi", name: "Elixia Tapiola" }, confidence: 0.9 });
    expect(pickedName(picks[0], places[0].candidates)).toBe("Elixia Tapiola");
    expect(pickedName(picks[1], places[1].candidates)).toBe("Tapionaukio 4");
  });

  it("rejects invented names, unsure, low confidence, unknown places and address without one", () => {
    const reply = {
      picks: [
        { place: 1, choice: "Tapiolan Ölkkä", confidence: 0.99 },
        { place: 2, choice: "Café Tapio", confidence: MIN_CONFIDENCE - 0.01 },
        { place: 3, choice: "address", confidence: 0.9 },
        { place: 4, choice: "Café Tapio", confidence: 0.9 },
        { place: 0, choice: "Café Tapio", confidence: 0.9 },
      ],
    };
    expect(parsePicks(reply, places)).toEqual([]);
    expect(parsePicks({ picks: [{ place: 1, choice: "unsure", confidence: 1 }] }, places)).toEqual([]);
    expect(parsePicks({ picks: [{ place: 1, choice: "Café Tapio", confidence: 2 }] }, places)).toEqual([]);
  });

  it("takes only the first answer per place", () => {
    const reply = { picks: [{ place: 1, choice: "Café Tapio", confidence: 0.8 }, { place: 1, choice: "Elixia Tapiola", confidence: 0.95 }] };
    expect(parsePicks(reply, places)!.map((p) => p.choice)).toMatchObject([{ name: "Café Tapio" }]);
  });

  it("never accepts a type pickPhotonName refuses, even if it was stored as a candidate", () => {
    const sneaky: Input = { ...gymCafe(), candidates: { pois: [{ name: "Bar Tapio", key: "amenity", kind: "bar", d: 5 }], address: null } };
    expect(parsePicks({ picks: [{ place: 1, choice: "Bar Tapio", confidence: 0.95 }] }, [sneaky])).toEqual([]);
  });

  it("returns null for replies that aren't the JSON asked for", () => {
    expect(parsePicks("I think it's the gym.", places)).toBeNull();
    expect(parsePicks('{"picks": "gym"}', places)).toBeNull();
    expect(parsePicks("{not json}", places)).toBeNull();
  });
});

describe("isCandidates", () => {
  it("checks the stored shape", () => {
    expect(isCandidates(gymCafe().candidates)).toBe(true);
    expect(isCandidates({ pois: [{ name: 1 }], address: null })).toBe(false);
    expect(isCandidates(null)).toBe(false);
  });
});
