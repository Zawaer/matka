import {
  assetSource,
  getCity,
  getMonthModes,
  getSavedMonth,
  getTrip,
  getTrips,
  getWorld,
  parseMonthModes,
  parseTripDetail,
  parseTrips,
  parseWorld,
} from "../insights";
import type { Pairing } from "../pairing";

const P: Pairing = { server: "https://matka.example.com", token: "mtk_" + "A".repeat(43) };
const ASSET = "0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0";

let calls: { url: string; init: RequestInit }[] = [];
function respond(status: number, body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { status, text: async () => text } as Response;
  }) as unknown as typeof fetch;
}
beforeEach(() => {
  calls = [];
});

const TRIP = {
  id: "2026-10-03",
  name: "Turku",
  startDate: "2026-10-03",
  endDate: "2026-10-05",
  days: 3,
  nights: 2,
  departure: "2026-10-03T06:00:00.000Z",
  arrival: null,
  cities: [{ city: "Turku", country: "Finland", duration: 3600, firstSeen: "2026-10-03T08:00:00.000Z", away: true }, { nope: 1 }],
  countries: ["Finland"],
  distance: 170000,
  duration: 7200,
  modes: [{ mode: "train", distance: 160000, duration: 6000, count: 2 }, { mode: "hoverboard", distance: 1, duration: 1, count: 1 }],
  cover: ASSET,
};

test("parseMonthModes normalises modes and drops bad history", () => {
  const m = parseMonthModes({
    month: "2026-10",
    distance: 5,
    duration: 6,
    modes: [{ mode: "walking", distance: 5, duration: 6, count: 1, history: [{ month: "2026-10", distance: 5, duration: 6 }, { month: "bad" }] }],
    historyMonths: ["2026-10", 3],
    firstMonth: "2026-01",
    lastMonth: null,
  });
  expect(m?.modes[0].history).toHaveLength(1);
  expect(m?.historyMonths).toEqual(["2026-10"]);
  expect(m?.lastMonth).toBeNull();
  expect(parseMonthModes({ month: "October" })).toBeNull();
});

test("parseTrips: unknown modes become 'unknown', bad cover ids are dropped", () => {
  const t = parseTrips({ home: { lat: 1, lon: 2, nights: 100, city: "Espoo", country: "Finland", saved: [] }, trips: [TRIP, { id: 5 }, { ...TRIP, id: "x", cover: "../etc" }] });
  expect(t?.trips).toHaveLength(2);
  expect(t?.trips[0].modes.map((m) => m.mode)).toEqual(["train", "unknown"]);
  expect(t?.trips[0].cities).toHaveLength(1);
  expect(t?.trips[0].cover).toBe(ASSET);
  expect(t?.trips[1].cover).toBeNull();
  expect(t?.home?.city).toBe("Espoo");
});

test("parseTripDetail reads days and photos", () => {
  const d = parseTripDetail({
    trip: { ...TRIP, dayList: [{ date: "2026-10-03", distance: 1, duration: 2, modes: [], cities: ["Turku"] }, { date: "nope" }], photos: [ASSET, "x"] },
  });
  expect(d?.dayList.map((x) => x.date)).toEqual(["2026-10-03"]);
  expect(d?.photos).toEqual([ASSET]);
  expect(parseTripDetail({ trip: { id: 1 } })).toBeNull();
});

test("parseWorld keeps country city counts", () => {
  const w = parseWorld({
    countries: [{ name: "Finland", country: null, places: 3, visits: 9, duration: 10, lastVisit: null, cities: 2 }],
    cities: [{ name: "Espoo", country: "Finland", places: 2, visits: 5, duration: 5, lastVisit: "2026-10-01T00:00:00Z" }, { name: "" }],
    unplaced: 1,
  });
  expect(w?.countries[0].cities).toBe(2);
  expect(w?.cities).toHaveLength(1);
  expect(w?.cities[0].cities).toBeNull();
});

test("requests carry the bearer token and the right paths", async () => {
  respond(200, { month: "2026-10", saved: 1, rows: [{ placeId: 3, name: "Koulu", kind: "school", seconds: 100, nights: 0 }, { placeId: 4, kind: "weird" }] });
  const saved = await getSavedMonth(P, "2026-10");
  expect(calls[0].url).toBe("https://matka.example.com/api/insights/saved?month=2026-10");
  expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${P.token}`);
  expect(saved.ok && saved.data.rows.map((r) => r.kind)).toEqual(["school", "other"]);

  calls = [];
  respond(200, { month: "2026-10", modes: [] });
  await getMonthModes(P);
  await getMonthModes(P, "2026-09");
  expect(calls.map((c) => c.url.replace(P.server, ""))).toEqual(["/api/insights/modes", "/api/insights/modes?month=2026-09"]);

  calls = [];
  respond(200, { city: "Kyiv", country: "Ukraine", places: [] });
  await getCity(P, "Kyiv & co", "Ukraine");
  respond(200, { countries: [], cities: [], unplaced: 0 });
  await getWorld(P, "recent");
  respond(200, { home: null, trips: [] });
  await getTrips(P);
  expect(calls.map((c) => c.url.replace(P.server, ""))).toEqual([
    "/api/insights/world?city=Kyiv%20%26%20co&country=Ukraine",
    "/api/insights/world?sort=recent",
    "/api/insights/trips",
  ]);
});

test("bad input is refused without a request; 401 and 404 map to errors", async () => {
  respond(200, {});
  expect((await getMonthModes(P, "2026-1")).ok).toBe(false);
  expect((await getTrip(P, "../x")).ok).toBe(false);
  expect(calls).toHaveLength(0);

  respond(401, { error: "unauthorized" });
  const r = await getTrips(P);
  expect(r.ok === false && r.unauthorized).toBe(true);

  respond(404, { error: "not found" });
  const n = await getTrip(P, "2026-10-03");
  expect(n.ok === false && n.error).toBe("Server answered 404: not found.");
});

test("assetSource puts the token in a header, not the URL", () => {
  const s = assetSource(P, ASSET, "thumbnail");
  expect(s.uri).toBe(`https://matka.example.com/api/immich/asset/${ASSET}?size=thumbnail`);
  expect(s.uri).not.toContain("mtk_");
  expect(s.headers.Authorization).toBe(`Bearer ${P.token}`);
});
