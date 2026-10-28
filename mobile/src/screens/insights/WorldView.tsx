import { useCallback, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useTheme } from "../../design/theme";
import { getWorld, type WorldEntry, type WorldSort } from "../../insights";
import { fmtCompactDate, fmtLongDuration, plural, worldCounts } from "../../insights-logic";
import type { Pairing } from "../../pairing";
import { Button, Card, Chip, EmptyState, ErrorState, IconTile, ListGroup, ListRow, Segmented, Skeleton, StatGrid } from "../../ui";
import { BackLink, DetailTitle, Screen } from "../../ui/Screen";
import { useSession, useViewerQuery } from "../../ui/session";
import { Text } from "../../ui/Text";
import { useRefresh } from "./parts";

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
          <BackLink label="World" onPress={onBack ?? (() => {})} />
          <DetailTitle title={country} subtitle={data ? `${plural(cities.length, "city", "cities")} · ${plural(placeCount, "place")}` : "Cities you have been to"} />
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
        <View style={{ gap: t.space.lg }}>
          <Skeleton height={70} />
          <Skeleton height={44} />
          <Skeleton height={340} />
        </View>
      ) : !country && data.countries.length === 0 && data.cities.length === 0 ? (
        <Card>
          <EmptyState icon="world" title="No cities yet" body="They appear as places get their addresses from the geocoder." />
        </Card>
      ) : (
        <>
          {!country && (
            <StatGrid
              size="sm"
              columns={3}
              items={[
                { label: "Countries", value: String(data.countries.length) },
                { label: "Cities", value: String(data.cities.length) },
                { label: "Places", value: placeCount.toLocaleString() },
              ]}
            />
          )}
          {!country && (
            <Segmented
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -t.layout.gutter, flexGrow: 0 }}
            contentContainerStyle={{ gap: t.space.sm, paddingHorizontal: t.layout.gutter, alignItems: "center", height: 48 }}
          >
            <Text variant="callout" color="textSecondary" style={{ marginRight: t.space.xs }}>
              Sort by
            </Text>
            {(Object.keys(SORT_LABEL) as WorldSort[]).map((k) => (
              <Chip key={k} label={SORT_LABEL[k]} selected={k === sort} onPress={() => setSort(k)} />
            ))}
          </ScrollView>

          {list.length === 0 ? (
            <Card>
              <EmptyState
                icon="world"
                title={view === "cities" ? "No cities yet" : "No countries yet"}
                body="They appear as places get their addresses from the geocoder."
              />
            </Card>
          ) : (
            <ListGroup dim={loading}>
              {shown.map((e) => (
                <ListRow
                  key={`${e.name}/${e.country ?? ""}`}
                  leading={<IconTile icon={view === "cities" ? "city" : "country"} />}
                  title={view === "cities" && !country && e.country ? `${e.name}, ${e.country}` : e.name}
                  subtitle={worldCounts(e)}
                  trailing={fmtLongDuration(e.duration)}
                  trailingSub={fmtCompactDate(e.lastVisit)}
                  onPress={() => (view === "cities" ? onOpenCity(e.name, e.country) : onOpenCountry(e.name))}
                />
              ))}
            </ListGroup>
          )}
          {shown.length < list.length && (
            <View style={{ alignItems: "center" }}>
              <Button label={`Show all ${list.length.toLocaleString()}`} variant="secondary" onPress={() => setAll(true)} />
            </View>
          )}
          {!country && data.unplaced > 0 && (
            <Text variant="caption" color="textMuted" style={{ paddingHorizontal: t.space.lg }}>
              {data.unplaced} {data.unplaced === 1 ? "place has" : "places have"} no address yet.
            </Text>
          )}
        </>
      )}
    </Screen>
  );
}
