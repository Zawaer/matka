// Rows for place search results (PlacesScreen): a place with its last visit
// and recent days, and a matching city or country. Rendered inside GroupedItem.

import { View } from "react-native";
import { categoryMeta } from "../design/categories";
import { useTheme } from "../design/theme";
import { placeLabel } from "../format";
import { KIND_META } from "../insights-logic";
import { fmtDate, visitLine, type SearchArea, type SearchPlace } from "../search";
import { ListRow } from "./lists";
import { Badge, Chip, IconTile } from "./primitives";
import { Text } from "./Text";

export function SearchPlaceRow({ place: p, onOpenDay }: { place: SearchPlace; onOpenDay: (date: string) => void }) {
  const t = useTheme();
  const meta = categoryMeta(p.category, p.kind);
  const locale = [p.city, p.country === "Finland" ? null : p.country].filter(Boolean).join(", ");
  const name = placeLabel(p.name, p.kind ? KIND_META[p.kind].label : meta.label);
  // With recent days the chips open the timeline (the newest is the last visit); otherwise the row does.
  const open = p.lastVisitDate && p.recentDates.length === 0 ? () => onOpenDay(p.lastVisitDate!) : undefined;
  const kindLabel = p.kind ? (p.kind === "other" ? "Saved" : KIND_META[p.kind].label) : meta.label;

  return (
    <ListRow
      leading={<IconTile icon={p.kind ? KIND_META[p.kind].icon : meta.icon} tone={p.kind ? "accent" : "neutral"} />}
      title={name}
      titleLines={2}
      subtitle={`${kindLabel}${locale ? ` · ${locale}` : ""}`}
      onPress={open}
      accessibilityLabel={`${name}, ${visitLine(p)}${open ? ". Opens the timeline on the last visit" : ""}`}
      below={
        <View style={{ gap: t.space.sm, marginTop: 2 }}>
          <Text variant="callout" color="textSecondary" tabular numberOfLines={2}>
            {visitLine(p)}
          </Text>
          {p.recentDates.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.space.sm, marginTop: t.space.xs }}>
              {p.recentDates.map((d) => (
                <Chip key={d} label={fmtDate(d)} onPress={() => onOpenDay(d)} accessibilityLabel={`Open ${fmtDate(d, true)} on the timeline`} />
              ))}
            </View>
          ) : null}
        </View>
      }
    />
  );
}

export function SearchAreaRow({ area: a, onPress }: { area: SearchArea; onPress: () => void }) {
  return (
    <ListRow
      leading={<IconTile icon={a.type === "city" ? "city" : "world"} />}
      title={a.country ? `${a.name}, ${a.country}` : a.name}
      subtitle={`${a.places} ${a.places === 1 ? "place" : "places"} · ${a.visits} ${a.visits === 1 ? "visit" : "visits"}${
        a.lastVisit ? ` · last ${fmtDate(a.lastVisit.slice(0, 10))}` : ""
      }`}
      below={<View style={{ marginTop: 4 }}><Badge label={a.type === "city" ? "City" : "Country"} /></View>}
      onPress={onPress}
    />
  );
}
