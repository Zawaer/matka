// Display formatting (pure).

// ---- collector (status / settings) -------------------------------------------

/** "just now", "5 min ago", "3 h ago", "2 d ago", or "never". */
export function ago(ms: number | null | undefined, now = Date.now()): string {
  if (ms == null || !Number.isFinite(ms)) return "never";
  const d = Math.max(0, now - ms);
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} min ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} h ago`;
  return `${Math.floor(d / 86_400_000)} d ago`;
}

/** "in 2 min" style, for the next retry. */
export function inFuture(ms: number | null | undefined, now = Date.now()): string {
  if (ms == null || !Number.isFinite(ms) || ms <= now) return "now";
  const d = ms - now;
  if (d < 60_000) return `in ${Math.ceil(d / 1000)} s`;
  if (d < 3_600_000) return `in ${Math.ceil(d / 60_000)} min`;
  return `in ${Math.ceil(d / 3_600_000)} h`;
}

// ---- numbers, distances and durations: the one set of rules -------------------
// Shared with the web (docs/redesign/palette.md → "Formatting rules"): en-GB
// grouping with a comma, three-letter months, 24-hour times, "52%".

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Always three letters ("Sep", never "Sept"). */
export const monthShort = (m0: number) => (MONTHS[m0] ?? "?").slice(0, 3);
export const weekdayShort = (d0: number) => (WEEKDAYS[d0] ?? "?").slice(0, 3);

/** A whole number grouped en-GB style: "1,137". */
export function group(n: number): string {
  const r = Math.round(n);
  const s = String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return r < 0 ? `-${s}` : s;
}

export function count(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return group(n);
}

/** "52%"; "<1%" for a small non-zero share. */
export function fmtPercent(fraction: number): string {
  const p = fraction * 100;
  if (p > 0 && p < 0.5) return "<1%";
  return `${Math.round(p)}%`;
}

/** One visit or trip: "30 s", "45 min", "6 h 34 min" (hours grouped: "1,110 h 51 min"). */
export function fmtDuration(s: number | null | undefined): string {
  if (!s || s < 0) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${group(h)} h ${m} min` : `${group(h)} h`;
  if (m > 0) return `${m} min`;
  return `${Math.round(s)} s`;
}

/** A total of time (places, cities, months, trips): "6 h 34 min", "12 d 3 h", then whole days from 30: "46 d". */
export function fmtLongDuration(s: number | null | undefined): string {
  if (!s || s < 0) return "—";
  if (s < 86_400) return fmtDuration(s);
  const d = Math.floor(s / 86_400);
  if (d >= 30) return `${group(Math.round(s / 86_400))} d`;
  const h = Math.floor((s % 86_400) / 3600);
  return h > 0 ? `${d} d ${h} h` : `${d} d`;
}

/** Metres → "340 m", "8.4 km", "1,137 km" (whole from 100 km). */
export function fmtDistance(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  return km < 100 ? `${km.toFixed(1)} km` : `${group(km)} km`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 24-hour "16:58" in the phone's time zone. */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Full number below 10,000, otherwise compact: 1,440 / 12.9K / 1.2M. */
export function fmtCompact(n: number): string {
  if (Math.abs(n) < 10_000) return group(n);
  const [div, suffix] = Math.abs(n) >= 1_000_000 ? [1_000_000, "M"] : [1_000, "K"];
  const v = n / div;
  return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10}${suffix}`;
}

const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
const daysAgo = (d: Date, now: Date) => Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);

/** "Wed 28 Oct", with the year when it isn't this year. */
export function fmtDateShort(d: Date, now = new Date()): string {
  const base = `${weekdayShort(d.getDay())} ${d.getDate()} ${monthShort(d.getMonth())}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** Day headings: "Today", "Yesterday", "Mon 26 Oct". */
export function fmtDayHeading(d: Date, now = new Date()): string {
  const n = daysAgo(d, now);
  if (n === 0) return "Today";
  if (n === 1) return "Yesterday";
  return fmtDateShort(d, now);
}

/** "Today, 09:12", "Yesterday, 17:40", "Fri 16 Oct". */
export function fmtWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const n = daysAgo(d, now);
  if (n === 0) return `Today, ${fmtTime(iso)}`;
  if (n === 1) return `Yesterday, ${fmtTime(iso)}`;
  return fmtDateShort(d, now);
}

/** "2 Nov – 18 Oct" within this year; with years once the span reaches into another ("2 Nov 2025 – 18 Oct 2026"). */
export function fmtSpan(firstIso: string, lastIso: string, now = new Date()): string {
  const a = new Date(firstIso);
  const b = new Date(lastIso);
  const years = a.getFullYear() !== now.getFullYear() || b.getFullYear() !== now.getFullYear();
  const f = (d: Date) => `${d.getDate()} ${monthShort(d.getMonth())}${years ? ` ${d.getFullYear()}` : ""}`;
  return `${f(a)} – ${f(b)}`;
}

/** Axis ceiling that lands on clean tick values. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => n <= x) ?? 10;
  return step * pow;
}

/** "2026-10-18" → that calendar day at local midnight (not UTC, which can show the previous day). */
export function localDay(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/**
 * Dawarich names places "Name (Category)", e.g. "Kivenlahti (Bus stop)"; the category
 * is shown separately where it matters, so drop one trailing parenthetical.
 */
export function cleanName(name: string | null | undefined): string | null {
  if (!name) return null;
  const stripped = name.replace(/\s*\([^()]*\)\s*$/, "").trim();
  return stripped || name;
}

export function isNamed(name: string | null | undefined): name is string {
  return !!name && name !== "Unknown Location";
}

/** A place's name for display; the server's "Unknown Location" placeholder counts as no name. */
export function placeLabel(name: string | null | undefined, fallback = "Unnamed place"): string {
  return isNamed(name) ? displayName(name) : fallback;
}

/** Fastest believable average speed (km/h) per travel mode. */
const MAX_KMH: Record<string, number> = { walking: 9, running: 22, cycling: 48 };

/**
 * A segment whose average speed is impossible for its mode is almost always GPS
 * jumping about (a "walk" of 42 km in two hours), not real movement.
 */
export function isLikelyDrift(mode: string, distanceM: number | null, durationS: number | null): boolean {
  if (mode === "stationary") return (distanceM ?? 0) > 0;
  const max = MAX_KMH[mode];
  if (!max || !distanceM || !durationS || durationS < 60) return false;
  return distanceM / 1000 / (durationS / 3600) > max;
}

/**
 * A place name as people say it: without the postcode the geocoder puts first
 * ("00990 Esimerkkitie 2" → "Esimerkkitie 2").
 */
export function displayName(name: string): string {
  const stripped = name.replace(/^\s*(?:[A-Z]{1,2}-)?\d{5}\s+(?=\S*\D)/, "").trim();
  return stripped || name;
}

/** "artwork" → "Artwork", "bus stop" → "Bus stop": a lowercase tag as a label. */
export const sentenceCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// TEMP (insights fork, for screenshots while Overview is mid-rewrite): remove.
