import { useCallback } from "react";
import { View } from "react-native";
import { categoryMeta } from "../../design/categories";
import { getCity } from "../../insights";
import { group, placeLabel } from "../../format";
import { fmtCompactDate, fmtLongDuration, plural } from "../../insights-logic";
import type { Pairing } from "../../pairing";
import { Card, EmptyState, ErrorState, IconTile, ListGroup, ListRow, SectionHeader, Skeleton, StatGrid } from "../../ui";
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
  const { authLost } = useSession();
  const fetcher = useCallback((p: Pairing) => getCity(p, name, country), [name, country]);
  const { data, error, reload } = useViewerQuery(fetcher);
  const { refreshing, onRefresh } = useRefresh(reload);

  const places = data?.places ?? [];
  const visits = places.reduce((a, p) => a + p.visitCount, 0);
  const time = places.reduce((a, p) => a + p.totalTime, 0);
  const last = places.map((p) => p.lastVisit).filter((x): x is string => !!x).sort().at(-1) ?? null;
  const subtitle = [country, data && places.length ? `last visited ${fmtCompactDate(last)}` : null].filter(Boolean).join(" · ") || null;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} appBar={<AppBar title={name} subtitle={subtitle} onBack={onBack} backLabel={backLabel} />}>
      {authLost ? <PairingLost /> : null}

      {authLost && !data ? null : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <View style={{ gap: 16 }}>
          <Skeleton height={70} />
          <Skeleton height={300} />
        </View>
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
              const meta = categoryMeta(p.category, p.kind);
              return (
                <ListRow
                  key={p.id}
                  leading={<IconTile icon={meta.icon} />}
                  title={placeLabel(p.name)}
                  titleLines={2}
                  subtitle={`${meta.label} · ${fmtLongDuration(p.totalTime)}`}
                  trailing={plural(p.visitCount, "visit")}
                />
              );
            })}
          </ListGroup>
        </>
      )}
    </Screen>
  );
}
