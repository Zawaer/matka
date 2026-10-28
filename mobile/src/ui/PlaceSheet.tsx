// A place, opened from Insights → Places or a city's list: what it is, its
// totals, and the days you were there (each opens that day's timeline). The
// recent days come from the server's search (GET /api/search), the one call
// that lists them; without a name to search by, the last visit alone.

import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { categoryMeta } from "../design/categories";
import { useTheme } from "../design/theme";
import { fmtDateShort, group, isNamed, localDateOf, localDay, placeLabel } from "../format";
import { KIND_META, fmtLongDuration } from "../insights-logic";
import { searchPlaces } from "../search";
import type { Place } from "../viewer";
import { ListRow } from "./lists";
import { Button, Divider, IconTile, Skeleton, StatGrid } from "./primitives";
import { useSession } from "./session";
import { Sheet } from "./Sheet";
import { Text } from "./Text";

/** "Restaurant · Tampere": what the place is and where; the generic "Place" is left out. */
export function placeKindLine(p: Pick<Place, "kind" | "category" | "city" | "country">): string {
  const kind = p.kind ? (p.kind === "other" ? "Saved" : KIND_META[p.kind].label) : categoryMeta(p.category).label;
  const locale = [p.city, p.country === "Finland" ? null : p.country].filter(Boolean).join(", ");
  return [kind === "Place" ? null : kind, locale || null].filter(Boolean).join(" · ");
}

export function placeIconName(p: Pick<Place, "kind" | "category">) {
  return p.kind ? KIND_META[p.kind].icon : categoryMeta(p.category, p.kind).icon;
}

export function PlaceSheet({ place, onClose }: { place: Place | null; onClose: () => void }) {
  return place ? <Body key={place.id} place={place} onClose={onClose} /> : null;
}

function Body({ place: p, onClose }: { place: Place; onClose: () => void }) {
  const t = useTheme();
  const { pairing, openDay } = useSession();
  const last = localDateOf(p.lastVisit);
  // null while looking; [] when search can't say (then the last visit alone).
  const [days, setDays] = useState<string[] | null>(isNamed(p.name) ? null : []);
  useEffect(() => {
    if (!isNamed(p.name)) return;
    let live = true;
    searchPlaces(pairing, p.name).then((r) => {
      if (!live) return;
      const hit = r.ok ? r.data.places.find((h) => h.id === p.id) : undefined;
      setDays(hit?.recentDates ?? []);
    });
    return () => {
      live = false;
    };
  }, [pairing, p.id, p.name]);

  const shown = days && days.length > 0 ? days : last ? [last] : [];
  const open = (date: string) => {
    onClose();
    openDay(date);
  };
  const sub = placeKindLine(p);

  return (
    <Sheet
      visible
      onClose={onClose}
      title={placeLabel(p.name)}
      subtitle={sub || undefined}
      footer={
        // The days above open the timeline; editing (name, saved kind) lives on the web's place page.
        <View style={{ flex: 1 }}>
          <Button label="Open on the web" icon="external" variant="secondary" onPress={() => void Linking.openURL(`${pairing.server}/places/${p.id}`)} />
        </View>
      }
    >
      <StatGrid
        size="sm"
        columns={3}
        items={[
          { label: "Visits", value: group(p.visitCount) },
          { label: "Time", value: fmtLongDuration(p.totalTime) },
          { label: "Last visit", value: last ? fmtDateShort(localDay(last)!).replace(/^\w+ /, "") : "—" },
        ]}
      />
      <View style={{ gap: t.space.sm }}>
        <Text variant="title3" accessibilityRole="header">
          {days && days.length > 1 ? "Recent days" : "Last visit"}
        </Text>
        <View style={{ marginHorizontal: -t.space.lg }}>
          {days == null ? (
            [0, 1, 2].map((i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, height: 56, paddingHorizontal: t.space.lg }}>
                <Skeleton height={32} width={32} radius={t.radius.sm} />
                <Skeleton height={14} width="40%" radius={6} />
              </View>
            ))
          ) : shown.length === 0 ? (
            <Text variant="callout" color="textSecondary" style={{ paddingHorizontal: t.space.lg }}>
              No visits yet.
            </Text>
          ) : (
            shown.map((d, i) => (
              <View key={d}>
                {i > 0 ? <Divider inset={t.space.lg + 32 + 12} /> : null}
                <ListRow
                  leading={<IconTile icon="calendar" size={32} />}
                  title={fmtDateShort(localDay(d)!)}
                  onPress={() => open(d)}
                  accessibilityLabel={`${fmtDateShort(localDay(d)!)}. Open timeline`}
                />
              </View>
            ))
          )}
        </View>
      </View>
    </Sheet>
  );
}

/** The tile for a place row, shared by Places and a city's list. */
export function PlaceTile({ place }: { place: Pick<Place, "kind" | "category"> }) {
  return <IconTile icon={placeIconName(place)} />;
}
