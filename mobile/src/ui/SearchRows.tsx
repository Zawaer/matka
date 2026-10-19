// Rows for place search results (PlacesScreen): a place with its last visit
// and recent days, and a matching city or country.

import { Pressable, View } from "react-native";
import { categoryMeta } from "../design/categories";
import { useStyles, useTheme } from "../design/theme";
import { placeLabel } from "../format";
import { KIND_META } from "../insights-logic";
import { fmtDate, visitLine, type SearchArea, type SearchPlace } from "../search";
import { Card, IconChip, Pill } from "./primitives";
import { Text } from "./Text";

export function SearchPlaceRow({ place: p, onOpenDay }: { place: SearchPlace; onOpenDay: (date: string) => void }) {
  const t = useTheme();
  const s = useStyles((th) => ({
    row: { flexDirection: "row", alignItems: "center", gap: th.space.md },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: th.space.sm, marginLeft: 44 + th.space.md },
    chip: {
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: th.radius.pill,
      borderWidth: 1,
      borderColor: th.c.border,
      backgroundColor: th.c.surface,
    },
  }));
  const meta = categoryMeta(p.category);
  const locale = [p.city, p.country === "Finland" ? null : p.country].filter(Boolean).join(", ");
  const name = placeLabel(p.name, p.kind ? KIND_META[p.kind].label : meta.label);
  const open = p.lastVisitDate ? () => onOpenDay(p.lastVisitDate!) : undefined;

  return (
    <Card style={{ paddingVertical: t.space.md, paddingHorizontal: t.space.md }}>
      <Pressable
        onPress={open}
        disabled={!open}
        accessibilityRole="button"
        accessibilityHint={open ? "Opens the timeline on the last visit" : undefined}
        style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
      >
        {p.kind ? (
          <IconChip icon={KIND_META[p.kind].icon} tint="violet" size={44} />
        ) : (
          <IconChip icon={meta.icon} tint={meta.tint} size={44} />
        )}
        <View style={{ flex: 1, gap: 3 }}>
          <Text variant="headline" numberOfLines={2}>
            {name}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {p.kind ? (p.kind === "other" ? "Saved" : KIND_META[p.kind].label) : meta.label}
            {locale ? ` · ${locale}` : ""}
          </Text>
          <Text variant="callout" color={p.lastVisitDate ? "text" : "textSecondary"} numberOfLines={2}>
            {visitLine(p)}
          </Text>
        </View>
      </Pressable>
      {p.recentDates.length > 0 && (
        <View style={s.chips}>
          {p.recentDates.map((d) => (
            <Pressable
              key={d}
              onPress={() => onOpenDay(d)}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={`Open ${fmtDate(d, true)} on the timeline`}
              style={({ pressed }) => [s.chip, pressed && { backgroundColor: t.c.primarySoft }]}
            >
              <Text variant="caption" color="textSecondary" tabular>
                {fmtDate(d)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </Card>
  );
}

export function SearchAreaRow({ area: a, onPress }: { area: SearchArea; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 12 }}>
        <IconChip icon={a.type === "city" ? "city-variant-outline" : "earth"} tint="sky" size={44} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text variant="headline" numberOfLines={1}>
            {a.name}
            {a.country ? <Text variant="callout" color="textSecondary">{` · ${a.country}`}</Text> : null}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {a.places} {a.places === 1 ? "place" : "places"} · {a.visits} {a.visits === 1 ? "visit" : "visits"}
            {a.lastVisit ? ` · last ${fmtDate(a.lastVisit.slice(0, 10))}` : ""}
          </Text>
        </View>
        <Pill label={a.type === "city" ? "City" : "Country"} tint="sky" />
      </Card>
    </Pressable>
  );
}
