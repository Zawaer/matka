// A trip as a cover: the best Immich photo of it, or else a drawing of its
// routes (lib/insights/routeSketch.ts), with the title and dates on a scrim.
// Used on the Trips page and the Overview. Server-safe.

import Link from "next/link";
import { cx } from "@/components/ui";
import type { Cover } from "@/lib/covers";
import { formatDateRange, formatKm } from "@/lib/format";
import type { AwayTrip } from "@/lib/insights/awayTrips";
import { SKETCH_H, SKETCH_W, type RouteSketch } from "@/lib/insights/routeSketch";
import { MODE_META, type ModeKey } from "@/lib/modes";
import { COVER_BACKDROP, CoverPhoto, CoverScrim } from "./Cover";

/** "30 Sep – 4 Oct": the year is left out when the trip doesn't cross one (lists group by year). */
export function tripDates(t: Pick<AwayTrip, "startDate" | "endDate">) {
  const r = formatDateRange(t.startDate, t.endDate);
  return t.startDate.slice(0, 4) === t.endDate.slice(0, 4) ? r.replace(/ \d{4}$/, "") : r;
}

/** "30 Sep – 4 Oct · 5 days · 2,403 km · Germany". */
export function tripLine(t: AwayTrip) {
  return [
    tripDates(t) + (t.arrival == null ? " (ongoing)" : ""),
    `${t.days} ${t.days === 1 ? "day" : "days"}`,
    formatKm(t.distance),
    t.countries.join(", ") || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const modeColor = (mode: string) => (MODE_META[mode as ModeKey] ?? MODE_META.unknown).color;

/**
 * The routes drawn in their mode colours over a map silhouette (land at
 * surface on water at surface-3, as on the basemaps), nights as neutral dots.
 */
export function RouteSketchSvg({ sketch, className }: { sketch: RouteSketch; className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${SKETCH_W} ${SKETCH_H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className={cx("absolute inset-0 h-full w-full", className)}
    >
      <rect width={SKETCH_W} height={SKETCH_H} fill={sketch.land ? "var(--mk-surface-3)" : "var(--mk-surface)"} />
      {sketch.land && <path d={sketch.land} fill="var(--mk-surface)" shapeRendering="crispEdges" />}
      {sketch.paths.map((p, i) => (
        <path key={`c${i}`} d={p.d} fill="none" stroke="var(--mk-surface)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {sketch.paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill="none"
          stroke={modeColor(p.mode)}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={p.mode === "flying" ? "5 4" : undefined}
        />
      ))}
      {sketch.stops.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={3.5} fill="var(--mk-text)" stroke="var(--mk-surface)" strokeWidth={2} />
      ))}
    </svg>
  );
}

export function TripCard({
  trip: t,
  cover,
  sketch,
  className,
}: {
  trip: AwayTrip;
  cover?: Cover;
  sketch?: RouteSketch;
  className?: string;
}) {
  const photo = !!cover;
  return (
    <Link
      href={`/insights/trips/${t.id}`}
      className={cx(
        "group relative block aspect-[16/9] overflow-hidden rounded-card border border-border shadow-card transition-colors hover:border-strong",
        photo ? COVER_BACKDROP : "bg-surface-2",
        // One height for every card in a row: the box is the aspect ratio, the text sits on it.
        className,
      )}
    >
      {cover ? (
        <>
          <CoverPhoto assetId={cover.assetId} className="transition-transform duration-300 group-hover:scale-[1.03]" />
          <CoverScrim />
        </>
      ) : sketch ? (
        <>
          <RouteSketchSvg sketch={sketch} />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-linear-to-t from-surface via-surface/80 via-30% to-transparent to-50%" />
        </>
      ) : (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-linear-to-t from-surface to-transparent" />
      )}
      <div
        className={cx(
          "absolute inset-x-0 bottom-0 p-4",
          photo ? "text-white [text-shadow:0_1px_6px_rgb(0_0_0/0.5)]" : "text-text",
        )}
      >
        <h3 className="truncate text-heading group-hover:underline">{t.name}</h3>
        <p className={cx("mt-0.5 truncate text-meta", photo ? "text-white/85" : "text-secondary")}>{tripLine(t)}</p>
      </div>
    </Link>
  );
}
