import { useCallback, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useTheme } from "../../design/theme";
import { getWorld, type WorldEntry, type WorldSort } from "../../insights";
import { fmtLongDuration, fmtShortDate, plural, worldCounts } from "../../insights-logic";
import type { Pairing } from "../../pairing";
import { Button, Card, EmptyState, ErrorState, Skeleton } from "../../ui";
import { Screen } from "../../ui/Screen";
import { useSession, useViewerQuery } from "../../ui/session";
import { Text } from "../../ui/Text";
import { BackRow, Chip, IconTile, ListRow, SegmentBar, StatRow, StatTile, useRefresh } from "./parts";

const SORT_LABEL: Record<WorldSort, string> = {
  visits: "Visits",
  places: "Places",
  time: "Time",
  recent: "Recent",
  name: "A–Z",
};

/** Rows rendered before "Show all": long city lists stay quick to open. */
const FIRST_ROWS = 80;

/**
 * Countries or cities, sortable. With `country` it lists that country's cities
 * (a pushed view, with a back row instead of the Insights header).
 */
export default function WorldView({
  header,
  country,
  onBack,
  onOpenCountry,
  onOpenCity,
}: {
  header?: ReactNode;
  country?: string;
  onBack?: () => void;
  onOpenCountry: (name: string) => void;
  onOpenCity: (name: string, country: string | null) => void;
}) {
  const t = useTheme();
  const { authLost } = useSession();
  const [sort, setSort] = useState<WorldSort>("visits");
  const [view, setView] = useState<"countries" | "cities">(country ? "cities" : "countries");
  const [all, setAll] = useState(false);
  const fetcher = useCallback((p: Pairing) => getWorld(p, sort), [sort]);
  const { data, error, loading, reload } = useViewerQuery(fetcher);
  const { refreshing, onRefresh } = useRefresh(reload);

  const cities = data ? (country ? data.cities.filter((c) => c.country === country) : data.cities) : [];
  const list: WorldEntry[] = view === "cities" ? cities : (data?.countries ?? []);
  const shown = all ? list : list.slice(0, FIRST_ROWS);
  const placeCount = cities.reduce((a, c) => a + c.places, 0);

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      {country ? (
        <>
          <BackRow label="Countries" onPress={onBack ?? (() => {})} />
          <View style={{ gap: 2 }}>
            <Text variant="title1">{country}</Text>
            <Text variant="callout" color="textSecondary">
              {data ? `${plural(cities.length, "city", "cities")} · ${plural(placeCount, "place")}` : "Cities you have been to"}
            </Text>
          </View>
        </>
      ) : (
        <>
          {header}
          <Text variant="callout" color="textSecondary">
            The cities and countries your places are in.
          </Text>
        </>
      )}

      {authLost && !data ? null : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Skeleton height={76} radius={20} style={{ flex: 1, width: undefined }} />
            <Skeleton height={76} radius={20} style={{ flex: 1, width: undefined }} />
          </View>
          <Skeleton height={44} radius={14} />
          <Skeleton height={320} radius={20} />
        </View>
      ) : (
        <>
          {!country && (
            <StatRow>
              <StatTile label="Countries" value={String(data.countries.length)} accent />
              <StatTile label="Cities" value={String(data.cities.length)} />
              <StatTile label="Places" value={placeCount.toLocaleString()} style={{ flexBasis: "100%" }} />
            </StatRow>
          )}
          {!country && (
            <SegmentBar
              label="Show"
              options={[
                { value: "countries", label: "Countries" },
                { value: "cities", label: "Cities" },
              ]}
              value={view}
              onChange={(v) => {
                setView(v);
                setAll(false);
              }}
            />
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -t.layout.gutter }} contentContainerStyle={{ gap: 6, paddingHorizontal: t.layout.gutter, alignItems: "center" }}>
            <Text variant="caption" color="textMuted" style={{ marginRight: 4 }}>
              Sort
            </Text>
            {(Object.keys(SORT_LABEL) as WorldSort[]).map((k) => (
              <Chip key={k} label={SORT_LABEL[k]} on={k === sort} onPress={() => setSort(k)} />
            ))}
          </ScrollView>

          {list.length === 0 ? (
            <Card>
              <EmptyState icon="earth" title="No cities yet" body="They appear as places get their addresses from the geocoder." />
            </Card>
          ) : (
            <Card style={{ padding: 0, overflow: "hidden", opacity: loading ? 0.5 : 1 }}>
              {shown.map((e, i) => (
                <ListRow
                  key={`${e.name}/${e.country ?? ""}`}
                  leading={<IconTile icon={view === "cities" ? "city-variant-outline" : "flag-outline"} />}
                  title={view === "cities" && !country && e.country ? `${e.name} · ${e.country}` : e.name}
                  subtitle={worldCounts(e)}
                  trailing={fmtLongDuration(e.duration)}
                  trailingSub={`Last ${fmtShortDate(e.lastVisit)}`}
                  onPress={() => (view === "cities" ? onOpenCity(e.name, e.country) : onOpenCountry(e.name))}
                  last={i === shown.length - 1}
                />
              ))}
            </Card>
          )}
          {shown.length < list.length && (
            <View style={{ alignItems: "center" }}>
              <Button label={`Show all ${list.length.toLocaleString()}`} variant="secondary" onPress={() => setAll(true)} />
            </View>
          )}
          {!country && data.unplaced > 0 && (
            <Text variant="caption" color="textMuted">
              {data.unplaced} {data.unplaced === 1 ? "place has" : "places have"} no address yet.
            </Text>
          )}
        </>
      )}
    </Screen>
  );
}
