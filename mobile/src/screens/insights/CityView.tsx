import { useCallback } from "react";
import { View } from "react-native";
import { categoryMeta } from "../../design/categories";
import { getCity } from "../../insights";
import { placeLabel } from "../../format";
import { fmtLongDuration, fmtShortDate, plural } from "../../insights-logic";
import type { Pairing } from "../../pairing";
import { Card, EmptyState, ErrorState, IconTile, ListGroup, ListRow, Skeleton, StatGrid } from "../../ui";
import { BackLink, DetailTitle, Screen } from "../../ui/Screen";
import { PairingLost, useSession, useViewerQuery } from "../../ui/session";
import { useRefresh } from "./parts";

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
      <BackLink label={backLabel} onPress={onBack} />
      <DetailTitle
        title={name}
        subtitle={[country, data && places.length ? `Last visited ${fmtShortDate(last)}` : null].filter(Boolean).join(" · ") || " "}
      />
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
              { label: "Places", value: String(places.length) },
              { label: "Visits", value: visits.toLocaleString() },
              { label: "Time spent", value: fmtLongDuration(time) },
            ]}
          />
          <ListGroup>
            {places.map((p) => {
              const meta = categoryMeta(p.category, p.kind);
              return (
                <ListRow
                  key={p.id}
                  leading={<IconTile icon={meta.icon} tone={p.kind ? "accent" : "neutral"} />}
                  title={placeLabel(p.name)}
                  subtitle={meta.label}
                  trailing={plural(p.visitCount, "visit")}
                  trailingSub={fmtLongDuration(p.totalTime)}
                />
              );
            })}
          </ListGroup>
        </>
      )}
    </Screen>
  );
}
