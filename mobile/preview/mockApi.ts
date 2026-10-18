// Mock Matka API for the browser preview. ?scenario=empty|error|slow switches state.
const scenario = new URLSearchParams(location.search).get("scenario") ?? "ok";
const iso = (d: string, hm: string) => `${d}T${hm}:00+03:00`;

const overview = {
  totals: { points: 113871, visits: 1440, tracks: 912, days: 205, totalKm: 21405, first: "2026-03-13T08:00:00Z", last: "2026-10-18T10:48:00Z" },
  months: [
    { year: 2026, month: 3, distance: 1500000 }, { year: 2026, month: 4, distance: 1300000 },
    { year: 2026, month: 5, distance: 3400000 }, { year: 2026, month: 6, distance: 3450000 },
    { year: 2026, month: 7, distance: 2100000 }, { year: 2026, month: 8, distance: 4900000 },
    { year: 2026, month: 9, distance: 3000000 }, { year: 2026, month: 10, distance: 1750000 },
  ],
  cities: [
    { city: "Espoo", count: 49429 }, { city: "Helsinki", count: 23251 }, { city: "Tampere", count: 4120 },
    { city: "Rovaniemi", count: 1893 }, { city: "Tallinn", count: 1544 }, { city: "Stockholm", count: 902 },
  ],
  recent: [
    { id: 1, name: "City library", startedAt: iso("2026-10-18", "09:12"), duration: 8100 },
    { id: 2, name: "Keilaniemi", startedAt: iso("2026-10-17", "17:40"), duration: 540 },
    { id: 3, name: "K-Supermarket", startedAt: iso("2026-10-17", "16:55"), duration: 1380 },
    { id: 4, name: "00990 Esimerkkitie 2", startedAt: iso("2026-10-16", "22:05"), duration: 33000 },
    { id: 5, name: null, startedAt: iso("2026-10-16", "12:30"), duration: 900 },
  ],
};

const P = (id: number, name: string, category: string | null, city: string, visitCount: number, totalTime: number) =>
  ({ id, name, category, city, country: "Finland", visitCount, totalTime, lastVisit: iso("2026-10-17", "12:00") });
const places = [
  P(1, "00990 Koivukuja 8", "apartments", "Espoo", 66, 43740),
  P(2, "00990 Esimerkkitie 2", "house", "Espoo", 64, 52080),
  P(3, "City library", "library", "Espoo", 51, 690180),
  P(4, "Keilaniemi", "station", "Espoo", 44, 41040),
  P(5, "00990 Mallikatu 1", "house", "Helsinki", 29, 20940),
  P(6, "K-Supermarket", "supermarket", "Espoo", 28, 18180),
  P(7, "Lauttasaaren seura", "yes", "Helsinki", 27, 25200),
  P(8, "Cafe Regatta", "cafe", "Helsinki", 14, 9100),
  P(9, "University campus", "university", "Espoo", 12, 51000),
  P(10, "Töölönlahti park", "park", "Helsinki", 9, 7400),
  P(11, "Bierhuis Rotterdam", "pub", "Helsinki", 6, 14200),
  P(12, "Neulanen", "restaurant", "Tampere", 3, 4300),
];

const day = (date: string) => ({
  day: {
    date,
    items: [
      { kind: "visit", visit: { id: 1, placeName: "00990 Esimerkkitie 2", name: null, startedAt: iso(date, "06:40"), endedAt: iso(date, "08:25"), duration: 6300 } },
      { kind: "move", track: { id: 1, startedAt: iso(date, "08:25"), endedAt: iso(date, "08:41"), distance: 1900, duration: 960, mode: "walking" } },
      { kind: "visit", visit: { id: 2, placeName: "Keilaniemi", name: null, startedAt: iso(date, "08:41"), endedAt: iso(date, "08:46"), duration: 300 } },
      { kind: "move", track: { id: 2, startedAt: iso(date, "08:46"), endedAt: iso(date, "09:04"), distance: 9400, duration: 1080, mode: "train" } },
      { kind: "visit", visit: { id: 3, placeName: "City library", name: null, startedAt: iso(date, "09:12"), endedAt: iso(date, "15:30"), duration: 22680 } },
      { kind: "move", track: { id: 3, startedAt: iso(date, "15:30"), endedAt: iso(date, "16:12"), distance: 22700, duration: 2520, mode: "cycling" } },
      { kind: "visit", visit: { id: 4, placeName: null, name: null, startedAt: iso(date, "16:20"), endedAt: iso(date, "16:42"), duration: 1320 } },
      { kind: "move", track: { id: 4, startedAt: iso(date, "16:42"), endedAt: iso(date, "17:30"), distance: 12400, duration: 2880, mode: "running" } },
    ],
  },
  dates: ["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"],
  minDate: "2026-03-13",
  maxDate: "2026-10-18",
});

function respond(path: string): unknown {
  if (scenario === "empty") {
    if (path.startsWith("/api/places")) return { places: [] };
    if (path.startsWith("/api/timeline")) return { day: { date: "2026-10-18", items: [] }, dates: ["2026-10-18"] };
    if (path.startsWith("/api/overview"))
      return { totals: { points: 0, visits: 0, tracks: 0, days: 0, totalKm: 0, first: null, last: null }, months: [], cities: [], recent: [] };
  }
  if (path.startsWith("/api/overview")) return overview;
  if (path.startsWith("/api/places")) return { places };
  if (path.startsWith("/api/timeline")) {
    const m = /date=([\d-]+)/.exec(path);
    return day(m?.[1] ?? "2026-10-18");
  }
  return null;
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const m = /^https:\/\/matka\.internal(\/api\/[^?]*(?:\?.*)?)$/.exec(url);
  if (!m) return realFetch(input, init);
  if (scenario === "slow") await new Promise((r) => setTimeout(r, 120000));
  if (scenario === "error") return new Response("boom", { status: 502 });
  await new Promise((r) => setTimeout(r, 150));
  return new Response(JSON.stringify(respond(m[1])), { status: 200, headers: { "Content-Type": "application/json" } });
};
