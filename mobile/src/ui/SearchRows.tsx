// Rows for place search results (PlacesScreen): a place with its visits and
// last visit, and a matching city or country. Rendered inside GroupedItem.

import { categoryMeta } from "../design/categories";
import { group, placeLabel } from "../format";
import { KIND_META } from "../insights-logic";
import { fmtDate, visitLine, type SearchArea, type SearchPlace } from "../search";
import { ListRow } from "./lists";
import { IconTile } from "./primitives";
import { Text } from "./Text";

/** "Restaurant · Tampere" / "3 visits · last 3 Oct"; the row opens the timeline on the last visit. */
export function SearchPlaceRow({ place: p, onOpenDay }: { place: SearchPlace; onOpenDay: (date: string) => void }) {
  const meta = categoryMeta(p.category, p.kind);
  const locale = [p.city, p.country === "Finland" ? null : p.country].filter(Boolean).join(", ");
  const name = placeLabel(p.name, p.kind ? KIND_META[p.kind].label : meta.label);
  const day = p.lastVisitDate ?? p.recentDates[0] ?? null;
  const open = day ? () => onOpenDay(day) : undefined;
  const kindLabel = p.kind ? (p.kind === "other" ? "Saved" : KIND_META[p.kind].label) : meta.label;
  const kind = `${kindLabel}${locale ? ` · ${locale}` : ""}`;

  return (
    <ListRow
      leading={<IconTile icon={p.kind ? KIND_META[p.kind].icon : meta.icon} />}
      title={name}
      titleLines={2}
      subtitle={kind}
      below={
        <Text variant="callout" color="textSecondary" tabular numberOfLines={1}>
          {visitLine(p)}
        </Text>
      }
      onPress={open}
      accessibilityLabel={`${name}, ${kind}, ${visitLine(p)}${open ? ". Opens the timeline on the last visit" : ""}`}
    />
  );
}

export function SearchAreaRow({ area: a, onPress }: { area: SearchArea; onPress: () => void }) {
  return (
    <ListRow
      leading={<IconTile icon={a.type === "city" ? "city" : "world"} />}
      title={a.country ? `${a.name}, ${a.country}` : a.name}
      subtitle={`${group(a.places)} ${a.places === 1 ? "place" : "places"} · ${group(a.visits)} ${a.visits === 1 ? "visit" : "visits"}${
        a.lastVisit ? ` · last ${fmtDate(a.lastVisit.slice(0, 10))}` : ""
      }`}
      onPress={onPress}
    />
  );
}
