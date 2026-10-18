// Display formatting (pure).

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
