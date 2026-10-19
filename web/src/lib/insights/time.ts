// Local calendar arithmetic in an IANA time zone, without a date library.
// Dates are "YYYY-MM-DD", months "YYYY-MM"; instants are epoch milliseconds.

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function parts(ms: number, tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Offset of `tz` from UTC at instant `ms`, in milliseconds. */
function offset(ms: number, tz: string): number {
  const p = parts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The local calendar date of an instant. */
export function localDate(ms: number, tz: string): string {
  const p = parts(ms, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** The local month ("YYYY-MM") of an instant. */
export function localMonth(ms: number, tz: string): string {
  return localDate(ms, tz).slice(0, 7);
}

/** The instant of local midnight starting `date`. */
export function startOfDay(date: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d);
  // Two passes settle the offset across a DST change.
  let t = wall - offset(wall, tz);
  t = wall - offset(t, tz);
  return t;
}

/** [start, end) instants of a local day. */
export function dayBounds(date: string, tz: string): [number, number] {
  return [startOfDay(date, tz), startOfDay(addDays(date, 1), tz)];
}

/** [start, end) instants of a local month. */
export function monthBounds(month: string, tz: string): [number, number] {
  return [startOfDay(`${month}-01`, tz), startOfDay(`${addMonths(month, 1)}-01`, tz)];
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
}

/** Whole days from a to b (b later is positive). */
export function daysBetween(a: string, b: string): number {
  const ms = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

/** A real calendar date in YYYY-MM-DD form. */
export function isDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

/** A real month in YYYY-MM form. */
export function isMonth(s: string): boolean {
  return /^\d{4}-\d{2}$/.test(s) && isDate(`${s}-01`);
}
