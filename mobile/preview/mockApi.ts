// Mock Matka API for the browser preview, in the server's response shapes
// (docs/API.md, web/src/app/api/**). The preview is paired with this page's
// origin (mocks/secure-store.ts); `fetch` calls to <origin>/api/… are answered
// here, and photos (/api/immich/asset/:id) come from the dev server (metro.config.js).
// ?scenario=empty|error|slow switches state.
import { params } from "./mocks/params";

const scenario = params.get("scenario") ?? "ok";

// ---- helpers ---------------------------------------------------------------

type Obj = Record<string, unknown>;
/** Local (Helsinki summer, +03:00) wall time → the UTC ISO instant the server sends. */
const at = (date: string, hm: string) => new Date(`${date}T${hm}:00+03:00`).toISOString();
const secs = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 1000);
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const addMonths = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
/** Deterministic 0..1 from a string, so a day or month always looks the same. */
const rand = (s: string) => {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};
const uuid = (n: number) => `${String(n).padStart(8, "0")}-4b1d-4c0a-9e2f-${String(n * 7919).padStart(12, "0")}`;

const SUMMARY_MODES = ["walking", "running", "cycling", "driving", "motorcycle", "bus", "tram", "metro", "train", "boat", "flying"];

// ---- places ----------------------------------------------------------------

type PlaceRow = { id: number; name: string | null; category: string | null; city: string | null; country: string | null; lat: number; lon: number; visitCount: number; totalTime: number; lastVisit: string | null; kind: string | null };
const P = (id: number, name: string | null, category: string | null, city: string | null, country: string | null, visitCount: number, totalTime: number, lastVisit: string, lat = 60.18, lon = 24.83): PlaceRow =>
  ({ id, name, category, city, country, lat, lon, visitCount, totalTime, lastVisit: at(lastVisit, "12:00"), kind: SAVED[id] ?? null });
/** Saved on the web Places page (home, family, school, work, other). */
const SAVED: Record<number, string> = { 1: "family", 9: "school", 13: "work", 2: "home" };

/** Roughly where each place is (Helsinki region unless abroad), so "Missing travel" can be worked out. */
const COORDS: Record<number, [number, number]> = {
  1: [60.2410, 24.7105], 2: [60.2930, 24.6650], 3: [60.1846, 24.8270], 4: [60.1758, 24.8289], 5: [60.1591, 24.8706],
  6: [60.1856, 24.8113], 7: [60.1597, 24.8788], 8: [60.1716, 24.9246], 9: [60.1867, 24.8286], 10: [60.1789, 24.9364],
  11: [60.1677, 24.9446], 12: [61.4978, 23.7610], 13: [60.1691, 24.9325], 14: [61.5034, 23.7724], 15: [61.4960, 23.7735],
  16: [38.6976, -9.2033], 17: [38.7139, -9.1334], 18: [38.7131, -9.1446], 19: [38.7876, -9.3906], 20: [66.5436, 25.8473],
  21: [69.0447, 20.8005], 22: [59.4400, 24.7281], 23: [59.3178, 18.0859], 24: [60.1868, 24.8352], 25: [65.0101, 25.4836],
  26: [60.2350, 24.6020],
};
const places: PlaceRow[] = [
  P(2, "00990 Esimerkkitie 2", "house", "Espoo", "Finland", 164, 2_052_080, "2026-10-18"),
  P(1, "00990 Koivukuja 8", "apartments", "Espoo", "Finland", 66, 143_740, "2026-10-12"),
  P(3, "City library", "library", "Espoo", "Finland", 51, 690_180, "2026-10-18"),
  P(4, "Keilaniemi", "station", "Espoo", "Finland", 44, 41_040, "2026-10-17"),
  P(13, "Kamppi Center", "mall", "Helsinki", "Finland", 31, 61_200, "2026-10-18"),
  P(5, "00990 Mallikatu 1", "house", "Helsinki", "Finland", 29, 20_940, "2026-10-10"),
  P(6, "K-Supermarket", "supermarket", "Espoo", "Finland", 28, 18_180, "2026-10-17"),
  P(7, "Lauttasaaren Urheilu- ja Uimahallin pysäköintialue (itäinen sisäänkäynti)", "parking", "Helsinki", "Finland", 27, 25_200, "2026-10-17"),
  P(8, "Cafe Regatta", "cafe", "Helsinki", "Finland", 14, 9_100, "2026-10-18"),
  P(9, "University campus", "university", "Espoo", "Finland", 12, 51_000, "2026-10-14"),
  P(10, "Töölönlahti park", "park", "Helsinki", "Finland", 9, 7_400, "2026-09-28"),
  P(11, "Bierhuis Rotterdam", "pub", "Helsinki", "Finland", 6, 14_200, "2026-09-20"),
  P(12, "Neulanen", "restaurant", "Tampere", "Finland", 3, 4_300, "2026-10-03"),
  P(14, "Tampere-talo", "theatre", "Tampere", "Finland", 2, 9_800, "2026-10-03"),
  P(15, "Hotel Torni", "hotel", "Tampere", "Finland", 2, 97_000, "2026-10-04"),
  P(16, "Pastéis de Belém", "bakery", "Lisbon", "Portugal", 2, 3_100, "2026-08-09"),
  P(17, "Castelo de São Jorge", "castle", "Lisbon", "Portugal", 1, 7_900, "2026-08-08"),
  P(18, "Casa do Bairro Alto", "guest_house", "Lisbon", "Portugal", 5, 340_000, "2026-08-12"),
  P(19, "Palácio da Pena", "castle", "Sintra", "Portugal", 1, 10_800, "2026-08-10"),
  P(20, "Santa Claus Village", "attraction", "Rovaniemi", "Finland", 2, 8_400, "2026-07-11"),
  P(21, "Kilpisjärvi Hiking Centre", "hostel", "Enontekiö", "Finland", 2, 120_000, "2026-07-17"),
  P(22, "Telliskivi Creative City", "arts_centre", "Tallinn", "Estonia", 1, 9_600, "2026-06-20"),
  P(23, "Fotografiska", "museum", "Stockholm", "Sweden", 1, 7_200, "2026-05-02"),
  P(24, null, null, "Espoo", "Finland", 4, 3_000, "2026-10-18"),
  P(25, "Oulu railway station", "station", "Oulu", "Finland", 2, 1_400, "2025-12-27"),
  P(26, "Unknown Location", null, null, null, 3, 2_100, "2026-09-02"),
];
for (const p of places) [p.lat, p.lon] = COORDS[p.id] ?? [p.lat, p.lon];
// The server's order: saved places first, then most visited.
places.sort((a, b) => Number(!!b.kind) - Number(!!a.kind) || b.visitCount - a.visitCount || (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""));
const placeById = new Map(places.map((p) => [p.id, p]));
const placeJson = ({ lat: _lat, lon: _lon, ...p }: PlaceRow) => p;

// ---- timeline --------------------------------------------------------------

type Leg = { kind: string; lines: string[]; fromStop: string | null; toStop: string | null; startedAt: string; endedAt: string; distance: number };
type Wait = { startedAt: string; endedAt: string; stop: string | null };
type Item = { kind: "visit"; visit: Obj } | { kind: "move"; track: Obj };

// Ids restart per day (dayItems), so the same day always has the same ids (photos are keyed by them).
let seq = 1000;
/** OSM key per category, for the place icon (amenity, shop…). */
const OSM_KEY: Record<string, string> = { library: "amenity", cafe: "amenity", mall: "shop", supermarket: "shop", station: "railway", park: "leisure", pub: "amenity", restaurant: "amenity", university: "amenity", house: "building", apartments: "building", theatre: "amenity", hotel: "tourism", castle: "historic", museum: "tourism", parking: "amenity" };
function visit(placeId: number, from: string, to: string, extra: Obj = {}): Item {
  const p = placeById.get(placeId)!;
  return {
    kind: "visit",
    visit: {
      id: seq++, startedAt: from, endedAt: to, duration: secs(from, to), placeId, placeName: p.name ?? "Unknown Location", category: p.category,
      placeKind: p.kind, osmKey: p.category ? (OSM_KEY[p.category] ?? null) : null, lat: p.lat, lon: p.lon, ...extra,
    },
  };
}
function move(mode: string, from: string, to: string, distance: number, extra: { legs?: Leg[]; waits?: Wait[] } & Obj = {}): Item {
  return { kind: "move", track: { id: seq++, startedAt: from, endedAt: to, distance, duration: secs(from, to), mode, ...extra } };
}
const leg = (kind: string, lines: string[], fromStop: string | null, toStop: string | null, from: string, to: string, distance: number): Leg =>
  ({ kind, lines, fromStop, toStop, startedAt: from, endedAt: to, distance });

const FIRST_DATE = "2025-11-02";
const LAST_DATE = "2026-10-18";

/** Every day with data: all days in range except a few holes (phone off, quiet days). */
const dates: string[] = [];
for (let d = FIRST_DATE; d <= LAST_DATE; d = addDays(d, 1)) if (d === LAST_DATE || rand(`hole${d}`) > 0.12) dates.push(d);
if (dates.includes("2026-10-16")) dates.splice(dates.indexOf("2026-10-16"), 1); // a hole right next to "today"

function dayItems(d: string): Item[] {
  seq = 1000 + Math.max(0, dates.indexOf(d)) * 40;
  const a = (hm: string) => at(d, hm);
  if (d === "2026-10-18") {
    return [
      visit(2, at(addDays(d, -1), "22:05"), a("08:20")),
      move("walking", a("08:20"), a("08:31"), 820),
      move("bus", a("08:31"), a("09:02"), 11_240, {
        legs: [
          leg("bus", ["550"], "Esimerkkitie", "Ruskeasuo", a("08:33"), a("08:47"), 6_900),
          leg("metro", ["M1", "M2"], "Kamppi", "Rautatientori", a("08:55"), a("08:58"), 1_200),
        ],
        waits: [{ startedAt: a("08:48"), endedAt: a("08:54"), stop: "Kamppi" }],
      }),
      visit(13, a("09:05"), a("11:40")),
      // Kamppi → Cafe Regatta with nothing recorded between: "Missing travel".
      visit(8, a("13:30"), a("14:15"), {
        candidates: [
          { name: "Cafe Regatta", category: "cafe", address: false },
          { name: "Sibelius Monument", category: "artwork", address: false },
          { name: "Merikannontie 8", category: null, address: true },
        ],
      }),
      move("cycling", a("14:15"), a("14:52"), 9_800),
      visit(3, a("14:55"), a("17:20")),
      move("walking", a("17:20"), a("17:24"), 6_400), // GPS drift: 96 km/h on foot
      visit(24, a("17:30"), a("17:52")),
      move("tram", a("17:55"), a("18:20"), 5_300, { correctionId: 41, legs: [leg("tram", ["4", "4T", "10"], "Lasipalatsi", "Munkkiniemi", a("17:57"), a("18:18"), 4_900)] }),
      move("stationary", a("18:20"), a("18:30"), 30),
      visit(2, a("18:35"), at(addDays(d, 1), "07:10")),
    ];
  }
  if (d === "2026-10-17") {
    return [
      visit(2, at(addDays(d, -1), "23:10"), a("09:40")),
      move("driving", a("09:40"), a("10:05"), 14_300),
      visit(7, a("10:05"), a("12:10")),
      move("boat", a("12:20"), a("12:40"), 2_900, { legs: [leg("boat", ["19"], "Kauppatori", "Suomenlinna", a("12:20"), a("12:40"), 2_900)] }),
      visit(4, a("13:00"), a("13:05")),
      move("metro", a("13:05"), a("13:20"), 8_400, { legs: [leg("metro", ["M1"], null, null, a("13:06"), a("13:19"), 8_300)], waits: [] }),
      visit(6, a("16:55"), a("17:18")),
      move("walking", a("17:18"), a("17:38"), 1_200, { correctionId: 42, added: true, from: { lat: 60.1856, lon: 24.8113 }, to: { lat: 60.2930, lon: 24.6650 } }),
      move("running", a("17:40"), a("18:28"), 9_100),
      visit(2, a("18:35"), a("22:05")),
    ];
  }
  const trip = trips.find((t) => d >= t.startDate && d <= t.endDate);
  if (trip?.id === "2026-08-07" && (d === trip.startDate || d === trip.endDate)) {
    const out = d === trip.startDate;
    return [
      visit(out ? 2 : 18, at(addDays(d, -1), "22:00"), a("07:30")),
      move(out ? "train" : "driving", a("07:30"), a("08:10"), 21_000),
      move("flying", a("09:40"), a("14:05"), 3_390_000),
      move(out ? "metro" : "train", a("14:30"), a("15:05"), out ? 7_200 : 21_000),
      visit(out ? 18 : 2, a("15:20"), at(addDays(d, 1), "07:00")),
    ];
  }
  if (trip) {
    const city = trip.cities.find((c) => c.away)!;
    const local = places.filter((p) => p.city === city.city);
    const stay = local[0] ?? placeById.get(24)!;
    const sight = local[1] ?? placeById.get(24)!;
    return [
      visit(stay.id, at(addDays(d, -1), "21:30"), a("09:15")),
      move("walking", a("09:15"), a("09:48"), 2_600),
      visit(sight.id, a("09:50"), a("12:40")),
      move(rand(d) > 0.5 ? "tram" : "bus", a("12:45"), a("13:10"), 4_800),
      move("walking", a("13:10"), a("13:30"), 1_300),
      visit(stay.id, a("21:30"), at(addDays(d, 1), "09:00")),
    ];
  }
  // An ordinary weekday at home.
  const r = rand(d);
  const commute = r < 0.35 ? "cycling" : r < 0.7 ? "bus" : "driving";
  return [
    visit(2, at(addDays(d, -1), "22:30"), a("07:50")),
    move(commute, a("07:50"), a("08:20"), commute === "cycling" ? 6_200 : 7_900),
    visit(r > 0.5 ? 9 : 3, a("08:22"), a("16:05")),
    move("walking", a("16:05"), a("16:20"), 1_100),
    visit(6, a("16:20"), a("16:44")),
    move(commute, a("16:50"), a("17:20"), commute === "cycling" ? 6_200 : 8_400),
    visit(2, a("17:22"), at(addDays(d, 1), "07:40")),
  ];
}

function timeline(date: string | null) {
  const d = date ?? LAST_DATE;
  return { day: { date: d, items: dates.includes(d) ? dayItems(d) : [] }, dates, minDate: dates[0], maxDate: LAST_DATE };
}

type ModeTotal = { mode: string; distance: number; duration: number; count: number };
function totalsByMode(items: Item[]): ModeTotal[] {
  const by = new Map<string, ModeTotal>();
  for (const it of items) {
    if (it.kind !== "move") continue;
    const t = it.track as { mode: string; distance: number; duration: number };
    if (t.mode === "stationary") continue;
    const m = by.get(t.mode) ?? { mode: t.mode, distance: 0, duration: 0, count: 0 };
    m.distance += t.distance;
    m.duration += t.duration;
    m.count += 1;
    by.set(t.mode, m);
  }
  return [...by.values()].sort((a, b) => b.distance - a.distance || b.duration - a.duration);
}

function daySummary(date: string) {
  const modes = dates.includes(date) ? totalsByMode(dayItems(date)) : [];
  return { date, distance: modes.reduce((a, m) => a + m.distance, 0), duration: modes.reduce((a, m) => a + m.duration, 0), modes };
}

// ---- trips -----------------------------------------------------------------

type TripCity = { city: string; country: string | null; duration: number; firstSeen: string; away: boolean };
type TripRow = {
  id: string; name: string; startDate: string; endDate: string; days: number; nights: number;
  departure: string; arrival: string | null; cities: TripCity[]; countries: string[];
  distance: number; duration: number; modes: ModeTotal[]; cover: string | null; photos: number;
};
const T = (startDate: string, endDate: string, name: string, cities: [string, string, number][], main: [string, number, number][], cover: number | null, photos: number): TripRow => {
  const days = secs(at(startDate, "12:00"), at(endDate, "12:00")) / 86400 + 1;
  const modes = main.map(([mode, km, h]) => ({ mode, distance: km * 1000, duration: Math.round(h * 3600), count: Math.max(1, Math.round(h)) }));
  return {
    id: startDate, name, startDate, endDate, days, nights: days - 1,
    departure: at(startDate, "07:30"), arrival: at(endDate, "18:40"),
    cities: [
      { city: "Espoo", country: "Finland", duration: 5400, firstSeen: at(startDate, "07:00"), away: false },
      ...cities.map(([city, country, h], i) => ({ city, country, duration: h * 3600, firstSeen: at(addDays(startDate, i), "15:00"), away: true })),
    ],
    countries: [...new Set(cities.map((c) => c[1]))],
    distance: modes.reduce((a, m) => a + m.distance, 0),
    duration: modes.reduce((a, m) => a + m.duration, 0),
    modes, cover: cover == null ? null : uuid(cover), photos,
  };
};
const trips: TripRow[] = [
  T("2026-10-02", "2026-10-04", "Tampere", [["Tampere", "Finland", 50]], [["train", 352, 3.4], ["walking", 21, 5.2], ["bus", 8, 0.5]], 1, 4),
  T("2026-08-07", "2026-08-12", "Lisbon and Sintra", [["Lisbon", "Portugal", 102], ["Sintra", "Portugal", 9]], [["flying", 6780, 9], ["walking", 62, 15], ["tram", 14, 1.4], ["metro", 22, 1.1], ["train", 56, 1.5]], 2, 8),
  T("2026-07-10", "2026-07-19", "Lapland road trip: Rovaniemi, Inari, Utsjoki and Kilpisjärvi", [["Rovaniemi", "Finland", 40], ["Inari", "Finland", 30], ["Utsjoki", "Finland", 20], ["Enontekiö", "Finland", 60], ["Kittilä", "Finland", 10]], [["driving", 2510, 31], ["walking", 48, 14], ["boat", 6, 0.6]], null, 0),
  T("2026-06-20", "2026-06-21", "Tallinn", [["Tallinn", "Estonia", 26]], [["boat", 166, 4.4], ["walking", 18, 4]], 3, 3),
  T("2026-05-01", "2026-05-03", "Stockholm", [["Stockholm", "Sweden", 46]], [["boat", 830, 33], ["metro", 19, 1], ["walking", 24, 6]], 4, 6),
  T("2025-12-23", "2025-12-27", "Oulu", [["Oulu", "Finland", 100]], [["train", 1210, 11.5], ["driving", 34, 0.9], ["walking", 11, 3]], 5, 2),
];
const tripJson = ({ photos: _p, ...t }: TripRow) => t;

function tripDetail(id: string) {
  const t = trips.find((x) => x.id === id);
  if (!t) return null;
  const dayList = [];
  for (let d = t.startDate; d <= t.endDate; d = addDays(d, 1)) {
    const s = daySummary(d);
    const here = t.cities.filter((c) => c.away).map((c) => c.city);
    dayList.push({ date: d, distance: s.distance, duration: s.duration, modes: s.modes, cities: d === t.startDate || d === t.endDate ? ["Espoo", here[0]] : here.slice(0, 2) });
  }
  return { trip: { ...tripJson(t), dayList, photos: Array.from({ length: t.photos }, (_, i) => uuid(100 + i + trips.indexOf(t) * 10)) } };
}

// ---- insights --------------------------------------------------------------

const FIRST_MONTH = FIRST_DATE.slice(0, 7);
const LAST_MONTH = LAST_DATE.slice(0, 7);
/** Typical km per month per mode; scaled by a per-month factor. */
const MONTHLY: Record<string, number> = { walking: 70, running: 30, cycling: 140, driving: 260, bus: 120, tram: 25, metro: 60, train: 90 };

function monthTotals(month: string): ModeTotal[] {
  if (month < FIRST_MONTH || month > LAST_MONTH) return [];
  const out: ModeTotal[] = [];
  for (const mode of SUMMARY_MODES) {
    let km = (MONTHLY[mode] ?? 0) * (0.5 + rand(`${mode}${month}`));
    if (mode === "cycling" && /-(11|12|01|02)$/.test(month)) km = 0; // no winter cycling
    if (mode === "running" && rand(`run${month}`) < 0.3) km = 0;
    for (const t of trips) if (t.startDate.slice(0, 7) === month) km += (t.modes.find((m) => m.mode === mode)?.distance ?? 0) / 1000;
    if (km <= 0) continue;
    const kmh: Record<string, number> = { walking: 4.8, running: 10, cycling: 17, driving: 55, motorcycle: 60, bus: 24, tram: 15, metro: 35, train: 90, boat: 25, flying: 700 };
    out.push({ mode, distance: Math.round(km * 1000), duration: Math.round((km / (kmh[mode] ?? 20)) * 3600), count: Math.max(1, Math.round(km / 5)) });
  }
  return out;
}

function monthModes(month: string | null) {
  const m = month ?? LAST_MONTH;
  const historyMonths = Array.from({ length: 6 }, (_, i) => addMonths(m, i - 5));
  const hist = historyMonths.map((hm) => monthTotals(hm));
  const used = SUMMARY_MODES.filter((mode) => hist.some((h) => h.some((x) => x.mode === mode)));
  const cur = hist[5];
  return {
    month: m,
    distance: cur.reduce((a, x) => a + x.distance, 0),
    duration: cur.reduce((a, x) => a + x.duration, 0),
    modes: used.map((mode) => {
      const x = cur.find((c) => c.mode === mode);
      return {
        mode, distance: x?.distance ?? 0, duration: x?.duration ?? 0, count: x?.count ?? 0,
        history: historyMonths.map((hm, i) => {
          const h = hist[i].find((c) => c.mode === mode);
          return { month: hm, distance: h?.distance ?? 0, duration: h?.duration ?? 0 };
        }),
      };
    }),
    historyMonths,
    firstMonth: FIRST_MONTH,
    lastMonth: LAST_MONTH,
  };
}

function savedMonth(month: string | null) {
  const m = month ?? LAST_MONTH;
  const k = rand(m);
  const live = m >= FIRST_MONTH && m <= LAST_MONTH;
  const rows = live
    ? [
        { placeId: 2, name: "Home", kind: "home", seconds: Math.round((420 + k * 80) * 3600), nights: 24 + Math.round(k * 5) },
        { placeId: 9, name: "University campus", kind: "school", seconds: Math.round((60 + k * 40) * 3600), nights: 0 },
        { placeId: 1, name: "Grandma's (the old family home in Koivula)", kind: "family", seconds: Math.round((8 + k * 30) * 3600), nights: k > 0.6 ? 2 : 0 },
        { placeId: 13, name: "Office", kind: "work", seconds: Math.round((30 + k * 20) * 3600), nights: 0 },
      ].sort((a, b) => b.seconds - a.seconds)
    : [];
  return { month: m, saved: 4, rows };
}

function sortWorld<T extends { name: string; places: number; visits: number; duration: number; lastVisit: string | null }>(list: T[], sort: string): T[] {
  const by: Record<string, (a: T, b: T) => number> = {
    visits: (a, b) => b.visits - a.visits,
    places: (a, b) => b.places - a.places,
    time: (a, b) => b.duration - a.duration,
    recent: (a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return [...list].sort((a, b) => (by[sort] ?? by.visits)(a, b) || a.name.localeCompare(b.name));
}

function world(sort: string) {
  type E = { name: string; country: string | null; places: number; visits: number; duration: number; lastVisit: string | null };
  const cities = new Map<string, E>();
  const countries = new Map<string, E & { cities: number }>();
  let unplaced = 0;
  for (const p of places) {
    if (!p.city && !p.country) {
      unplaced++;
      continue;
    }
    const add = (e: E) => {
      e.places += 1;
      e.visits += p.visitCount;
      e.duration += p.totalTime;
      if (p.lastVisit && (!e.lastVisit || p.lastVisit > e.lastVisit)) e.lastVisit = p.lastVisit;
    };
    if (p.city) {
      const k = `${p.city}/${p.country}`;
      if (!cities.has(k)) cities.set(k, { name: p.city, country: p.country, places: 0, visits: 0, duration: 0, lastVisit: null });
      add(cities.get(k)!);
    }
    if (p.country) {
      if (!countries.has(p.country)) countries.set(p.country, { name: p.country, country: null, places: 0, visits: 0, duration: 0, lastVisit: null, cities: 0 });
      add(countries.get(p.country)!);
    }
  }
  for (const c of countries.values()) c.cities = [...cities.values()].filter((x) => x.country === c.name).length;
  return {
    countries: sortWorld([...countries.values()].map(({ country: _c, ...rest }) => rest as E & { cities: number }), sort),
    cities: sortWorld([...cities.values()], sort),
    unplaced,
  };
}

function overview() {
  const months = Array.from({ length: 12 }, (_, i) => addMonths(LAST_MONTH, i - 11)).map((m) => ({
    year: Number(m.slice(0, 4)),
    month: Number(m.slice(5, 7)),
    distance: monthTotals(m).reduce((a, x) => a + x.distance, 0),
  }));
  const recent = dayItems(LAST_DATE)
    .concat(dayItems("2026-10-17"))
    .filter((i) => i.kind === "visit")
    .map((i) => i.visit as { id: number; placeId: number; placeName: string; startedAt: string; duration: number })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 8)
    .map((v) => ({ id: v.id, placeId: v.placeId, name: v.placeName === "Unknown Location" ? null : v.placeName, startedAt: v.startedAt, duration: v.duration }));
  return {
    totals: { points: 113_871, visits: 1_440, trips: 912, days: dates.length, distance: months.reduce((a, m) => a + m.distance, 0), first: at(FIRST_DATE, "08:00"), last: at(LAST_DATE, "23:58") },
    months,
    topPlaces: [...places].sort((a, b) => b.totalTime - a.totalTime).slice(0, 8).map((p) => ({ id: p.id, name: p.name, hours: p.totalTime / 3600 })),
    recent,
  };
}

// ---- routing ---------------------------------------------------------------

type Reply = { status?: number; body: unknown };

function emptyReply(path: string, q: URLSearchParams): Reply | null {
  if (path === "/api/places") return { body: { places: [] } };
  if (path === "/api/timeline") return { body: { day: { date: q.get("date") ?? "", items: [] }, dates: [], minDate: null, maxDate: null } };
  if (path === "/api/overview") return { body: { totals: { points: 0, visits: 0, trips: 0, days: 0, distance: 0, first: null, last: null }, months: [], topPlaces: [], recent: [] } };
  if (path === "/api/day-summary") return { body: { date: q.get("date"), distance: 0, duration: 0, modes: [] } };
  if (path === "/api/insights/modes") {
    const m = q.get("month") ?? LAST_MONTH;
    return { body: { month: m, distance: 0, duration: 0, modes: [], historyMonths: Array.from({ length: 6 }, (_, i) => addMonths(m, i - 5)), firstMonth: null, lastMonth: null } };
  }
  if (path === "/api/insights/saved") return { body: { month: q.get("month") ?? LAST_MONTH, saved: 0, rows: [] } };
  if (path === "/api/timeline/photos") return { body: { configured: false, pending: false, linkBase: null, items: [] } };
  if (path === "/api/search") return { body: { query: q.get("q") ?? "", places: [], areas: [] } };
  if (path === "/api/insights/trips") return { body: { home: null, trips: [] } };
  if (path === "/api/insights/world") return q.get("city") ? { body: { city: q.get("city"), country: q.get("country"), places: [] } } : { body: { countries: [], cities: [], unplaced: 0 } };
  return null;
}

/** Photos taken during the day's visits and trips (GET /api/timeline/photos). */
function dayPhotos(date: string) {
  const items = dates.includes(date) ? dayItems(date) : [];
  const out: { key: string; ids: string[]; total: number }[] = [];
  items.forEach((it, i) => {
    const r = rand(`photo${date}${i}`);
    if (it.kind === "visit" ? r < 0.45 : r < 0.15) {
      const id = it.kind === "visit" ? (it.visit.id as number) : (it.track.id as number);
      const total = 1 + Math.floor(rand(`n${date}${i}`) * 10);
      out.push({ key: `${it.kind === "visit" ? "v" : "m"}-${id}`, ids: Array.from({ length: Math.min(6, total) }, (_, k) => uuid(500 + i * 10 + k)), total });
    }
  });
  return { configured: true, pending: false, linkBase: "https://photos.example.com", items: out };
}

const fold = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** GET /api/search: places by name, street, city or category, and matching cities and countries. */
function search(query: string) {
  const q = fold(query.trim());
  const hits = places.filter((p) => p.visitCount > 0 && [p.name ?? "", p.city ?? "", p.country ?? "", p.category ?? ""].some((x) => fold(x).includes(q)));
  const w = world("visits");
  const areas = [
    ...w.cities.filter((c) => fold(c.name).includes(q)).map((c) => ({ type: "city", ...c })),
    ...w.countries.filter((c) => fold(c.name).includes(q)).map((c) => ({ type: "country", ...c, country: null })),
  ];
  return {
    query,
    places: hits.slice(0, 20).map((p) => {
      const last = (p.lastVisit ?? "").slice(0, 10) || null;
      return {
        ...placeJson(p),
        firstVisit: at("2025-11-02", "10:00"),
        lastVisitDate: last,
        recentDates: last ? [last, addDays(last, -3), addDays(last, -9)].filter((d) => dates.includes(d)) : [],
        match: p.name && fold(p.name).includes(q) ? "name" : p.category && fold(p.category).includes(q) ? "category" : "area",
      };
    }),
    areas,
  };
}

const ROUTES = [
  { line: "550", kind: "bus", name: "Itäkeskus–Westendinasema" }, { line: "551", kind: "bus", name: "Otaniemi–Pasila" },
  { line: "102", kind: "bus", name: "Kamppi–Otaniemi" }, { line: "102N", kind: "bus", name: "Kamppi–Otaniemi (night)" },
  { line: "M1", kind: "metro", name: "Kivenlahti–Vuosaari" }, { line: "M2", kind: "metro", name: "Tapiola–Mellunmäki" },
  { line: "4", kind: "tram", name: "Munkkiniemi–Katajanokka" }, { line: "10", kind: "tram", name: "Kirurgi–Pikku Huopalahti" },
  { line: "15", kind: "tram", name: "Keilaniemi–Itäkeskus" }, { line: "A", kind: "train", name: "Helsinki–Leppävaara" },
  { line: "19", kind: "boat", name: "Kauppatori–Suomenlinna" },
];
const STOPS = ["Kamppi", "Kaisaniemi", "Kalasatama", "Keilaniemi", "Koivusaari", "Lasipalatsi", "Rautatientori", "Ruskeasuo", "Tapiola", "Esimerkkitie"];

function reply(method: string, path: string, q: URLSearchParams, body: string | null): Reply {
  if (path === "/api/corrections" && method === "POST") return { body: { correction: { id: 99 } } };
  if (/^\/api\/corrections\/\d+$/.test(path) && method === "DELETE") return { body: { ok: true } };
  if (/^\/api\/places\/\d+\/confirm$/.test(path) && method === "POST") return { body: { ok: true } };
  if (path === "/api/transit/routes") {
    const t = (q.get("q") ?? "").toUpperCase();
    return { body: { routes: ROUTES.filter((r) => r.line.toUpperCase().startsWith(t)) } };
  }
  if (path === "/api/transit/stops") {
    const t = fold(q.get("q") ?? "");
    return { body: { stops: STOPS.filter((x) => fold(x).startsWith(t)) } };
  }
  if (path === "/api/ingest") {
    if (method === "POST") {
      const n = (JSON.parse(body ?? "{}") as { points?: unknown[] }).points?.length ?? 0;
      return { body: { received: n, inserted: n, duplicates: 0, rejected: 0 } };
    }
    return { body: { ok: true, device: "Pixel 8", points: 113_871, last: new Date(Date.now() - 4 * 60_000).toISOString() } };
  }
  if (path === "/api/device/embed-ticket") return { body: { url: `${location.origin}/embed/start?ticket=preview` } };
  if (scenario === "empty") {
    const r = emptyReply(path, q);
    if (r) return r;
  }
  switch (path) {
    case "/api/overview":
      return { body: overview() };
    case "/api/places":
      return { body: { places: places.map(placeJson) } };
    case "/api/timeline":
      return { body: timeline(q.get("date")) };
    case "/api/timeline/photos":
      return { body: dayPhotos(q.get("date") ?? LAST_DATE) };
    case "/api/search":
      return { body: search(q.get("q") ?? "") };
    case "/api/day-summary":
      return { body: daySummary(q.get("date") ?? LAST_DATE) };
    case "/api/insights/modes":
      return { body: monthModes(q.get("month")) };
    case "/api/insights/saved":
      return { body: savedMonth(q.get("month")) };
    case "/api/insights/trips":
      return { body: { home: { lat: 60.293, lon: 24.665, nights: 290, city: "Espoo", country: "Finland", saved: ["Home"] }, trips: trips.map(tripJson) } };
    case "/api/insights/world": {
      const city = q.get("city");
      if (city) {
        const country = q.get("country");
        const list = places.filter((p) => p.city === city && (!country || p.country === country)).sort((a, b) => b.visitCount - a.visitCount);
        return { body: { city, country, places: list.map(placeJson) } };
      }
      return { body: world(q.get("sort") ?? "visits") };
    }
  }
  const trip = /^\/api\/insights\/trips\/(\d{4}-\d{2}-\d{2})$/.exec(path);
  if (trip) {
    const t = tripDetail(trip[1]);
    return t ? { body: t } : { status: 404, body: { error: "not found" } };
  }
  return { status: 404, body: { error: "not found" } };
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return realFetch(input, init);
  if (scenario === "slow") await new Promise((r) => setTimeout(r, 120000));
  if (scenario === "error") return new Response("<html>Bad gateway</html>", { status: 502 });
  await new Promise((r) => setTimeout(r, 150 + Math.random() * 250));
  const r = reply((init?.method ?? "GET").toUpperCase(), url.pathname, url.searchParams, typeof init?.body === "string" ? init.body : null);
  return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
};
