/** "2 h 15 min", "45 min", "30 s". */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return `${m} min`;
  return `${Math.round(seconds)} s`;
}

/** Meters -> "1.2 km" / "340 m". */
export function formatDistance(meters: number | null | undefined): string {
  if (meters == null) return "—";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

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

export function formatDateLong(iso: string | Date | null | undefined, timeZone?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  });
}

/** Like formatDuration, but days once it passes two days: "189 d 11 h". */
export function formatLongDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 48 * 3600) return formatDuration(seconds);
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  return h > 0 ? `${d} d ${h} h` : `${d} d`;
}

/** Meters -> "1,235 km" / "8.4 km" / "340 m": whole km once the decimal stops mattering. */
export function formatKm(meters: number | null | undefined): string {
  if (meters == null) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return km < 100 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString("en-GB")} km`;
}

const ymd = (s: string) => new Date(`${s}T12:00:00Z`);

/** "YYYY-MM" -> "October 2026" (or "Oct" with `short`). */
export function formatMonth(month: string, short = false): string {
  return ymd(`${month}-01`).toLocaleDateString("en-GB", {
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

/** Local calendar dates -> "3–5 Oct 2026", "28 Sep – 2 Oct 2026", "30 Dec 2026 – 2 Jan 2027". */
export function formatDateRange(start: string, end: string): string {
  const f = (s: string, o: Intl.DateTimeFormatOptions) =>
    ymd(s).toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });
  const full: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  if (start === end) return f(start, full);
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${f(start, full)} – ${f(end, full)}`;
  if (start.slice(0, 7) !== end.slice(0, 7)) {
    return `${f(start, { day: "numeric", month: "short" })} – ${f(end, full)}`;
  }
  return `${Number(start.slice(8))}–${f(end, full)}`;
}

/** A local calendar date -> "Saturday 3 October". */
export function formatDay(date: string): string {
  return ymd(date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

export function formatDateShort(iso: string | Date | null | undefined, timeZone?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });
}
