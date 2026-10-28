// Formatting and grouping for the Insights screens (pure, unit-tested). Wording
// and rules mirror the web app's Insights pages (web/src/lib/format.ts).

import { MONTHS, WEEKDAYS, fmtDistance, fmtLongDuration, group } from "./format";
import type { ModeTotal, SavedKind, SavedRow, Trip, WorldEntry, WorldSort } from "./insights";
import type { Place } from "./viewer";

const parts = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d: d || 1 };
};

/** Distances and totals of time follow the app-wide rules in format.ts. */
export { fmtDistance as fmtKm, fmtLongDuration } from "./format";

/** Hours at a saved place: a total of time, like everywhere else. */
export const fmtHours = (s: number) => fmtLongDuration(s);

export const plural = (n: number, one: string, many = `${one}s`) => `${group(n)} ${n === 1 ? one : many}`;

/** "2026-10" → "October 2026", or "Oct" with `short`. */
export function fmtMonth(month: string, short = false): string {
  const { y, m } = parts(month);
  const name = MONTHS[m - 1] ?? "?";
  return short ? name.slice(0, 3) : `${name} ${y}`;
}

/** "2026-10" + n months → "2027-01". */
export function addMonths(month: string, n: number): string {
  const { y, m } = parts(month);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

/**
 * The months the picker can step through: from the first month with travel to
 * the last (or the shown month, if outside), oldest first.
 */
export function monthRange(first: string | null, last: string | null, shown: string): string[] {
  if (!first) return [shown];
  const from = first < shown ? first : shown;
  const to = (last ?? shown) > shown ? (last ?? shown) : shown;
  const out: string[] = [];
  for (let m = from; m <= to && out.length < 600; m = addMonths(m, 1)) out.push(m);
  return out;
}

/**
 * Local calendar dates → "3–5 Oct 2026", "28 Sep – 2 Oct 2026", "30 Dec 2026 – 2 Jan 2027".
 * `year: false` drops the year of a range inside one year (under a year heading): "3–5 Oct".
 */
export function fmtDateRange(start: string, end: string, opts: { year?: boolean } = {}): string {
  const a = parts(start);
  const b = parts(end);
  const mon = (m: number) => (MONTHS[m - 1] ?? "?").slice(0, 3);
  const withYear = opts.year !== false || a.y !== b.y;
  const full = (x: typeof a) => (withYear ? `${x.d} ${mon(x.m)} ${x.y}` : `${x.d} ${mon(x.m)}`);
  if (start === end) return full(a);
  if (a.y !== b.y) return `${full(a)} – ${full(b)}`;
  if (a.m !== b.m) return `${a.d} ${mon(a.m)} – ${full(b)}`;
  return `${a.d}–${full(b)}`;
}

/** A local calendar date → "Saturday 3 October" (short: "Sat 3 Oct"). */
export function fmtDay(date: string, short = false): string {
  const { y, m, d } = parts(date);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const cut = (s: string) => (short ? s.slice(0, 3) : s);
  return `${cut(WEEKDAYS[wd])} ${d} ${cut(MONTHS[m - 1] ?? "?")}`;
}

/** ISO instant → "Sat 3 Oct 2026" in the phone's time zone. */
export function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  return `${WEEKDAYS[t.getDay()].slice(0, 3)} ${t.getDate()} ${MONTHS[t.getMonth()].slice(0, 3)} ${t.getFullYear()}`;
}

/** ISO instant → "18 Oct" this year, "18 Oct 2025" before (narrow columns). */
export function fmtCompactDate(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "—";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "—";
  const dm = `${t.getDate()} ${MONTHS[t.getMonth()].slice(0, 3)}`;
  return t.getFullYear() === now.getFullYear() ? dm : `${dm} ${t.getFullYear()}`;
}

/** Trips grouped by the year they started, newest year first (trips arrive newest first). */
export function tripsByYear<T extends Pick<Trip, "startDate">>(trips: T[]): { year: string; trips: T[] }[] {
  const by = new Map<string, T[]>();
  for (const t of trips) {
    const y = t.startDate.slice(0, 4);
    by.set(y, [...(by.get(y) ?? []), t]);
  }
  return [...by].map(([year, list]) => ({ year, trips: list })).sort((a, b) => b.year.localeCompare(a.year));
}

/** "3 days · 2 nights" */
export const tripLength = (t: Pick<Trip, "days" | "nights">) => `${plural(t.days, "day")} · ${plural(t.nights, "night")}`;

/** "3–5 Oct 2026 · ongoing" */
export const tripDates = (t: Pick<Trip, "startDate" | "endDate" | "arrival">) =>
  `${fmtDateRange(t.startDate, t.endDate)}${t.arrival == null ? " · ongoing" : ""}`;

/** A trip card's one meta line: "2–4 Oct · 3 days · 381 km · Estonia" (the year is in the heading above). */
export function tripMeta(t: Pick<Trip, "startDate" | "endDate" | "arrival" | "days" | "distance" | "countries">): string {
  return [
    fmtDateRange(t.startDate, t.endDate, { year: false }),
    t.arrival == null ? "ongoing" : null,
    plural(t.days, "day"),
    t.distance > 0 ? fmtDistance(t.distance) : null,
    t.countries.length ? t.countries.join(", ") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Modes with travel, largest distance first, each with its share of the total distance (0–1). */
export function modeShares(modes: ModeTotal[]): (ModeTotal & { share: number })[] {
  const used = modes.filter((m) => m.distance > 0 || m.duration > 0);
  const total = used.reduce((a, m) => a + m.distance, 0);
  return [...used]
    .sort((a, b) => b.distance - a.distance || b.duration - a.duration)
    .map((m) => ({ ...m, share: total > 0 ? m.distance / total : 0 }));
}

/** Percentages that add up to 100 (largest remainder), for the share legend. */
export function roundShares(shares: number[]): number[] {
  const raw = shares.map((s) => s * 100);
  const floor = raw.map(Math.floor);
  const total = shares.reduce((a, s) => a + s, 0);
  if (total <= 0) return floor;
  let left = 100 - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - floor[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floor[i]++;
    left--;
  }
  return floor;
}

/** Travel tab: modes used this month first (largest first), then the quiet ones (not "unknown"). */
export function orderModeCards<T extends ModeTotal>(modes: T[]): { mode: T; quiet: boolean }[] {
  const used = modes.filter((m) => m.distance > 0 || m.duration > 0);
  const quiet = modes.filter((m) => m.distance === 0 && m.duration === 0 && m.mode !== "unknown");
  return [...used.map((m) => ({ mode: m, quiet: false })), ...quiet.map((m) => ({ mode: m, quiet: true }))];
}

/** The place with the most visits (first on a tie), or null; the server lists saved places first, so it's not always the top row. */
export function mostVisitedId(places: readonly Pick<Place, "id" | "visitCount">[]): number | null {
  let best: Pick<Place, "id" | "visitCount"> | null = null;
  for (const p of places) if (p.visitCount > 0 && (!best || p.visitCount > best.visitCount)) best = p;
  return best?.id ?? null;
}

/** Saved kinds; `icon` is a semantic name from design/icons.ts. */
export const KIND_META: Record<SavedKind, { label: string; icon: "home" | "family" | "school" | "work" | "saved" }> = {
  home: { label: "Home", icon: "home" },
  family: { label: "Family", icon: "family" },
  school: { label: "School", icon: "school" },
  work: { label: "Work", icon: "work" },
  other: { label: "Other", icon: "saved" },
};

/**
 * What a saved-place row shows: one trailing value (time there), with the kind
 * and, for homes, the nights in the meta line ("Mom's", "Family · 9 nights", "8 d 18 h").
 */
export function savedRowText(r: SavedRow): { title: string; subtitle: string | null; primary: string } {
  const label = KIND_META[r.kind].label;
  const meta = [r.name && r.name !== label ? label : null, r.nights > 0 ? plural(r.nights, "night") : null].filter(Boolean).join(" · ");
  return { title: r.name ?? label, subtitle: meta || null, primary: fmtLongDuration(r.seconds) };
}

/** "3 cities · 12 places · 40 visits" */
export function worldCounts(e: WorldEntry): string {
  return [
    e.cities != null ? plural(e.cities, "city", "cities") : null,
    plural(e.places, "place"),
    plural(e.visits, "visit"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Values scaled to 0–1 of the largest (all zero → all zero), for small bars. */
export function scaled(values: number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max > 0 ? Math.max(0, v) / max : 0));
}

/** The trailing value of a World row: what the list is sorted by ("12 visits", "8 places", "3 d 4 h", "18 Oct"). */
export function worldTrailing(e: WorldEntry, sort: WorldSort, now = new Date()): string {
  switch (sort) {
    case "places":
      return plural(e.places, "place");
    case "time":
      return fmtLongDuration(e.duration);
    case "recent":
      return fmtCompactDate(e.lastVisit, now);
    default:
      return plural(e.visits, "visit");
  }
}

/** The meta line of a World row: the counts the trailing value doesn't already say. */
export function worldMeta(e: WorldEntry, sort: WorldSort): string {
  return [
    e.cities != null ? plural(e.cities, "city", "cities") : null,
    sort === "places" ? null : plural(e.places, "place"),
    sort === "visits" || sort === "name" ? null : plural(e.visits, "visit"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** English country names (as the geocoder writes them) → ISO 3166 alpha-2, for the country tiles. */
const ISO2: Record<string, string> = {
  Afghanistan: "AF", Albania: "AL", Algeria: "DZ", Andorra: "AD", Argentina: "AR", Armenia: "AM", Australia: "AU", Austria: "AT",
  Azerbaijan: "AZ", Bahrain: "BH", Bangladesh: "BD", Belarus: "BY", Belgium: "BE", Bolivia: "BO", "Bosnia and Herzegovina": "BA",
  Brazil: "BR", Bulgaria: "BG", Cambodia: "KH", Canada: "CA", Chile: "CL", China: "CN", Colombia: "CO", "Costa Rica": "CR",
  Croatia: "HR", Cuba: "CU", Cyprus: "CY", Czechia: "CZ", "Czech Republic": "CZ", Denmark: "DK", "Dominican Republic": "DO",
  Ecuador: "EC", Egypt: "EG", Estonia: "EE", Ethiopia: "ET", Faroe: "FO", "Faroe Islands": "FO", Finland: "FI", France: "FR",
  Georgia: "GE", Germany: "DE", Ghana: "GH", Greece: "GR", Greenland: "GL", Hungary: "HU", Iceland: "IS", India: "IN",
  Indonesia: "ID", Iran: "IR", Iraq: "IQ", Ireland: "IE", Israel: "IL", Italy: "IT", Japan: "JP", Jordan: "JO",
  Kazakhstan: "KZ", Kenya: "KE", Kosovo: "XK", Kuwait: "KW", Latvia: "LV", Lebanon: "LB", Liechtenstein: "LI", Lithuania: "LT",
  Luxembourg: "LU", Malaysia: "MY", Malta: "MT", Mexico: "MX", Moldova: "MD", Monaco: "MC", Mongolia: "MN", Montenegro: "ME",
  Morocco: "MA", Nepal: "NP", Netherlands: "NL", "The Netherlands": "NL", "New Zealand": "NZ", Nigeria: "NG", "North Macedonia": "MK",
  Norway: "NO", Oman: "OM", Pakistan: "PK", Panama: "PA", Peru: "PE", Philippines: "PH", Poland: "PL", Portugal: "PT",
  Qatar: "QA", Romania: "RO", Russia: "RU", "San Marino": "SM", "Saudi Arabia": "SA", Serbia: "RS", Singapore: "SG",
  Slovakia: "SK", Slovenia: "SI", "South Africa": "ZA", "South Korea": "KR", Spain: "ES", "Sri Lanka": "LK", Sweden: "SE",
  Switzerland: "CH", Taiwan: "TW", Tanzania: "TZ", Thailand: "TH", Tunisia: "TN", Turkey: "TR", "Türkiye": "TR", Ukraine: "UA",
  "United Arab Emirates": "AE", "United Kingdom": "GB", "United States": "US", "United States of America": "US", Uruguay: "UY",
  Uzbekistan: "UZ", "Vatican City": "VA", Venezuela: "VE", Vietnam: "VN", "Viet Nam": "VN",
  // Local names the geocoder sometimes keeps.
  Suomi: "FI", Sverige: "SE", Norge: "NO", Danmark: "DK", Eesti: "EE", Deutschland: "DE", España: "ES", Italia: "IT",
};

/** "Finland" → "FI"; null when unknown (the tile falls back to a globe). */
export function countryCode(name: string | null | undefined): string | null {
  if (!name) return null;
  if (/^[A-Z]{2}$/.test(name)) return name;
  return ISO2[name] ?? ISO2[name.split(/\s*[/(,]/)[0].trim()] ?? null;
}
