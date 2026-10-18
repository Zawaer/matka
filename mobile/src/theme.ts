// Viewer theme: the shared dark tokens (src/ui/theme.ts) plus transport-mode
// colours and display helpers for the viewer screens.
import { C as BASE } from "./ui/theme";
import type { Mode } from "./viewer";

export const C = {
  ...BASE,
  // transport-mode colors (mirror web)
  walking: "#34d399",
  running: "#fb923c",
  cycling: "#f472b6",
  driving: "#60a5fa",
  bus: "#a78bfa",
  train: "#c084fc",
  flying: "#22d3ee",
  boat: "#2dd4bf",
  motorcycle: "#f87171",
  stationary: "#8b96ad",
  unknown: "#8b96ad",
};

export const MODE_META: Record<
  Mode,
  { label: string; icon: string; color: string }
> = {
  unknown: { label: "Move", icon: "•", color: C.unknown },
  stationary: { label: "Stop", icon: "⏸", color: C.stationary },
  walking: { label: "Walk", icon: "🚶", color: C.walking },
  running: { label: "Run", icon: "🏃", color: C.running },
  cycling: { label: "Cycle", icon: "🚲", color: C.cycling },
  driving: { label: "Drive", icon: "🚗", color: C.driving },
  bus: { label: "Bus", icon: "🚌", color: C.bus },
  train: { label: "Train", icon: "🚆", color: C.train },
  flying: { label: "Flight", icon: "✈️", color: C.flying },
  boat: { label: "Boat", icon: "⛴️", color: C.boat },
  motorcycle: { label: "Motorbike", icon: "🏍️", color: C.motorcycle },
};

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
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** OSM category → emoji for place lists. */
export function categoryIcon(cat: string | null): string {
  switch (cat) {
    case "cafe": return "☕";
    case "school":
    case "university":
    case "college": return "🏫";
    case "library": return "📚";
    case "restaurant":
    case "fast_food": return "🍽️";
    case "bar":
    case "pub": return "🍺";
    case "supermarket":
    case "convenience": return "🛒";
    case "station": return "🚉";
    case "platform": return "🚏";
    case "apartments":
    case "house":
    case "residential": return "🏠";
    case "park": return "🌳";
    case "gym":
    case "sports_centre": return "🏋️";
    default: return "📍";
  }
}

/** OSM category value → "Fast Food"; null / "yes" → "Place". */
export function categoryLabel(cat: string | null): string {
  if (!cat || cat === "yes") return "Place";
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
