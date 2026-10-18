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
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}
