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

export function count(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// ---- viewer ------------------------------------------------------------------

export function fmtDuration(s: number | null | undefined): string {
  if (!s || s < 0) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return `${m} min`;
  return `${Math.round(s)} s`;
}

export function fmtDistance(m: number | null | undefined): string {
  if (m == null) return "—";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Full number below 10,000, otherwise compact: 1,440 / 12.9K / 1.2M. */
export function fmtCompact(n: number): string {
  if (Math.abs(n) < 10_000) return n.toLocaleString();
  const [div, suffix] = Math.abs(n) >= 1_000_000 ? [1_000_000, "M"] : [1_000, "K"];
  const v = n / div;
  return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10}${suffix}`;
}

/** "Today, 09:12", "Yesterday, 17:40", "Fri 16 Oct". */
export function fmtWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days === 0) return `Today, ${fmtTime(iso)}`;
  if (days === 1) return `Yesterday, ${fmtTime(iso)}`;
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
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

export function isNamed(name: string | null | undefined): boolean {
  return !!name && name !== "Unknown Location";
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
