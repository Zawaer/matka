import type { Pairing } from "../pairing";
import {
  deleteCorrection,
  postCorrection,
  searchRoutes,
  getEmbedTicket,
  getOverview,
  getPlaces,
  getTimeline,
  parseOverview,
  parsePlaces,
  parseTimeline,
} from "../viewer";

const P: Pairing = { server: "https://matka.example.com", token: "mtk_" + "A".repeat(43) };

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

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

const OVERVIEW = {
  totals: { points: 1200, visits: 30, trips: 25, days: 10, distance: 123456, first: "2026-01-01T00:00:00.000Z", last: "2026-10-18T10:00:00.000Z" },
  months: [{ year: 2026, month: 9, distance: 5000 }, { year: 2026, month: 10, distance: 0 }],
  topPlaces: [{ id: 3, name: "Home", hours: 120.5 }, { id: 4, name: null, hours: 2 }],
  recent: [{ id: 9, placeId: 3, name: "Home", startedAt: "2026-10-18T08:00:00.000Z", duration: 3600 }],
};

const TIMELINE = {
  day: {
    date: "2026-10-18",
    items: [
      {
        kind: "visit",
        visit: {
          id: 1, startedAt: "2026-10-18T06:00:00.000Z", endedAt: "2026-10-18T07:00:00.000Z", duration: 3600,
          placeId: 3, placeName: "Home", category: "house", lat: 60.1, lon: 24.9,
        },
      },
      {
        kind: "move",
        track: { id: 2, startedAt: "2026-10-18T07:00:00.000Z", endedAt: "2026-10-18T07:20:00.000Z", distance: 4200, duration: 1200, mode: "cycling" },
      },
      { kind: "move", track: { id: 3, startedAt: "a", endedAt: "b", distance: 1, duration: 1, mode: "teleport" } },
      { kind: "photo", photo: { id: 1 } },
    ],
  },
  dates: ["2026-10-17", "2026-10-18", "garbage"],
  minDate: "2026-10-17",
  maxDate: "2026-10-18",
};

const PLACES = {
  places: [
    { id: 3, name: "Home", city: "Helsinki", country: "Finland", category: "house", visitCount: 40, totalTime: 400000, lastVisit: "2026-10-18T08:00:00.000Z", kind: null },
    { id: 4, name: null, city: null, country: null, category: null, visitCount: 1, totalTime: 600, lastVisit: null, kind: "home" },
    { name: "no id" },
  ],
};

describe("requests", () => {
  it("sends the bearer token, accepts JSON, omits cookies, and hits the right path", async () => {
    respond(200, OVERVIEW);
    await getOverview(P);
    respond(200, TIMELINE);
    await getTimeline(P);
    await getTimeline(P, "2026-10-17");
    respond(200, PLACES);
    await getPlaces(P);
    respond(200, { url: "https://matka.example.com/embed/start?ticket=t" });
    await getEmbedTicket(P);

    expect(calls.map((c) => [c.init.method, c.url])).toEqual([
      ["GET", "https://matka.example.com/api/overview"],
      ["GET", "https://matka.example.com/api/timeline"],
      ["GET", "https://matka.example.com/api/timeline?date=2026-10-17"],
      ["GET", "https://matka.example.com/api/places"],
      ["POST", "https://matka.example.com/api/device/embed-ticket"],
    ]);
    for (const c of calls) {
      const h = c.init.headers as Record<string, string>;
      expect(h.Authorization).toBe(`Bearer ${P.token}`);
      expect(h.Accept).toBe("application/json");
      expect(c.init.credentials).toBe("omit");
      expect(c.url).not.toContain(P.token);
    }
  });

  it("rejects a malformed date without a request", async () => {
    respond(200, TIMELINE);
    const r = await getTimeline(P, "18.10.2026");
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["overview", () => getOverview(P)],
    ["timeline", () => getTimeline(P)],
    ["places", () => getPlaces(P)],
    ["embed ticket", () => getEmbedTicket(P)],
  ])("%s: 401 → unauthorized", async (_n, call) => {
    respond(401, { error: "unauthorized" });
    const r = await call();
    expect(r).toMatchObject({ ok: false, unauthorized: true });
  });

  it("5xx → error with the server's message, not unauthorized", async () => {
    respond(500, { places: [], error: "Failed to load places" });
    expect(await getPlaces(P)).toEqual({
      ok: false,
      unauthorized: false,
      error: "Server answered 500: Failed to load places.",
    });
  });

  it("network error → not unauthorized", async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error("Network request failed");
    }) as unknown as typeof fetch;
    expect(await getOverview(P)).toEqual({
      ok: false,
      unauthorized: false,
      error: "Can't reach the server: Network request failed.",
    });
  });

  it("a 200 that isn't Matka JSON (captive portal / SSO page) is an error", async () => {
    respond(200, "<html>Sign in</html>");
    for (const r of [await getOverview(P), await getTimeline(P), await getPlaces(P), await getEmbedTicket(P)]) {
      expect(r).toMatchObject({ ok: false, unauthorized: false });
    }
  });

  it("embed ticket: returns the URL on the paired origin", async () => {
    respond(200, { url: "https://MATKA.example.com:443/embed/start?ticket=abc" });
    expect(await getEmbedTicket(P)).toEqual({ ok: true, data: "https://MATKA.example.com:443/embed/start?ticket=abc" });
  });

  it.each([
    "https://evil.example.com/embed/start?ticket=abc",
    "http://matka.example.com/embed/start?ticket=abc",
    "https://matka.example.com:8443/embed/start?ticket=abc",
    "javascript:alert(1)",
  ])("embed ticket: refuses a URL on another origin (%s)", async (url) => {
    respond(200, { url });
    expect(await getEmbedTicket(P)).toMatchObject({ ok: false, unauthorized: false });
  });
});

describe("parsing", () => {
  it("overview: new shape (topPlaces, trips, distance in metres, recent.placeId)", () => {
    expect(parseOverview(OVERVIEW)).toEqual(OVERVIEW);
  });

  it("overview: tolerates missing lists and bad values", () => {
    const o = parseOverview({ totals: { points: "7", distance: null } });
    expect(o).toEqual({
      totals: { points: 0, visits: 0, trips: 0, days: 0, distance: 0, first: null, last: null },
      months: [],
      topPlaces: [],
      recent: [],
    });
    expect(parseOverview({})).toBeNull();
    expect(parseOverview(null)).toBeNull();
    expect(parseOverview("x")).toBeNull();
  });

  it("timeline: visits with placeName/category, moves with mode; unknown kinds/modes handled", () => {
    const t = parseTimeline(TIMELINE)!;
    expect(t.day.date).toBe("2026-10-18");
    expect(t.day.items).toHaveLength(3);
    const visit = TIMELINE.day.items[0] as { kind: "visit"; visit: object };
    expect(t.day.items[0]).toEqual({ ...visit, visit: { ...visit.visit, placeKind: null, osmKey: null, candidates: null } });
    const move = TIMELINE.day.items[1] as { kind: "move"; track: object };
    expect(t.day.items[1]).toEqual({
      ...move,
      track: { ...move.track, legs: [], waits: [], correctionId: null, added: false, from: null, to: null, path: null },
    });
    // The simplified line arrives as [lon, lat] pairs; junk points are dropped.
    const withPath = parseTimeline({ day: { date: "2026-10-18", items: [{ kind: "move", track: { ...move.track, path: [[24.7, 60.1], ["x", 1], [24.8, 60.2]] } }] } })!;
    expect((withPath.day.items[0] as { track: { path: unknown } }).track.path).toEqual([{ lat: 60.1, lon: 24.7 }, { lat: 60.2, lon: 24.8 }]);
    expect(t.day.items[2]).toMatchObject({ kind: "move", track: { id: 3, mode: "unknown" } });
    expect(t.dates).toEqual(["2026-10-17", "2026-10-18"]);
    expect(t.minDate).toBe("2026-10-17");
    expect(t.maxDate).toBe("2026-10-18");
  });

  it("timeline: public transport legs, dropping malformed ones", () => {
    const t = parseTimeline({
      day: {
        date: "2026-08-19",
        items: [
          {
            kind: "move",
            track: {
              id: 9,
              startedAt: "2026-08-19T04:47:00Z",
              endedAt: "2026-08-19T05:05:00Z",
              distance: 7900,
              duration: 1080,
              mode: "bus",
              legs: [
                { kind: "bus", lines: ["159"], fromStop: "Leppävaara", toStop: "Matinkylä (M)", startedAt: "x", endedAt: "y", distance: 7700 },
                { kind: "metro", lines: ["M2", "M1"], fromStop: null, toStop: "Aalto-yliopisto" },
                { kind: "zeppelin", lines: ["Z1"] },
                { kind: "tram", lines: [] },
              ],
            },
          },
        ],
      },
      dates: ["2026-08-19"],
      minDate: "2026-08-19",
      maxDate: "2026-08-19",
    })!;
    expect(t.day.items[0]).toMatchObject({
      kind: "move",
      track: {
        mode: "bus",
        legs: [
          { kind: "bus", lines: ["159"], fromStop: "Leppävaara", toStop: "Matinkylä (M)" },
          { kind: "metro", lines: ["M2", "M1"], fromStop: null, toStop: "Aalto-yliopisto" },
        ],
      },
    });
    const legs = (t.day.items[0] as { track: { legs: { startedAt: string | null; endedAt: string | null }[] } }).track.legs;
    expect(legs.map((l) => [l.startedAt, l.endedAt])).toEqual([
      [null, null], // "x"/"y" aren't instants
      [null, null],
    ]);
  });

  it("timeline: leg times and waits (transfers), dropping malformed waits", () => {
    const t = parseTimeline({
      day: {
        date: "2026-10-18",
        items: [
          {
            kind: "move",
            track: {
              id: 1,
              startedAt: "2026-10-18T05:31:00.000Z",
              endedAt: "2026-10-18T06:02:00.000Z",
              mode: "bus",
              legs: [{ kind: "bus", lines: ["550"], fromStop: "A", toStop: "B", startedAt: "2026-10-18T05:33:00.000Z", endedAt: "2026-10-18T05:47:00.000Z" }],
              waits: [
                { startedAt: "2026-10-18T05:48:00.000Z", endedAt: "2026-10-18T05:54:00.000Z", stop: "Kamppi" },
                { startedAt: "2026-10-18T05:55:00.000Z", endedAt: "2026-10-18T05:56:00.000Z", stop: "" },
                { startedAt: "soon", endedAt: "2026-10-18T05:56:00.000Z", stop: "X" },
                "nope",
              ],
            },
          },
        ],
      },
      dates: ["2026-10-18"],
    })!;
    expect(t.day.items[0]).toMatchObject({
      track: {
        legs: [{ startedAt: "2026-10-18T05:33:00.000Z", endedAt: "2026-10-18T05:47:00.000Z" }],
        waits: [
          { startedAt: "2026-10-18T05:48:00.000Z", endedAt: "2026-10-18T05:54:00.000Z", stop: "Kamppi" },
          { startedAt: "2026-10-18T05:55:00.000Z", endedAt: "2026-10-18T05:56:00.000Z", stop: null },
        ],
      },
    });
  });

  it("timeline: empty account (no date, null min/max)", () => {
    expect(parseTimeline({ day: { date: "", items: [] }, dates: [], minDate: null, maxDate: null })).toEqual({
      day: { date: "", items: [] },
      dates: [],
      minDate: null,
      maxDate: null,
    });
    expect(parseTimeline({ dates: [] })).toBeNull();
  });

  it("places: keeps nullable fields, drops rows without an id", () => {
    const p = parsePlaces(PLACES)!;
    expect(p).toHaveLength(2);
    expect(p[0]).toEqual(PLACES.places[0]);
    expect(p[1]).toEqual({
      id: 4, name: null, city: null, country: null, category: null, visitCount: 1, totalTime: 600, lastVisit: null, kind: "home",
    });
    // a kind this app doesn't know reads as not saved
    expect(parsePlaces({ places: [{ id: 5, kind: "castle" }] })![0].kind).toBeNull();
    expect(parsePlaces({ error: "x" })).toBeNull();
  });
});

describe("trip corrections", () => {
  it("reads the correction id of an edited move", () => {
    const t = parseTimeline({
      day: { date: "2026-10-27", items: [{ kind: "move", track: { id: 5, startedAt: "a", endedAt: "b", mode: "metro", correctionId: 12 } }] },
      dates: [],
    })!;
    expect(t.day.items[0]).toMatchObject({ track: { correctionId: 12 } });
  });

  it("searches lines, keeping only known kinds", async () => {
    respond(200, { routes: [{ line: "M1", kind: "metro", name: "Kivenlahti - Vuosaari" }, { line: "X", kind: "zeppelin" }] });
    const r = await searchRoutes(P, "M1");
    expect(calls[0].url).toBe("https://matka.example.com/api/transit/routes?q=M1");
    expect(r).toEqual({ ok: true, data: [{ line: "M1", kind: "metro", name: "Kivenlahti - Vuosaari" }] });
  });

  it("posts a fix with the device token and undoes it", async () => {
    respond(200, { correction: { id: 9 } });
    const body = {
      startedAt: "2026-10-27T07:36:00.000Z",
      endedAt: "2026-10-27T08:10:00.000Z",
      mode: "metro" as const,
      legs: [{ kind: "bus" as const, line: "159", transferStop: "Matinkylä" }],
    };
    expect(await postCorrection(P, body)).toEqual({ ok: true, data: 9 });
    expect(calls[0].url).toBe("https://matka.example.com/api/corrections");
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${P.token}`);
    expect(JSON.parse(calls[0].init.body as string)).toEqual(body);
    respond(200, { ok: true });
    expect(await deleteCorrection(P, 9)).toEqual({ ok: true, data: true });
    expect(calls[1]).toMatchObject({ url: "https://matka.example.com/api/corrections/9", init: { method: "DELETE" } });
  });
});
