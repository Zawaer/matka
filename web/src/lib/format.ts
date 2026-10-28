// The app's one set of formatters for durations, distances and dates. Every
// page goes through these, so "46 d", "1,137 km" and "28 Oct" read the same
// everywhere. en-GB conventions (day before month), "Sep" not "Sept",
// thousands grouped with a comma.

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
/** Three letters, always: "Sep" (ICU's en-GB says "Sept"). */
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const WEEKDAYS_SHORT = WEEKDAYS.map((d) => d.slice(0, 3));

/** Thousands grouped: 1110 -> "1,110". */
export const formatCount = (n: number) => Math.round(n).toLocaleString("en-GB");

/* ---------------- Durations ---------------- */

/** "2 h 15 min", "45 min", "30 s". For a single visit or trip. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${formatCount(h)} h ${m} min` : `${formatCount(h)} h`;
  if (m > 0) return `${m} min`;
  return `${Math.round(seconds)} s`;
}

/**
 * A total of time, readable at any size: up to a day "6 h 34 min", up to 30
 * days "12 d 3 h", beyond that whole days "46 d" (grouped: "1,204 d").
 */
export function formatLongDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return "—";
  if (seconds < 86_400) return formatDuration(seconds);
  const d = Math.floor(seconds / 86_400);
  if (d < 30) {
    const h = Math.floor((seconds % 86_400) / 3600);
    return h > 0 ? `${d} d ${h} h` : `${d} d`;
  }
  return `${formatCount(Math.round(seconds / 86_400))} d`;
}

/* ---------------- Distances ---------------- */

/** Meters -> "340 m", "8.4 km", "1,137 km": whole km from 100 km on. */
export function formatKm(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return km < 100 ? `${km.toFixed(1)} km` : `${formatCount(km)} km`;
}

/** The same as formatKm (one distance format everywhere). */
export const formatDistance = formatKm;

/* ---------------- Times and dates ---------------- */

// Pass `timeZone` when rendering on the server (the container runs in UTC);
// in the browser the viewer's own zone is the right default.

export function formatTime(iso: string | Date | null | undefined, timeZone?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

/** The calendar date (YYYY-MM-DD) of an instant in a zone (the browser's by default). */
export function localDate(iso: string | Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

/** A YYYY-MM-DD calendar date at noon UTC: safe to read its parts in UTC. */
const ymd = (s: string) => new Date(`${s}T12:00:00Z`);
const parts = (date: string) => {
  const d = ymd(date);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate(), wd: d.getUTCDay() };
};
const daysBetween = (a: string, b: string) => Math.round((ymd(b).getTime() - ymd(a).getTime()) / 86_400_000);

/** "28 Oct", or "28 Oct 2025" outside `today`'s year. Calendar date in, no zone maths. */
export function formatDate(date: string, today: string = localDate(new Date())): string {
  const p = parts(date);
  const base = `${p.day} ${MONTHS_SHORT[p.m]}`;
  return date.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${p.y}`;
}

/**
 * A recent calendar date the way people say it: "Today", "Yesterday", "Mon"
 * within the last week, then "28 Oct", then "28 Oct 2025" in another year.
 */
export function formatRelativeDay(date: string, today: string = localDate(new Date())): string {
  const ago = daysBetween(date, today);
  if (ago === 0) return "Today";
  if (ago === 1) return "Yesterday";
  if (ago > 1 && ago < 7) return WEEKDAYS_SHORT[parts(date).wd];
  return formatDate(date, today);
}

/** An instant as a relative day in a zone: "Today", "Mon", "28 Oct". */
export function formatRelativeInstant(iso: string | Date, timeZone?: string, now: Date = new Date()): string {
  return formatRelativeDay(localDate(iso, timeZone), localDate(now, timeZone));
}

/** A day heading: "Today", "Yesterday", else "Mon 26 Oct" (+ year outside this one). */
export function formatDayHeading(date: string, today: string = localDate(new Date())): string {
  const ago = daysBetween(date, today);
  if (ago === 0) return "Today";
  if (ago === 1) return "Yesterday";
  return `${WEEKDAYS_SHORT[parts(date).wd]} ${formatDate(date, today)}`;
}

/** "Wednesday 28 October" for an instant (the timeline's day title). */
export function formatDateLong(iso: string | Date | null | undefined, timeZone?: string): string {
  if (!iso) return "—";
  return formatDay(localDate(iso, timeZone));
}

/** A local calendar date -> "Saturday 3 October". */
export function formatDay(date: string): string {
  const p = parts(date);
  return `${WEEKDAYS[p.wd]} ${p.day} ${MONTHS[p.m]}`;
}

/** "Friday 4 September 2026": the day title with its year. */
export function formatDayWithYear(date: string): string {
  return `${formatDay(date)} ${parts(date).y}`;
}

/** "19 Oct 2026": a date with its year, for an instant in a zone. */
export function formatDateCompact(iso: string | Date | null | undefined, timeZone?: string): string {
  if (!iso) return "—";
  const p = parts(localDate(iso, timeZone));
  return `${p.day} ${MONTHS_SHORT[p.m]} ${p.y}`;
}

/** "Wed 28 Oct", with the year only outside the current one. */
export function formatDateShort(iso: string | Date | null | undefined, timeZone?: string, now: Date = new Date()): string {
  if (!iso) return "—";
  const date = localDate(iso, timeZone);
  return `${WEEKDAYS_SHORT[parts(date).wd]} ${formatDate(date, localDate(now, timeZone))}`;
}

/** "YYYY-MM" -> "October 2026" (or "Oct" with `short`). */
export function formatMonth(month: string, short = false): string {
  const m = Number(month.slice(5, 7)) - 1;
  return short ? MONTHS_SHORT[m] : `${MONTHS[m]} ${month.slice(0, 4)}`;
}

/** Local calendar dates -> "3–5 Oct 2026", "28 Sep – 2 Oct 2026", "30 Dec 2026 – 2 Jan 2027". */
export function formatDateRange(start: string, end: string): string {
  const full = (s: string) => {
    const p = parts(s);
    return `${p.day} ${MONTHS_SHORT[p.m]} ${p.y}`;
  };
  if (start === end) return full(start);
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${full(start)} – ${full(end)}`;
  if (start.slice(0, 7) !== end.slice(0, 7)) {
    const p = parts(start);
    return `${p.day} ${MONTHS_SHORT[p.m]} – ${full(end)}`;
  }
  return `${parts(start).day}–${full(end)}`;
}

/** Month names for pickers: "January"…, and "Jan"… */
export const MONTH_NAMES = MONTHS;
export const MONTH_NAMES_SHORT = MONTHS_SHORT;
/** Monday-first weekday initials for calendars. */
export const WEEKDAY_NAMES_SHORT = [...WEEKDAYS_SHORT.slice(1), WEEKDAYS_SHORT[0]];
