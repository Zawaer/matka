import { useCallback } from "react";
import { View } from "react-native";
import { categoryMeta } from "../../design/categories";
import { getCity } from "../../insights";
import { placeLabel } from "../../format";
import { fmtLongDuration, fmtShortDate, plural } from "../../insights-logic";
import type { Pairing } from "../../pairing";
import { Card, EmptyState, ErrorState, IconChip, Skeleton } from "../../ui";
import { Screen } from "../../ui/Screen";
import { PairingLost, useSession, useViewerQuery } from "../../ui/session";
import { Text } from "../../ui/Text";
import { BackRow, ListRow, StatRow, StatTile, useRefresh } from "./parts";

/** One city's places, most visited first. */
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

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <BackRow label={backLabel} onPress={onBack} />
      <View style={{ gap: 2 }}>
        <Text variant="title1">{name}</Text>
        <Text variant="callout" color="textSecondary">
          {[country, data && places.length ? `last visited ${fmtShortDate(last)}` : null].filter(Boolean).join(" · ") || " "}
        </Text>
      </View>
      {authLost ? <PairingLost /> : null}

      {authLost && !data ? null : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={76} radius={20} />
          <Skeleton height={300} radius={20} />
        </View>
      ) : places.length === 0 ? (
        <Card>
          <EmptyState icon="city-variant-outline" title="No places here" body="No visited places are in this city any more." />
        </Card>
      ) : (
        <>
          <StatRow>
            <StatTile label="Places" value={String(places.length)} />
            <StatTile label="Visits" value={visits.toLocaleString()} accent />
            <StatTile label="Time spent" value={fmtLongDuration(time)} style={{ flexBasis: "100%" }} />
          </StatRow>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            {places.map((p, i) => {
              const meta = categoryMeta(p.category);
              return (
                <ListRow
                  key={p.id}
                  leading={<IconChip icon={meta.icon} tint={meta.tint} size={40} />}
                  title={placeLabel(p.name)}
                  subtitle={meta.label}
                  trailing={plural(p.visitCount, "visit")}
                  trailingSub={fmtLongDuration(p.totalTime)}
                  last={i === places.length - 1}
                />
              );
            })}
          </Card>
        </>
      )}
    </Screen>
  );
}
