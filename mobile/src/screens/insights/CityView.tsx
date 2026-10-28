import { useCallback, useState } from "react";
import { View } from "react-native";
import { useTheme } from "../../design/theme";
import { getCity } from "../../insights";
import { group, isNamed, placeLabel } from "../../format";
import { fmtCompactDate, fmtLongDuration, plural } from "../../insights-logic";
import type { Pairing } from "../../pairing";
import { Card, EmptyState, ErrorState, ListGroup, ListRow, RowsSkeleton, SectionHeader, Skeleton, StatGrid } from "../../ui";
import { PlaceSheet, PlaceTile, placeKindLine } from "../../ui/PlaceSheet";
import { Text } from "../../ui/Text";
import type { Place } from "../../viewer";
import { AppBar, Screen } from "../../ui/Screen";
import { PairingLost, useSession, useViewerQuery } from "../../ui/session";
import { useRefresh } from "./parts";

/** One city's places, most visited first. Times here are all your visits, not one trip. */
export default function CityView({
  name,
  country,
  backLabel,
  onBack,
}: {
  name: string;
  country: string | null;
  backLabel: string;
  onBack: () => void;
}) {
  const t = useTheme();
  const { authLost } = useSession();
  const [opened, setOpened] = useState<Place | null>(null);
  const fetcher = useCallback((p: Pairing) => getCity(p, name, country), [name, country]);
  const { data, error, reload } = useViewerQuery(fetcher);
  const { refreshing, onRefresh } = useRefresh(reload);

  const places = data?.places ?? [];
  const visits = places.reduce((a, p) => a + p.visitCount, 0);
  const time = places.reduce((a, p) => a + p.totalTime, 0);
  const last = places.map((p) => p.lastVisit).filter((x): x is string => !!x).sort().at(-1) ?? null;
  const subtitle = [country, data && places.length ? `last visited ${fmtCompactDate(last)}` : null].filter(Boolean).join(" · ") || null;

  return (
    // A single-line app bar like every pushed view; the country and last visit open the content.
    <Screen refreshing={refreshing} onRefresh={onRefresh} padTop="tabs" appBar={<AppBar title={name} onBack={onBack} backLabel={backLabel} />}>
      {authLost ? <PairingLost /> : null}
      {country || data ? (
        <Text variant="callout" color="textSecondary" tabular style={{ marginBottom: -t.space.xs }}>
          {subtitle ?? " "}
        </Text>
      ) : null}

      {authLost && !data ? null : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <CitySkeleton />
      ) : places.length === 0 ? (
        <Card>
          <EmptyState icon="city" title="No places here" body="No visited places are in this city any more." />
        </Card>
      ) : (
        <>
          <StatGrid
            size="sm"
            columns={3}
            items={[
              { label: "Places", value: group(places.length) },
              { label: "Visits", value: group(visits) },
              { label: "Time, all visits", value: fmtLongDuration(time) },
            ]}
          />
          <SectionHeader title="Places" trailing="Most visited first" />
          <ListGroup>
            {places.map((p) => {
              const kind = placeKindLine({ ...p, city: null, country: null });
              return (
                <ListRow
                  key={p.id}
                  leading={<PlaceTile place={p} />}
                  title={placeLabel(p.name)}
                  titleLines={2}
                  muted={!isNamed(p.name)}
                  subtitle={kind || null}
                  trailing={plural(p.visitCount, "visit")}
                  trailingSub={fmtLongDuration(p.totalTime)}
                  onPress={() => setOpened(p)}
                />
              );
            })}
          </ListGroup>
        </>
      )}
      <PlaceSheet place={opened} onClose={() => setOpened(null)} />
    </Screen>
  );
}

/** The loading shape: the three-up stat strip, the list header and place rows with tiles. */
export function CitySkeleton() {
  const t = useTheme();
  return (
    <View style={{ gap: t.space.lg }}>
      <Card padded={false} style={{ flexDirection: "row" }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flex: 1, gap: 6, paddingHorizontal: t.space.md, paddingVertical: t.space.md, borderLeftWidth: i ? 1 : 0, borderLeftColor: t.c.border }}>
            <Skeleton height={12} width="55%" radius={6} />
            <Skeleton height={18} width="45%" radius={6} />
          </View>
        ))}
      </Card>
      <Skeleton height={18} width={90} radius={6} style={{ marginTop: t.space.lg }} />
      <RowsSkeleton />
    </View>
  );
}
