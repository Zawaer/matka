import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { modeMeta } from "../../design/modes";
import { useTheme } from "../../design/theme";
import { fmtDuration, fmtTime } from "../../format";
import { getTrip, type TripDetail } from "../../insights";
import { fmtDay, fmtKm, fmtDateRange, fmtLongDuration, scaled } from "../../insights-logic";
import type { Pairing } from "../../pairing";
import { Card, Chip, ErrorState, ListGroup, ListRow, ModeIcon, SectionHeader, Skeleton, StatGrid } from "../../ui";
import { BackLink, DetailTitle, Screen } from "../../ui/Screen";
import { PairingLost, useSession, useViewerQuery } from "../../ui/session";
import { Text } from "../../ui/Text";
import { PhotoViewer } from "../../ui/TimelineExtras";
import { ModeChips, Photo, Scrim, onPhotoText, useRefresh } from "./parts";

function leftHome(t: TripDetail): string | null {
  if (!t.departure) return null;
  const back = t.arrival != null ? `, back ${fmtTime(t.arrival)} on ${fmtDay(t.endDate)}.` : ", still away.";
  return `Left home ${fmtTime(t.departure)} on ${fmtDay(t.startDate)}${back}`;
}

export default function TripDetailView({
  id,
  name,
  onBack,
  onOpenCity,
}: {
  id: string;
  name: string;
  onBack: () => void;
  onOpenCity: (city: string, country: string | null) => void;
}) {
  const t = useTheme();
  const { authLost, openDay } = useSession();
  const fetcher = useCallback((p: Pairing) => getTrip(p, id), [id]);
  const { data: trip, error, reload } = useViewerQuery(fetcher);
  const { refreshing, onRefresh } = useRefresh(reload);
  const [viewing, setViewing] = useState<number | null>(null);

  const dates = trip ? `${fmtDateRange(trip.startDate, trip.endDate)}${trip.countries.length ? ` · ${trip.countries.join(", ")}` : ""}` : "";
  const away = trip ? [...trip.cities.filter((c) => c.away)].sort((a, b) => b.duration - a.duration) : [];
  const modes = trip ? [...trip.modes].filter((m) => m.distance > 0 || m.duration > 0).sort((a, b) => b.distance - a.distance) : [];
  const widths = scaled(modes.map((m) => m.distance));

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <BackLink label="Trips" onPress={onBack} />
      {authLost ? <PairingLost /> : null}

      {authLost && !trip ? null : error && !trip ? (
        <>
          <DetailTitle title={name} />
          <ErrorState message={error} onRetry={reload} />
        </>
      ) : !trip ? (
        <View style={{ gap: t.space.lg }}>
          <Skeleton height={230} />
          <Skeleton height={140} />
          <Skeleton height={180} />
        </View>
      ) : (
        <>
          {trip.cover ? (
            <View style={{ aspectRatio: 16 / 9, borderRadius: t.radius.md, overflow: "hidden" }}>
              <Photo id={trip.cover} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
              <Scrim />
              <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: t.space.lg, gap: 2 }}>
                <Text variant="title2" style={onPhotoText} numberOfLines={2} accessibilityRole="header">
                  {trip.name}
                </Text>
                <Text variant="callout" style={[onPhotoText, { opacity: 0.9 }]} tabular>
                  {dates}
                </Text>
              </View>
            </View>
          ) : (
            <DetailTitle title={trip.name} subtitle={dates} />
          )}
          {leftHome(trip) ? (
            <Text variant="callout" color="textSecondary" tabular>
              {leftHome(trip)}
            </Text>
          ) : null}

          {trip.photos.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: t.space.sm, paddingHorizontal: t.layout.gutter }}
              style={{ marginHorizontal: -t.layout.gutter }}
            >
              {trip.photos.map((p, i) => (
                <Pressable key={p} onPress={() => setViewing(i)} accessibilityRole="imagebutton" accessibilityLabel={`Photo ${i + 1} of ${trip.photos.length}`}>
                  <Photo id={p} size="thumbnail" style={{ width: 88, height: 88, borderRadius: t.radius.sm }} />
                </Pressable>
              ))}
            </ScrollView>
          )}

          <StatGrid
            items={[
              { label: "Distance", value: fmtKm(trip.distance) },
              { label: "On the move", value: fmtDuration(trip.duration) },
              { label: "Days", value: String(trip.days) },
              { label: "Nights away", value: String(trip.nights) },
            ]}
          />

          <SectionHeader title="How you travelled" />
          <Card style={{ gap: t.space.lg }}>
            {modes.length === 0 ? (
              <Text variant="callout" color="textSecondary">
                No moves recorded.
              </Text>
            ) : (
              modes.map((m, i) => (
                <View key={m.mode} style={{ flexDirection: "row", alignItems: "center", gap: t.space.md }}>
                  <ModeIcon mode={m.mode} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text variant="headline">{modeMeta(m.mode).label}</Text>
                      <Text variant="callout" color="textSecondary" tabular>
                        {fmtKm(m.distance)}
                      </Text>
                    </View>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: t.c.surfaceAlt, overflow: "hidden" }}>
                      <View style={{ width: `${Math.max(2, widths[i] * 100)}%`, height: 6, borderRadius: 3, backgroundColor: t.mode(m.mode) }} />
                    </View>
                  </View>
                </View>
              ))
            )}
          </Card>

          <SectionHeader title="Cities" />
          {away.length === 0 ? (
            <Card>
              <Text variant="callout" color="textSecondary">
                No named places yet.
              </Text>
            </Card>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.space.sm }}>
              {away.map((c) => (
                <Chip
                  key={`${c.city}/${c.country ?? ""}`}
                  icon="city"
                  label={`${c.city} · ${fmtLongDuration(c.duration)}`}
                  accessibilityLabel={`${c.city}, ${fmtLongDuration(c.duration)}`}
                  onPress={() => onOpenCity(c.city, c.country)}
                />
              ))}
            </View>
          )}

          <SectionHeader title="Day by day" trailing="Tap a day for its timeline" />
          <ListGroup inset={0}>
            {trip.dayList.map((d, i) => (
              <ListRow
                key={d.date}
                title={`Day ${i + 1} · ${fmtDay(d.date, true)}`}
                subtitle={d.cities.length ? d.cities.join(", ") : "No places"}
                below={<View style={{ marginTop: 6 }}><ModeChips modes={d.modes} /></View>}
                trailing={d.distance > 0 ? fmtKm(d.distance) : "–"}
                onPress={() => openDay(d.date)}
                accessibilityLabel={`Day ${i + 1}, ${fmtDay(d.date)}: open timeline`}
              />
            ))}
          </ListGroup>
        </>
      )}
      <PhotoViewer
        set={viewing != null && trip ? { ids: trip.photos, total: trip.photos.length } : null}
        start={viewing ?? 0}
        linkBase={null}
        onClose={() => setViewing(null)}
      />
    </Screen>
  );
}
