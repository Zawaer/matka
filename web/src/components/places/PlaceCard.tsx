import Link from "next/link";
import { formatDuration } from "@/lib/format";
import { categoryIcon, categoryLabel } from "./category";
import type { PlaceListItem } from "@/lib/places";
import { KIND_META, formatRadius } from "@/lib/savedPlaces";

export function PlaceCard({ place }: { place: PlaceListItem }) {
  const name =
    place.name && place.name !== "Unknown Location"
      ? place.name
      : categoryLabel(place.category);
  const locale = [place.city, place.country].filter(Boolean).join(", ");

  return (
    <Link
      href={`/places/${place.id}`}
      className="mk-card group flex flex-col gap-3 p-4 transition-colors hover:border-primary/60"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-xl"
          aria-hidden
        >
          {place.kind ? KIND_META[place.kind].icon : categoryIcon(place.category)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium group-hover:text-primary">
            {name}
          </h3>
          <p className="truncate text-xs text-muted">
            {place.kind ? (
              <span className="font-medium text-primary">
                {KIND_META[place.kind].label}
                {place.radius ? ` · ${formatRadius(place.radius)}` : ""}
              </span>
            ) : (
              categoryLabel(place.category)
            )}
            {locale ? ` · ${locale}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between text-sm">
        <span className="text-muted">
          <span className="font-semibold text-text">{place.visitCount}</span>{" "}
          {place.visitCount === 1 ? "visit" : "visits"}
        </span>
        <span className="text-muted">{formatDuration(place.totalTime)}</span>
      </div>
    </Link>
  );
}
