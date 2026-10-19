// Formatting and grouping for the Insights screens (pure, unit-tested). Wording
// and rules mirror the web app's Insights pages (web/src/lib/format.ts).

import type { ModeTotal, SavedKind, SavedRow, Trip, WorldEntry } from "./insights";
import type { Place } from "./viewer";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const parts = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d: d || 1 };
};

/** Thousands with a thin-ish space, like the rest of the app ("1 235"). */
const group = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Metres → "1 235 km" / "8.4 km" / "340 m": whole km once the decimal stops mattering. */
export function fmtKm(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  return km < 100 ? `${km.toFixed(1)} km` : `${group(km)} km`;
}

/** Seconds → "3 h 20 min", or "4 d 6 h" from two days on. */
export function fmtLongDuration(s: number | null | undefined): string {
  if (!s || s < 0) return "—";
  if (s >= 48 * 3600) {
    const d = Math.floor(s / 86_400);
    const h = Math.floor((s % 86_400) / 3600);
    return h > 0 ? `${d} d ${h} h` : `${d} d`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return `${m} min`;
  return `${Math.round(s)} s`;
}

/** Saved-places hours: "62 h" from ten hours, "3.5 h" below. */
export function fmtHours(s: number): string {
  return `${s >= 36_000 ? Math.round(s / 3600) : Math.round(s / 360) / 10} h`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

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

/** Local calendar dates → "3–5 Oct 2026", "28 Sep – 2 Oct 2026", "30 Dec 2026 – 2 Jan 2027". */
export function fmtDateRange(start: string, end: string): string {
  const a = parts(start);
  const b = parts(end);
  const mon = (m: number) => (MONTHS[m - 1] ?? "?").slice(0, 3);
  const full = (x: typeof a) => `${x.d} ${mon(x.m)} ${x.y}`;
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

export const KIND_META: Record<SavedKind, { label: string; icon: "home-outline" | "account-group-outline" | "school-outline" | "briefcase-outline" | "star-outline" }> = {
  home: { label: "Home", icon: "home-outline" },
  family: { label: "Family", icon: "account-group-outline" },
  school: { label: "School", icon: "school-outline" },
  work: { label: "Work", icon: "briefcase-outline" },
  other: { label: "Other", icon: "star-outline" },
};

/**
 * What a saved-place row shows: homes lead with nights, everything else with
 * hours ("School 62 h", "Mom's 9 nights · 210 h").
 */
export function savedRowText(r: SavedRow): { title: string; subtitle: string | null; primary: string; secondary: string | null } {
  const label = KIND_META[r.kind].label;
  const home = r.kind === "home" || r.kind === "family";
  const nights = plural(r.nights, "night");
  return {
    title: r.name ?? label,
    subtitle: r.name && r.name !== label ? label : null,
    primary: home && r.nights > 0 ? nights : fmtHours(r.seconds),
    secondary: home && r.nights > 0 ? fmtHours(r.seconds) : r.nights > 0 ? nights : null,
  };
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
