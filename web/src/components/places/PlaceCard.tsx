import Link from "next/link";
import { formatDuration } from "@/lib/format";
import { placeCategoryLine, placeTitle } from "./category";
import type { PlaceListItem } from "@/lib/places";
import { KIND_META, formatRadius } from "@/lib/savedPlaces";
import { cardClass, cx, IconTile, placeIconFor } from "@/components/ui";

export function PlaceCard({ place }: { place: PlaceListItem }) {
  const name = placeTitle(place.name, place.category);
  const what = placeCategoryLine(place.name, place.category);
  const locale = [place.city, place.country].filter(Boolean).join(", ");
  const unnamed = !place.kind && !what && !locale;

  return (
    <Link
      href={`/places/${place.id}`}
      className={cx(cardClass({ padding: "sm", interactive: true }), "group flex flex-col gap-3 p-3.5")}
    >
      <div className="flex items-start gap-3">
        <IconTile
          icon={placeIconFor(place.kind, place.category)}
          tone={place.kind ? "primary" : "neutral"}
        />
        <div className="min-w-0 flex-1">
          <h3 className={cx("truncate text-label", place.name ? "text-text" : "text-secondary")}>{name}</h3>
          <p className="mt-0.5 truncate text-meta text-muted">
            {place.kind ? (
              <span className="font-medium text-primary">
                {KIND_META[place.kind].label}
                {place.radius ? ` · ${formatRadius(place.radius)}` : ""}
              </span>
            ) : (
              what
            )}
            {locale ? `${place.kind || what ? " · " : ""}${locale}` : ""}
            {unnamed ? "Not named yet" : ""}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-border pt-2.5 text-meta text-muted">
        <span>
          <span className="font-medium tabular-nums text-text">{place.visitCount}</span>{" "}
          {place.visitCount === 1 ? "visit" : "visits"}
        </span>
        <span className="tabular-nums">{formatDuration(place.totalTime)}</span>
      </div>
    </Link>
  );
}
