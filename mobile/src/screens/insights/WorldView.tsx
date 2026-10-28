import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "../../design/theme";
import { fmtLongDuration, group } from "../../format";
import { WORLD_SORTS, getWorld, type WorldEntry, type WorldSort } from "../../insights";
import { countryCode, worldMeta, worldTrailing } from "../../insights-logic";
import type { Pairing } from "../../pairing";
import { Button, Card, EmptyState, ErrorState, Icon, ListGroup, ListRow, RowsSkeleton, Segmented, Sheet, Skeleton, StatGrid } from "../../ui";
import { AppBar, Screen } from "../../ui/Screen";
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

/** A country's ISO code on the neutral 40 tile ("FI"); a globe when the name isn't known. */
function CountryTile({ name }: { name: string }) {
  const t = useTheme();
  const code = countryCode(name);
  return (
    <View style={{ width: 40, height: 40, borderRadius: t.radius.sm, backgroundColor: t.c.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
      {code ? (
        <Text variant="label" color="textSecondary" style={{ letterSpacing: 0.5 }}>
          {code}
        </Text>
      ) : (
        <Icon name="world" size={20} color={t.c.textSecondary} />
      )}
    </View>
  );
}

/** The sort orders as a radio list in a bottom sheet (opened from "Sort: Visits"). */
function SortSheet({ visible, value, onPick, onClose }: { visible: boolean; value: WorldSort; onPick: (s: WorldSort) => void; onClose: () => void }) {
  const t = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title="Sort by">
      <View style={{ marginHorizontal: -t.space.xl, marginTop: -t.space.md }}>
        {WORLD_SORTS.map((k) => {
          const on = k === value;
          return (
            <Pressable
              key={k}
              onPress={() => {
                onPick(k);
                onClose();
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: t.space.lg,
                minHeight: 56,
                paddingHorizontal: t.space.xl,
                backgroundColor: pressed ? t.c.surfaceAlt : "transparent",
              })}
            >
              <Icon name={on ? "radioOn" : "radioOff"} size={20} color={on ? t.c.primary : t.c.textMuted} />
              <Text variant="body">{SORT_LABEL[k]}</Text>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

/**
 * Countries or cities, sortable. With `country` it lists that country's cities
 * (a pushed view, with a back-arrow app bar instead of the Insights header).
 */
export default function WorldView({
  country,
  backLabel,
  onBack,
  onOpenCountry,
  onOpenCity,
}: {
  country?: string;
  backLabel?: string;
  onBack?: () => void;
  onOpenCountry: (name: string) => void;
  onOpenCity: (name: string, country: string | null) => void;
}) {
  const t = useTheme();
  const { authLost } = useSession();
  const [sort, setSort] = useState<WorldSort>("visits");
  const [sorting, setSorting] = useState(false);
  const [view, setView] = useState<"countries" | "cities">(country ? "cities" : "countries");
  const [all, setAll] = useState(false);
  const fetcher = useCallback((p: Pairing) => getWorld(p, sort), [sort]);
  const { data, error, loading, reload } = useViewerQuery(fetcher);
  const { refreshing, onRefresh } = useRefresh(reload);

  const cities = data ? (country ? data.cities.filter((c) => c.country === country) : data.cities) : [];
  const list: WorldEntry[] = view === "cities" ? cities : (data?.countries ?? []);
  const shown = all ? list : list.slice(0, FIRST_ROWS);
  const placeCount = cities.reduce((a, c) => a + c.places, 0);
  const visitCount = cities.reduce((a, c) => a + c.visits, 0);
  const timeTotal = cities.reduce((a, c) => a + c.duration, 0);

  const sortButton = (
    <Pressable
      onPress={() => setSorting(true)}
      accessibilityRole="button"
      accessibilityLabel={`Sort by ${SORT_LABEL[sort]}. Change`}
      hitSlop={4}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        height: 40,
        paddingHorizontal: t.space.sm,
        marginRight: -t.space.sm,
        borderRadius: t.radius.sm,
        backgroundColor: pressed ? t.c.surfaceAlt : "transparent",
      })}
    >
      <Text variant="label" color="primary">
        Sort: {SORT_LABEL[sort]}
      </Text>
      <Icon name="expand" size={16} color={t.c.primary} />
    </Pressable>
  );

  // A single-line app bar like every pushed view; the counts open the content.
  const appBar = country ? <AppBar title={country} onBack={onBack ?? (() => {})} backLabel={backLabel ?? "World"} /> : undefined;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} appBar={appBar} padTop="tabs">
      {authLost && !data ? null : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        // The loading shape: the stat strip, the list header row, then rows.
        <View style={{ gap: t.space.lg }}>
          <Card padded={false} style={{ flexDirection: "row" }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ flex: 1, gap: 6, padding: t.space.md, borderLeftWidth: i ? 1 : 0, borderLeftColor: t.c.border }}>
                <Skeleton height={12} width="55%" radius={6} />
                <Skeleton height={18} width="40%" radius={6} />
              </View>
            ))}
          </Card>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 48 }}>
            <Skeleton height={40} width={country ? 70 : 200} radius={country ? 6 : 20} />
            <Skeleton height={16} width={90} radius={6} />
          </View>
          <RowsSkeleton rows={6} tile={!country} />
        </View>
      ) : !country && data.countries.length === 0 && data.cities.length === 0 ? (
        <Card>
          <EmptyState icon="world" title="No cities yet" body="They appear as places get their addresses from the geocoder." />
        </Card>
      ) : (
        <>
          {country ? (
            <StatGrid
              size="sm"
              columns={3}
              items={[
                { label: "Cities", value: group(cities.length) },
                { label: "Visits", value: group(visitCount) },
                { label: "Time", value: fmtLongDuration(timeTotal) },
              ]}
            />
          ) : (
            <StatGrid
              size="sm"
              columns={3}
              items={[
                { label: "Countries", value: group(data.countries.length) },
                { label: "Cities", value: group(data.cities.length) },
                { label: "Places", value: group(placeCount) },
              ]}
            />
          )}

          {/* The list's header, one 48 row: what it lists (a segmented switch on World), and the sort as a trailing text button. */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: t.space.md, minHeight: 48, marginTop: t.space.sm }}>
            {country ? (
              <Text variant="title3" accessibilityRole="header">
                Cities
              </Text>
            ) : (
              <View style={{ width: 216 }}>
                <Segmented
                  role="tablist"
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
              </View>
            )}
            {sortButton}
          </View>

          {list.length === 0 ? (
            <Card>
              <EmptyState
                icon="world"
                title={view === "cities" ? "No cities yet" : "No countries yet"}
                body="They appear as places get their addresses from the geocoder."
              />
            </Card>
          ) : (
            <ListGroup dim={loading} inset={view === "cities" ? 0 : 40}>
              {shown.map((e) => (
                <ListRow
                  key={`${e.name}/${e.country ?? ""}`}
                  leading={view === "cities" ? undefined : <CountryTile name={e.name} />}
                  title={view === "cities" && !country && e.country ? `${e.name}, ${e.country}` : e.name}
                  subtitle={worldMeta(e, sort)}
                  trailing={worldTrailing(e, sort)}
                  onPress={() => (view === "cities" ? onOpenCity(e.name, e.country) : onOpenCountry(e.name))}
                />
              ))}
            </ListGroup>
          )}
          {shown.length < list.length && (
            <View style={{ alignItems: "center" }}>
              <Button label={`Show all ${group(list.length)}`} variant="secondary" onPress={() => setAll(true)} />
            </View>
          )}
          {!country && data.unplaced > 0 && (
            <Text variant="caption" color="textMuted" style={{ paddingHorizontal: t.space.lg }}>
              {data.unplaced} {data.unplaced === 1 ? "place has" : "places have"} no address yet.
            </Text>
          )}
        </>
      )}
      <SortSheet visible={sorting} value={sort} onPick={setSort} onClose={() => setSorting(false)} />
    </Screen>
  );
}
