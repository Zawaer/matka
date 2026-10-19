#!/usr/bin/env node
// DEV ONLY. Fills a local Matka database with ~3 months of made-up but
// realistic location history around Helsinki, for trying the UI and for QA:
//
//   - a home in Matinkylä (Espoo) and a family home in Vantaa (every other
//     weekend there, Friday evening to Sunday)
//   - weekdays at a university campus from mid-August (summer holiday
//     before that), by metro, bus or bike, lunch on campus, gym or groceries
//   - weekends in central Helsinki (cafés, Oodi, Kamppi, the market square, a
//     ferry to Suomenlinna), runs along the shore, lazy days at home
//   - away trips: a train to Tampere (2 nights), a ferry to Tallinn (2 nights)
//     and a flight to Berlin (4 nights)
//   - collector-like sampling: a fix every 30 s – 2 min when moving, a few
//     fixes on arrival and then near-silence while still, occasional 60–150 m
//     fixes, sparse fixes in the metro tunnel, a day and a half with the phone
//     off and an afternoon with recording off; motion activity tags from the
//     middle of the range on (as if the phone app started sending them then)
//
// Deterministic: the same --seed, --end and --days give the same points.
// The known spots are inserted as places up front with a name, city and
// country (there is no Photon locally), so the worker's visits snap to them;
// other stops (stations, the airport gate) stay unnamed unless filled by
// scripts/dev-fill-cities.mjs.
//
//   DATABASE_URL=postgresql://… node scripts/seed-demo.mjs [options]
//
//   --user <oidc sub>   whose history (default key:owner, the key-mode owner;
//                       created if missing)
//   --end YYYY-MM-DD    last day (default today; points after now are dropped)
//   --days N            how many days (default 92)
//   --seed N            PRNG seed (default 1)
//   --reset             delete the user's points, visits, trips and places first
//   --save              save home, family home and campus as saved places
//                       (kinds home/family/school), as a user would
//   --wait              wait for the worker to process the points (run the app
//                       with its worker on), then print a summary
//
// Then start the app (npm run dev, or the standalone server) with the worker
// on (the default): it turns the points into visits and trips within a tick.
// Never run this against a real deployment.
import { parseArgs } from "node:util";
import pg from "pg";

const { values: args } = parseArgs({
  options: {
    user: { type: "string", default: "key:owner" },
    end: { type: "string" },
    days: { type: "string", default: "92" },
    seed: { type: "string", default: "1" },
    reset: { type: "boolean", default: false },
    save: { type: "boolean", default: false },
    wait: { type: "boolean", default: false },
  },
});
const fail = (msg) => {
  console.error(`seed-demo: ${msg}`);
  process.exit(1);
};
if (!process.env.DATABASE_URL) fail("DATABASE_URL is not set");
const TZ = "Europe/Helsinki";
const DAYS = Number(args.days);
if (!Number.isInteger(DAYS) || DAYS < 7 || DAYS > 400) fail("--days must be 7..400");
const SEED = Number(args.seed);
if (!Number.isInteger(SEED)) fail("--seed must be an integer");
const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const END = args.end ?? todayLocal;
if (!/^\d{4}-\d{2}-\d{2}$/.test(END)) fail("--end must be YYYY-MM-DD");
const NOW = Date.now() / 1000;

// ---------------------------------------------------------------- randomness

/** mulberry32: small, fast, good enough, and the same everywhere. */
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED * 2654435761);
const uni = (a, b) => a + (b - a) * rnd();
const chance = (p) => rnd() < p;
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const gauss = () => {
  const u = 1 - rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
};

// ---------------------------------------------------------------- geometry & time

const R = 6371000;
const rad = Math.PI / 180;
function dist([aLat, aLon], [bLat, bLon]) {
  const x = (bLon - aLon) * rad * Math.cos(((aLat + bLat) / 2) * rad);
  const y = (bLat - aLat) * rad;
  return Math.hypot(x, y) * R;
}
/** Moves a point by metres north/east. */
const offset = ([lat, lon], north, east) => [
  lat + north / R / rad,
  lon + east / (R * Math.cos(lat * rad)) / rad,
];

/** Offset of TZ from UTC at an instant, in seconds. */
function tzOffset(epochS) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(epochS * 1000))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc / 1000 - epochS;
}
/** Epoch seconds of a local wall-clock time on a YYYY-MM-DD day (hours may exceed 24). */
function at(day, hours) {
  const [y, m, d] = day.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d) / 1000 + Math.round(hours * 3600);
  let t = naive - tzOffset(naive);
  t = naive - tzOffset(t);
  return t;
}
function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const weekday = (day) => new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday

// ---------------------------------------------------------------- places

// [lat, lon], name, OSM-ish category, city, country, saved kind (with --save)
const P = {};
const place = (key, lat, lon, name, category, city, country = "Finland", kind = null, radius = null) =>
  (P[key] = { key, at: [lat, lon], name, category, city, country, kind, radius });

place("home", 60.1628, 24.729, "Home", "apartments", "Espoo", "Finland", "home");
place("family", 60.2603, 24.8512, "Family home", "house", "Vantaa", "Finland", "family");
place("school", 60.1867, 24.8213, "University campus", "university", "Espoo", "Finland", "school", 250);
place("lunch", 60.1849, 24.8327, "Dipoli", "restaurant", "Espoo");
place("gym", 60.1766, 24.8044, "Tapiola gym", "fitness_centre", "Espoo");
place("grocery", 60.1619, 24.7356, "K-Citymarket Iso Omena", "supermarket", "Espoo");
place("library", 60.1695, 24.7445, "Iso Omena library", "library", "Espoo");
place("regatta", 60.1829, 24.9093, "Café Regatta", "cafe", "Helsinki");
place("oodi", 60.1737, 24.9381, "Oodi", "library", "Helsinki");
place("kamppi", 60.1689, 24.932, "Kamppi", "mall", "Helsinki");
place("stockmann", 60.1686, 24.9419, "Stockmann", "department_store", "Helsinki");
place("ekberg", 60.1622, 24.9395, "Café Ekberg", "cafe", "Helsinki");
place("market", 60.1676, 24.9525, "Market Square", "marketplace", "Helsinki");
place("ateneum", 60.17, 24.9442, "Ateneum", "museum", "Helsinki");
place("hietsu", 60.1722, 24.9001, "Hietaniemi beach", "beach", "Helsinki");
place("suomenlinna", 60.1459, 24.9877, "Suomenlinna", "attraction", "Helsinki");
place("friend", 60.1987, 24.9585, "A friend's place", "apartments", "Helsinki");
place("tampere_hotel", 61.4954, 23.7598, "Hotel Tammer", "hotel", "Tampere");
place("sarkanniemi", 61.5049, 23.7433, "Särkänniemi", "theme_park", "Tampere");
place("pyynikki", 61.4944, 23.7318, "Pyynikki observation tower", "cafe", "Tampere");
place("tampere_market", 61.4958, 23.7778, "Tampere market hall", "marketplace", "Tampere");
place("tallinn_hotel", 59.4369, 24.7453, "Hotel Telegraaf", "hotel", "Tallinn", "Estonia");
place("telliskivi", 59.44, 24.729, "Telliskivi Creative City", "attraction", "Tallinn", "Estonia");
place("kadriorg", 59.4383, 24.7906, "Kadriorg Palace", "museum", "Tallinn", "Estonia");
place("rotermann", 59.4405, 24.7577, "Rotermann Quarter", "mall", "Tallinn", "Estonia");
place("berlin_hotel", 52.5219, 13.4132, "Hotel Alexanderplatz", "hotel", "Berlin", "Germany");
place("brandenburg", 52.5163, 13.3777, "Brandenburg Gate", "attraction", "Berlin", "Germany");
place("museumsinsel", 52.5169, 13.4019, "Museum Island", "museum", "Berlin", "Germany");
place("eastside", 52.505, 13.4397, "East Side Gallery", "attraction", "Berlin", "Germany");
place("kreuzberg", 52.4993, 13.4181, "Café in Kreuzberg", "cafe", "Berlin", "Germany");
place("airport", 60.3172, 24.9633, "Helsinki Airport", "aerodrome", "Vantaa");
place("ber", 52.3667, 13.5033, "Berlin Brandenburg Airport", "aerodrome", "Schönefeld", "Germany");

// Stations and stops (no visit: you pass through them).
const S = {
  matinkyla: [60.16, 24.7383],
  niittykumpu: [60.171, 24.763],
  urheilupuisto: [60.1757, 24.7853],
  tapiola: [60.1752, 24.8053],
  aalto: [60.1846, 24.8247],
  keilaniemi: [60.1755, 24.827],
  koivusaari: [60.163, 24.856],
  lauttasaari: [60.159, 24.879],
  ruoholahti: [60.1636, 24.915],
  kamppi: [60.1688, 24.9313],
  rautatientori: [60.1706, 24.9418],
  hki: [60.1719, 24.9414],
  pasila: [60.199, 24.934],
  homeStop: [60.1634, 24.7342],
  campusStop: [60.1857, 24.8262],
  westHarbour: [60.1497, 24.9155],
  dTerminal: [59.444, 24.771],
  tampere: [61.4985, 23.773],
};
const METRO_WEST = [S.matinkyla, S.niittykumpu, S.urheilupuisto, S.tapiola, S.aalto, S.keilaniemi, S.koivusaari, S.lauttasaari, S.ruoholahti, S.kamppi, S.rautatientori];
const metroBetween = (a, b) => {
  const i = METRO_WEST.indexOf(a);
  const j = METRO_WEST.indexOf(b);
  return i <= j ? METRO_WEST.slice(i, j + 1) : METRO_WEST.slice(j, i + 1).reverse();
};
const BUS_HOME_CAMPUS = [S.homeStop, [60.1661, 24.745], [60.1702, 24.7702], [60.1744, 24.7951], [60.179, 24.81], [60.1841, 24.82], S.campusStop];
const BUS_HOME_FAMILY = [S.homeStop, [60.1802, 24.7605], [60.2105, 24.7998], [60.2398, 24.8301], [60.2585, 24.849]];
const BIKE_HOME_CAMPUS = [P.home.at, [60.1655, 24.7465], [60.1712, 24.7688], [60.1749, 24.7905], [60.1771, 24.806], [60.1822, 24.8165], P.school.at];
const RUN_LOOP = [P.home.at, [60.1601, 24.7262], [60.1559, 24.7318], [60.1542, 24.7431], [60.1575, 24.7522], [60.1621, 24.7458], P.home.at];
const RAIL_HKI_TAMPERE = [S.hki, S.pasila, [60.2925, 25.044], [60.404, 25.105], [60.631, 24.86], [60.74, 24.773], [60.997, 24.466], [61.168, 23.867], [61.33, 23.77], S.tampere];
const RAIL_HKI_AIRPORT = [S.hki, S.pasila, [60.226, 24.877], [60.261, 24.855], [60.2915, 24.892], [60.302, 24.955], [60.3155, 24.9686]];
const FERRY_TALLINN = [S.westHarbour, [60.1402, 24.9201], [60.1255, 24.9452], [60.0801, 24.9601], [59.9, 24.9], [59.65, 24.82], [59.5, 24.79], [59.455, 24.772], S.dTerminal];
const FERRY_SUOMENLINNA = [[60.1672, 24.9535], [60.1625, 24.9597], [60.1548, 24.9725], [60.1488, 24.9842], [60.1465, 24.9868]];
const FLIGHT_HEL_BER = [P.airport.at, [60.25, 24.8], [59.5, 23.0], [57.5, 19.0], [55.0, 15.5], [53.0, 14.0], P.ber.at];
const S_BAHN_BER_MITTE = [P.ber.at, [52.39, 13.52], [52.45, 13.5], [52.4925, 13.4605], [52.5105, 13.4345], [52.5215, 13.4114]];

// ---------------------------------------------------------------- the simulator

/** Recorded fixes by epoch second (the database keeps one per user per second). */
const fixes = new Map();
let activityTags = false;
let battery = 90;

function emit(t, pos, { acc = uni(4, 16), speed = null, activity = null, noisy = false } = {}) {
  t = Math.round(t);
  if (t > NOW || fixes.has(t)) return;
  let a = acc;
  let p = pos;
  if (noisy) a = uni(60, 150);
  const err = a * 0.6;
  p = offset(p, gauss() * err, gauss() * err);
  fixes.set(t, {
    ts: t,
    lat: +p[0].toFixed(6),
    lon: +p[1].toFixed(6),
    accuracy: Math.round(a * 10) / 10,
    speed: speed == null ? null : Math.max(0, Math.round(speed * 100) / 100),
    activity: activityTags ? activity : null,
    battery: Math.round(battery),
  });
}

let t = 0; // simulation clock, epoch s
let here = null; // the place being stayed at, or a [lat, lon]
let fresh = true; // just arrived: the phone reports a few fixes as it settles
const posOf = (x) => (Array.isArray(x) ? x : x.at);

/** Stays at `here` until `until`: a few fixes on arrival, then near-silence. */
function stayUntil(until) {
  if (until <= t) return;
  const pos = posOf(here);
  const spot = offset(pos, gauss() * 12, gauss() * 12); // where in the building
  let s = t;
  const settle = fresh ? Math.min(until, t + uni(240, 420)) : t;
  fresh = false;
  while (s < settle) {
    emit(s, spot, { acc: uni(6, 25), speed: uni(0, 0.4), activity: "still", noisy: chance(0.04) });
    s += uni(45, 100);
  }
  // A still phone reports rarely: the odd wake-up, sometimes a bad fix.
  while (s < until - 600) {
    s += uni(25, 110) * 60;
    if (s >= until - 300) break;
    emit(s, spot, { acc: uni(8, 35), speed: 0, activity: "still", noisy: chance(0.12) });
  }
  // Night: the phone charges.
  const hours = (until - t) / 3600;
  battery = hours > 5 ? uni(92, 100) : Math.max(15, battery - hours * uni(1, 3));
  t = until;
}

const MODES = {
  walk: { v: [1.2, 1.5], dt: [30, 60], acc: [5, 15], activity: "walking" },
  run: { v: [2.7, 3.2], dt: [30, 45], acc: [4, 10], activity: "running" },
  bike: { v: [4.2, 5.5], dt: [30, 50], acc: [4, 12], activity: "on_bicycle" },
  bus: { v: [6.5, 9], dt: [40, 80], acc: [6, 20], activity: "in_vehicle" },
  metro: { v: [11, 13], dt: [100, 220], acc: [25, 80], activity: "in_vehicle", tunnel: true },
  sbahn: { v: [14, 17], dt: [50, 90], acc: [8, 25], activity: "in_vehicle" },
  train: { v: [37, 42], dt: [50, 110], acc: [6, 20], activity: "in_vehicle" },
  ferry: { v: [10.5, 12], dt: [60, 120], acc: [5, 15], activity: "in_vehicle" },
  boat: { v: [3.6, 4.4], dt: [40, 70], acc: [5, 15], activity: "in_vehicle" },
  flight: { v: [215, 235], dt: [180, 330], acc: [15, 45], activity: "in_vehicle" },
};

/** Travels along waypoints by a mode from the current position; arrives at `to` (a place or point). */
function go(mode, waypoints, to = waypoints[waypoints.length - 1]) {
  const m = MODES[mode];
  const v = uni(...m.v);
  const pts = [posOf(here), ...waypoints.slice(here && dist(posOf(here), waypoints[0]) < 1 ? 1 : 0)];
  if (dist(pts[pts.length - 1], posOf(to)) > 1) pts.push(posOf(to));
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    segs.push([pts[i - 1], pts[i], total, d]);
    total += d;
  }
  const duration = total / v;
  const t0 = t;
  let s = uni(10, 40); // the first fix comes soon after setting off
  while (s < duration) {
    const along = (s / duration) * total;
    const seg = segs.find(([, , start, d]) => along <= start + d) ?? segs[segs.length - 1];
    const f = seg[3] ? (along - seg[2]) / seg[3] : 0;
    const pos = [seg[0][0] + (seg[1][0] - seg[0][0]) * f, seg[0][1] + (seg[1][1] - seg[0][1]) * f];
    const lost = m.tunnel && chance(0.5);
    if (!lost) {
      emit(t0 + s, pos, {
        acc: uni(...m.acc),
        speed: m.tunnel ? null : v * uni(0.7, 1.25),
        activity: chance(0.9) ? m.activity : "still",
        noisy: chance(0.02),
      });
    }
    s += uni(...m.dt);
  }
  battery = Math.max(10, battery - (duration / 3600) * 6);
  t = t0 + duration;
  here = to;
  fresh = true;
}

/** A short wait at a stop or platform (shorter than a visit). */
function wait(min = 1, max = 4) {
  const pos = posOf(here);
  const end = t + uni(min, max) * 60;
  emit(t + 20, pos, { acc: uni(5, 15), speed: 0.2, activity: "still" });
  t = end;
}

// Trips made of legs.
function metroTrip(fromPlace, fromStation, toStation, toPlace) {
  if (fromPlace) go("walk", [fromStation]);
  wait(1, 4);
  go("metro", metroBetween(fromStation, toStation));
  go("walk", [posOf(toPlace)], toPlace);
}
function homeToCampus() {
  const r = rnd();
  if (r < 0.55) {
    go("walk", [S.matinkyla]);
    wait(1, 4);
    go("metro", metroBetween(S.matinkyla, S.aalto));
    go("walk", [P.school.at], P.school);
  } else if (r < 0.8 || !summerish()) {
    go("walk", [S.homeStop]);
    wait(2, 6);
    go("bus", BUS_HOME_CAMPUS);
    go("walk", [P.school.at], P.school);
  } else {
    go("bike", BIKE_HOME_CAMPUS, P.school);
  }
}
function campusToHome() {
  if (rnd() < 0.6) {
    go("walk", [S.aalto]);
    wait(1, 4);
    go("metro", metroBetween(S.aalto, S.matinkyla));
    go("walk", [P.home.at], P.home);
  } else {
    go("walk", [S.campusStop]);
    wait(2, 7);
    go("bus", [...BUS_HOME_CAMPUS].reverse());
    go("walk", [P.home.at], P.home);
  }
}
function fromHomeToCentre(dest) {
  go("walk", [S.matinkyla]);
  wait(1, 4);
  go("metro", metroBetween(S.matinkyla, dest === P.regatta || dest === P.hietsu ? S.kamppi : S.rautatientori));
  go("walk", [posOf(dest)], dest);
}
function fromCentreToHome() {
  const station = dist(posOf(here), S.kamppi) < dist(posOf(here), S.rautatientori) ? S.kamppi : S.rautatientori;
  go("walk", [station]);
  wait(1, 4);
  go("metro", metroBetween(station, S.matinkyla));
  go("walk", [P.home.at], P.home);
}
const walkTo = (p) => go("walk", [posOf(p)], p);

let currentDay = "";
const summerish = () => currentDay < "2026-09-15";

// ---------------------------------------------------------------- the calendar

const days = [];
for (let i = DAYS - 1; i >= 0; i--) days.push(addDays(END, -i));
const START = days[0];
const dayIndex = (d) => days.indexOf(d);
const rel = (n) => days[Math.min(days.length - 1, Math.max(0, n))];

/** The first day on or after `day` that is weekday `wd` (0 = Sunday). */
const onOrAfter = (day, wd) => addDays(day, (wd - weekday(day) + 7) % 7);
// Away trips and special days, placed relative to the range so any --end works.
const TAMPERE = onOrAfter(rel(8), 6); // Saturday, 2 nights
const SUOMENLINNA = onOrAfter(addDays(TAMPERE, 3), 6);
const SCHOOL_FROM = onOrAfter(rel(Math.round(DAYS * 0.25)), 1);
const TALLINN = onOrAfter(rel(Math.round(DAYS * 0.4)), 5); // Friday, 2 nights
const PHONE_OFF = onOrAfter(rel(Math.round(DAYS * 0.55)), 4); // Thursday noon until Friday evening
const BERLIN = onOrAfter(rel(Math.round(DAYS * 0.66)), 3); // Wednesday, 4 nights
const RECORDING_OFF = onOrAfter(rel(Math.round(DAYS * 0.82)), 2); // a Tuesday afternoon
const awayDays = new Set();
for (const [d, n] of [[TAMPERE, 3], [TALLINN, 3], [BERLIN, 5]]) for (let k = 0; k < n; k++) awayDays.add(addDays(d, k));

// Every other weekend at the family home (not when away). Weeks start on Monday.
const week = (d) => Math.floor((Date.parse(`${d}T00:00:00Z`) / 86400000 - 4) / 7);
const familyWeekend = (d) => week(d) % 2 === 1;

here = P.home;
t = at(START, 0);
activityTags = false;

for (const day of days) {
  currentDay = day;
  activityTags = dayIndex(day) >= DAYS / 2;
  const wd = weekday(day);
  const weekend = wd === 0 || wd === 6;
  const h = (x) => at(day, x);

  if (day === TAMPERE) {
    stayUntil(h(uni(8.2, 9)));
    fromHomeToCentre(P.oodi);
    stayUntil(t + uni(20, 40) * 60);
    walkTo(S.hki);
    wait(4, 9);
    go("train", RAIL_HKI_TAMPERE);
    walkTo(P.tampere_market);
    stayUntil(t + uni(40, 70) * 60);
    walkTo(P.tampere_hotel);
    stayUntil(h(uni(15, 16)));
    walkTo(P.pyynikki);
    stayUntil(t + uni(60, 90) * 60);
    walkTo(P.tampere_hotel);
    continue;
  }
  if (day === addDays(TAMPERE, 1)) {
    stayUntil(h(uni(10, 11)));
    walkTo(P.sarkanniemi);
    stayUntil(h(uni(15, 16.5)));
    walkTo(P.tampere_market);
    stayUntil(t + uni(30, 50) * 60);
    walkTo(P.tampere_hotel);
    continue;
  }
  if (day === addDays(TAMPERE, 2)) {
    stayUntil(h(uni(11, 12)));
    walkTo(S.tampere);
    wait(3, 8);
    go("train", [...RAIL_HKI_TAMPERE].reverse());
    metroTrip(null, S.rautatientori, S.matinkyla, P.home);
    continue;
  }
  if (day === TALLINN) {
    stayUntil(h(uni(7.4, 7.8)));
    homeToCampus();
    stayUntil(h(uni(14.5, 15.2)));
    go("walk", [S.aalto]);
    wait(1, 3);
    go("metro", metroBetween(S.aalto, S.ruoholahti));
    go("walk", [S.westHarbour]);
    stayUntil(h(17.5)); // check-in, a visit at the terminal
    go("ferry", FERRY_TALLINN);
    walkTo(P.rotermann);
    stayUntil(t + uni(40, 60) * 60);
    walkTo(P.tallinn_hotel);
    continue;
  }
  if (day === addDays(TALLINN, 1)) {
    stayUntil(h(uni(9.5, 10.5)));
    go("walk", [[59.4387, 24.7372], P.telliskivi.at], P.telliskivi);
    stayUntil(t + uni(90, 130) * 60);
    go("walk", [[59.4387, 24.7372], P.tallinn_hotel.at], P.tallinn_hotel);
    stayUntil(t + uni(60, 90) * 60);
    go("bus", [[59.4377, 24.7612], P.kadriorg.at], P.kadriorg);
    stayUntil(t + uni(80, 120) * 60);
    go("bus", [[59.4377, 24.7612], P.tallinn_hotel.at], P.tallinn_hotel);
    continue;
  }
  if (day === addDays(TALLINN, 2)) {
    stayUntil(h(uni(13.5, 14)));
    go("walk", [[59.4405, 24.7577], S.dTerminal]);
    stayUntil(h(16.5));
    go("ferry", [...FERRY_TALLINN].reverse());
    go("walk", [S.ruoholahti]);
    wait(1, 4);
    go("metro", metroBetween(S.ruoholahti, S.matinkyla));
    walkTo(P.home);
    continue;
  }
  if (day === BERLIN) {
    stayUntil(h(uni(5.6, 5.9)));
    fromHomeToCentre(S.hki);
    wait(3, 8);
    go("train", RAIL_HKI_AIRPORT);
    walkTo(P.airport);
    stayUntil(h(9.6));
    go("flight", FLIGHT_HEL_BER);
    stayUntil(t + uni(25, 40) * 60); // baggage
    go("sbahn", S_BAHN_BER_MITTE);
    walkTo(P.berlin_hotel);
    stayUntil(h(uni(15.5, 16)));
    walkTo(P.museumsinsel);
    stayUntil(t + uni(100, 140) * 60);
    walkTo(P.berlin_hotel);
    continue;
  }
  if (awayDays.has(day) && dayIndex(day) > dayIndex(BERLIN) && dayIndex(day) < dayIndex(BERLIN) + 4) {
    stayUntil(h(uni(9.5, 10.5)));
    const sights = dayIndex(day) % 2 ? [P.brandenburg, P.kreuzberg] : [P.eastside, P.kreuzberg];
    for (const s of sights) {
      if (dist(posOf(here), s.at) > 2500) go("sbahn", [s.at], s);
      else walkTo(s);
      stayUntil(t + uni(70, 150) * 60);
    }
    go("sbahn", [P.berlin_hotel.at], P.berlin_hotel);
    continue;
  }
  if (day === addDays(BERLIN, 4)) {
    stayUntil(h(uni(9, 9.5)));
    go("sbahn", [...S_BAHN_BER_MITTE].reverse());
    walkTo(P.ber);
    stayUntil(h(13.3));
    go("flight", [...FLIGHT_HEL_BER].reverse());
    stayUntil(t + uni(20, 30) * 60);
    go("train", [...RAIL_HKI_AIRPORT].reverse());
    metroTrip(null, S.rautatientori, S.matinkyla, P.home);
    continue;
  }

  // The phone is switched off from Thursday lunch to Friday evening.
  if (day === PHONE_OFF) {
    stayUntil(h(uni(7.5, 8)));
    homeToCampus();
    stayUntil(h(12.5));
    t = at(addDays(day, 1), 19.5);
    here = P.home;
    fresh = true;
    continue;
  }
  if (day === addDays(PHONE_OFF, 1)) {
    stayUntil(h(23.9));
    continue;
  }

  const atFamily = here === P.family;
  if (weekend && familyWeekend(day)) {
    // Saturday and Sunday at the family home, with an outing.
    if (!atFamily) {
      stayUntil(h(uni(10, 11)));
      go("walk", [S.homeStop]);
      wait(2, 6);
      go("bus", BUS_HOME_FAMILY);
      walkTo(P.family);
    }
    if (wd === 6) {
      stayUntil(h(uni(12, 13)));
      go("walk", [[60.2581, 24.8461], [60.2552, 24.8399]], [60.2552, 24.8399]);
      go("walk", [[60.2581, 24.8461], P.family.at], P.family);
      stayUntil(h(23.9));
    } else {
      stayUntil(h(uni(16.5, 18)));
      go("walk", [[60.2585, 24.849]]);
      wait(2, 6);
      go("bus", [...BUS_HOME_FAMILY].reverse());
      walkTo(P.home);
      stayUntil(h(23.9));
    }
    continue;
  }
  if (wd === 5 && familyWeekend(day) && !awayDays.has(addDays(day, 1))) {
    // Friday: school, then straight to the family home.
    stayUntil(h(uni(7.5, 8.2)));
    if (day >= SCHOOL_FROM) {
      homeToCampus();
      stayUntil(h(uni(14, 15.5)));
      go("walk", [S.aalto]);
      wait(1, 3);
      go("metro", metroBetween(S.aalto, S.matinkyla));
    }
    go("walk", [S.homeStop]);
    wait(2, 6);
    go("bus", BUS_HOME_FAMILY);
    walkTo(P.family);
    stayUntil(h(23.9));
    continue;
  }

  if (!weekend && day >= SCHOOL_FROM) {
    // A school day.
    if (day === RECORDING_OFF) {
      stayUntil(h(uni(7.5, 8)));
      homeToCampus();
      stayUntil(h(13.8));
      // Recording switched off for the afternoon; back on at home.
      t = h(uni(18.5, 19));
      here = P.home;
      fresh = true;
      stayUntil(h(23.9));
      continue;
    }
    stayUntil(h(uni(7.4, 8.4)));
    homeToCampus();
    stayUntil(h(uni(11, 11.6)));
    if (chance(0.75)) {
      walkTo(P.lunch);
      stayUntil(t + uni(25, 45) * 60);
      walkTo(P.school);
    }
    stayUntil(h(uni(14.5, 16.8)));
    const evening = rnd();
    if (evening < 0.25) {
      go("walk", [S.aalto]);
      wait(1, 3);
      go("metro", metroBetween(S.aalto, S.tapiola));
      walkTo(P.gym);
      stayUntil(t + uni(60, 90) * 60);
      go("walk", [S.tapiola]);
      wait(1, 4);
      go("metro", metroBetween(S.tapiola, S.matinkyla));
      walkTo(P.home);
    } else if (evening < 0.45) {
      go("walk", [S.aalto]);
      wait(1, 3);
      go("metro", metroBetween(S.aalto, S.matinkyla));
      walkTo(P.grocery);
      stayUntil(t + uni(15, 30) * 60);
      walkTo(P.home);
    } else {
      campusToHome();
    }
    if (chance(0.15)) {
      stayUntil(h(uni(19, 20)));
      go("run", RUN_LOOP, P.home);
    }
    stayUntil(h(23.9));
    continue;
  }

  // Summer holiday weekdays and weekends.
  if (day === SUOMENLINNA) {
    stayUntil(h(uni(10, 11)));
    fromHomeToCentre(P.market);
    stayUntil(t + uni(20, 35) * 60);
    go("walk", [[60.1672, 24.9535]]);
    wait(3, 4);
    go("boat", FERRY_SUOMENLINNA);
    walkTo(P.suomenlinna);
    stayUntil(t + uni(150, 200) * 60);
    go("walk", [[60.1465, 24.9868]]);
    wait(3, 4);
    go("boat", [...FERRY_SUOMENLINNA].reverse());
    go("walk", [P.market.at]);
    fromCentreToHome();
    stayUntil(h(23.9));
    continue;
  }
  const r = rnd();
  if (r < 0.15 && !weekend) {
    // A lazy day at home.
    stayUntil(h(23.9));
    continue;
  }
  if (r < 0.3) {
    // Errands near home, a run or a bike ride.
    stayUntil(h(uni(10, 12)));
    if (chance(0.5)) go("run", RUN_LOOP, P.home);
    else {
      go("bike", [[60.1655, 24.7465], P.library.at], P.library);
      stayUntil(t + uni(40, 90) * 60);
      go("bike", [[60.1655, 24.7465], P.home.at], P.home);
    }
    stayUntil(h(uni(16, 17)));
    walkTo(P.grocery);
    stayUntil(t + uni(15, 30) * 60);
    walkTo(P.home);
    stayUntil(h(23.9));
    continue;
  }
  // Into town: two or three spots.
  stayUntil(h(uni(10.5, 13)));
  const spots = [P.oodi, P.kamppi, P.stockmann, P.ekberg, P.market, P.ateneum, P.regatta];
  if (summerish()) spots.push(P.hietsu, P.hietsu);
  const first = pick(spots);
  fromHomeToCentre(first);
  stayUntil(t + uni(40, 110) * 60);
  for (let k = 0; k < (chance(0.5) ? 2 : 1); k++) {
    const next = pick(spots.filter((s) => s !== here));
    walkTo(next);
    stayUntil(t + uni(30, 90) * 60);
  }
  if (chance(0.2)) {
    // An evening at a friend's in Kallio, by tram.
    go("walk", [S.rautatientori]);
    wait(2, 5);
    go("bus", [[60.1745, 24.9416], [60.1838, 24.9502], P.friend.at], P.friend);
    stayUntil(h(uni(21, 22.5)));
    go("bus", [[60.1838, 24.9502], [60.1745, 24.9416], S.rautatientori]);
    wait(1, 3);
    go("metro", metroBetween(S.rautatientori, S.matinkyla));
    walkTo(P.home);
  } else {
    fromCentreToHome();
  }
  stayUntil(h(23.9));
}
stayUntil(Math.min(NOW, at(addDays(END, 1), 0)));

// ---------------------------------------------------------------- write

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  const user =
    (await client.query(`SELECT id FROM users WHERE oidc_sub = $1`, [args.user])).rows[0] ??
    (
      await client.query(
        `INSERT INTO users (oidc_sub, name, timezone) VALUES ($1, 'Owner', $2) RETURNING id`,
        [args.user, TZ],
      )
    ).rows[0];
  const userId = user.id;
  if (args.reset) {
    await client.query(`DELETE FROM visits WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM trips WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM places WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM points WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM covers WHERE user_id = $1`, [userId]);
  }

  // The known spots, named, so visits snap to them.
  let placesNew = 0;
  for (const p of Object.values(P)) {
    const exists = await client.query(
      `SELECT id FROM places WHERE user_id = $1 AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 30)`,
      [userId, p.at[1], p.at[0]],
    );
    if (exists.rowCount) continue;
    const saved = args.save && p.kind;
    await client.query(
      `INSERT INTO places (user_id, geom, geo_name, category, city, country, geocoded_at, geocoder_version,
                           kind, radius_m, saved_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, $5, $6, $7, now(), 2, $8, $9, $10)`,
      [
        userId,
        p.at[1],
        p.at[0],
        p.kind === "home" || p.kind === "family" ? null : p.name,
        p.category,
        p.city,
        p.country,
        saved ? p.kind : null,
        saved ? p.radius : null,
        saved ? new Date() : null,
      ],
    );
    placesNew++;
  }
  // A home is named by its kind once saved; unsaved, give it a street address.
  await client.query(
    `UPDATE places SET geo_name = CASE WHEN ST_DWithin(geom, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 30)
                                       THEN 'Kotikatu 12' ELSE 'Mallitie 7' END
     WHERE user_id = $1 AND geo_name IS NULL AND category IN ('apartments', 'house')`,
    [userId, P.home.at[1], P.home.at[0]],
  );

  const rows = [...fixes.values()].sort((a, b) => a.ts - b.ts);
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 5000) {
    const b = rows.slice(i, i + 5000);
    const res = await client.query(
      `INSERT INTO points (user_id, ts, geom, accuracy, speed, battery, activity, source)
       SELECT $1, to_timestamp(ts), ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography, acc, speed, bat, act, 'device'
       FROM unnest($2::float8[], $3::float8[], $4::float8[], $5::real[], $6::real[], $7::smallint[], $8::text[])
         AS u(ts, lat, lon, acc, speed, bat, act)
       ON CONFLICT (user_id, ts) DO NOTHING`,
      [
        userId,
        b.map((r) => r.ts),
        b.map((r) => r.lat),
        b.map((r) => r.lon),
        b.map((r) => r.accuracy),
        b.map((r) => r.speed),
        b.map((r) => r.battery),
        b.map((r) => r.activity),
      ],
    );
    inserted += res.rowCount;
  }
  if (rows.length) {
    await client.query(
      `INSERT INTO processing_state (user_id, dirty_from) VALUES ($1, to_timestamp($2))
       ON CONFLICT (user_id) DO UPDATE
         SET dirty_from = LEAST(COALESCE(processing_state.dirty_from, EXCLUDED.dirty_from), EXCLUDED.dirty_from)`,
      [userId, rows[0].ts],
    );
  }
  await client.query("COMMIT");
  console.log(
    `seed-demo: user ${userId} (${args.user}), ${START} … ${END}: ${rows.length} fixes generated, ` +
      `${inserted} new; ${placesNew} named places added${args.save ? " (home, family, campus saved)" : ""}`,
  );
  console.log(
    `seed-demo: Tampere ${TAMPERE}, Tallinn ${TALLINN}, Berlin ${BERLIN}, phone off ${PHONE_OFF}, ` +
      `recording off ${RECORDING_OFF} afternoon, school from ${SCHOOL_FROM}`,
  );

  if (args.wait) {
    process.stdout.write("seed-demo: waiting for the worker");
    for (let i = 0; ; i++) {
      const s = (await client.query(`SELECT dirty_from FROM processing_state WHERE user_id = $1`, [userId])).rows[0];
      if (!s?.dirty_from) break;
      if (i === 120) fail("\nthe worker hasn't processed the points in 10 minutes; is the app running with MATKA_WORKER on?");
      process.stdout.write(".");
      await new Promise((r) => setTimeout(r, 5000));
    }
    const c = (
      await client.query(
        `SELECT (SELECT count(*) FROM visits WHERE user_id = $1) visits,
                (SELECT count(*) FROM trips WHERE user_id = $1) trips,
                (SELECT count(*) FROM places WHERE user_id = $1) places`,
        [userId],
      )
    ).rows[0];
    console.log(`\nseed-demo: processed: ${c.visits} visits, ${c.trips} trips, ${c.places} places`);
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  throw err;
} finally {
  await client.end();
}
