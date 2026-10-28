import type { Pairing } from "../pairing";
import { fmtDate, fmtTimeSpent, parseSearch, searchPlaces, visitLine } from "../search";

const P: Pairing = { server: "https://matka.example.com", token: "mtk_" + "A".repeat(43) };

let urls: string[] = [];
function respond(status: number, body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  globalThis.fetch = jest.fn(async (url: string) => {
    urls.push(url);
    return { status, text: async () => text } as Response;
  }) as unknown as typeof fetch;
}
beforeEach(() => {
  urls = [];
});

const BODY = {
  query: "café",
  places: [
    {
      id: 8,
      name: "Café Regatta",
      kind: null,
      category: "cafe",
      city: "Helsinki",
      country: "Finland",
      visitCount: 9,
      totalTime: 32400,
      firstVisit: "2026-03-01T10:00:00.000Z",
      lastVisit: "2026-10-18T09:00:00.000Z",
      lastVisitDate: "2026-10-18",
      recentDates: ["2026-10-18", "2026-09-30", "not a date", 5],
      match: "name",
    },
    { id: 9, name: null, kind: "bogus", visitCount: "x", recentDates: "nope" },
    { name: "no id" },
  ],
  areas: [
    { type: "city", name: "Helsinki", country: "Finland", places: 12, visits: 80, duration: 1000, lastVisit: "2026-10-18T09:00:00.000Z", href: "/x" },
    { type: "planet", name: "Earth" },
    { type: "country", name: 3 },
  ],
};

describe("parseSearch", () => {
  it("keeps well-formed results and normalises the rest", () => {
    const r = parseSearch(BODY)!;
    expect(r.query).toBe("café");
    expect(r.places).toHaveLength(2);
    expect(r.places[0]).toMatchObject({ id: 8, name: "Café Regatta", lastVisitDate: "2026-10-18", visitCount: 9 });
    expect(r.places[0].recentDates).toEqual(["2026-10-18", "2026-09-30"]);
    expect(r.places[1]).toMatchObject({ id: 9, name: null, kind: null, visitCount: 0, recentDates: [], lastVisitDate: null, match: "name" });
    expect(r.areas).toEqual([
      { type: "city", name: "Helsinki", country: "Finland", places: 12, visits: 80, duration: 1000, lastVisit: "2026-10-18T09:00:00.000Z" },
    ]);
  });

  it("rejects what isn't a search answer", () => {
    expect(parseSearch(null)).toBeNull();
    expect(parseSearch({ places: "x" })).toBeNull();
    expect(parseSearch({ places: [] })).toEqual({ query: "", places: [], areas: [] });
  });
});

describe("searchPlaces", () => {
  it("encodes the query and sends the token", async () => {
    respond(200, BODY);
    const r = await searchPlaces(P, "  tin tin & tango ");
    expect(r.ok).toBe(true);
    expect(urls).toEqual(["https://matka.example.com/api/search?q=tin%20tin%20%26%20tango"]);
    const init = (globalThis.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${P.token}`);
  });

  it("explains an older server without search", async () => {
    respond(404, "Not found");
    const r = await searchPlaces(P, "x");
    expect(r).toMatchObject({ ok: false, unauthorized: false });
    if (!r.ok) expect(r.error).toMatch(/doesn't support search/);
  });

  it("reports a rejected token", async () => {
    respond(401, { error: "unauthorized" });
    expect(await searchPlaces(P, "x")).toMatchObject({ ok: false, unauthorized: true });
  });
});

describe("formatting", () => {
  const now = new Date(2026, 9, 19, 12);
  it("formats dates", () => {
    expect(fmtDate("2026-10-18", false, now)).toBe("18 Oct");
    expect(fmtDate("2026-10-18", true, now)).toBe("18 Oct 2026");
    expect(fmtDate("2025-03-02", false, now)).toBe("2 Mar 2025");
  });
  it("rounds time spent", () => {
    expect(fmtTimeSpent(45 * 60)).toBe("45 min");
    expect(fmtTimeSpent(9 * 3600 + 600)).toBe("9 h 10 min");
    expect(fmtTimeSpent(3 * 86_400 + 4 * 3600)).toBe("3 d 4 h");
  });
  it("summarises the visits", () => {
    expect(visitLine({ lastVisitDate: "2026-10-18", visitCount: 12, totalTime: 9 * 3600 }, now)).toBe("12 visits · last 18 Oct");
    expect(visitLine({ lastVisitDate: "2025-03-02", visitCount: 1, totalTime: 60 }, now)).toBe("1 visit · last 2 Mar 2025");
    expect(visitLine({ lastVisitDate: null, visitCount: 0, totalTime: 0 }, now)).toBe("No visits yet");
  });
});
