// The one way a list of places is drawn (Places, a city, search results):
// dense two-line rows in a single card. A 32 px neutral tile, the name, a
// muted line ("Cafe · Helsinki · 6 visits"), the total time on the right.
// No hooks: renders in server and client components alike.

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatCount, formatLongDuration } from "@/lib/format";
import type { PlaceListItem } from "@/lib/places";
import { KIND_META } from "@/lib/savedPlaces";
import { cx, placeIconFor } from "@/components/ui";
import { placeCategoryLine, placeTitle } from "./category";

/** A place nobody (not the geocoder, not the user) has named or typed. */
export const isUnnamed = (p: Pick<PlaceListItem, "name" | "category" | "kind">) =>
  !p.kind && !p.category && (!p.name || p.name === "Unknown Location");

export const visitsLabel = (n: number) => `${formatCount(n)} ${n === 1 ? "visit" : "visits"}`;

/** The 32 px tile: the place's icon on a quiet square. */
export function PlaceTile({ icon: I, className }: { icon: ReturnType<typeof placeIconFor>; className?: string }) {
  return (
    <span aria-hidden className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-secondary", className)}>
      <I size={16} strokeWidth={1.75} />
    </span>
  );
}

/** The divided card the rows sit in. */
export function PlaceList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <ul className={cx("divide-y divide-border overflow-hidden rounded-card border border-border bg-surface shadow-card", className)}>
      {children}
    </ul>
  );
}

/** Row anatomy shared with search results: tile, title, meta, trailing value, chevron. */
export const rowClass =
  "group flex min-h-16 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/60 focus-visible:-outline-offset-2 sm:px-5";

export function PlaceRow({
  place: p,
  showCity = true,
}: {
  place: PlaceListItem;
  /** Leave the city out (on a city's own page). */
  showCity?: boolean;
}) {
  const unnamed = isUnnamed(p);
  const title = unnamed ? (p.street ?? "Unnamed place") : placeTitle(p.name, p.category);
  const what = p.kind ? KIND_META[p.kind].label : unnamed ? null : placeCategoryLine(p.name, p.category);
  const meta = [what, showCity ? p.city : null, visitsLabel(p.visitCount)].filter(Boolean).join(" · ");
  return (
    <li>
      <Link href={`/places/${p.id}`} className={rowClass}>
        <PlaceTile icon={placeIconFor(p.kind, p.category)} />
        <span className="min-w-0 flex-1">
          <span className={cx("block truncate text-label", unnamed ? "text-secondary" : "text-text")}>{title}</span>
          <span className="mt-0.5 block truncate text-meta text-muted">{meta}</span>
        </span>
        <span className="shrink-0 text-right text-meta tabular-nums text-secondary">{formatLongDuration(p.totalTime)}</span>
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="-mr-1 hidden shrink-0 text-muted sm:block" />
      </Link>
    </li>
  );
}
