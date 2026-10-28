import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useTheme } from "../../design/theme";
import { fmtTime } from "../../format";
import { getTrip, type TripDetail } from "../../insights";
import { fmtDay, fmtDateRange, fmtKm, fmtLongDuration, modeShares, plural, roundShares } from "../../insights-logic";
import type { Pairing } from "../../pairing";
import { Card, ErrorState, ListGroup, ListRow, SectionHeader, Skeleton, StatGrid } from "../../ui";
import { ModeLegend, ModeShareBar } from "../../ui/ModeShare";
import { AppBar, Screen } from "../../ui/Screen";
import { PairingLost, useSession, useViewerQuery } from "../../ui/session";
import { Text } from "../../ui/Text";
import { PhotoViewer } from "../../ui/TimelineExtras";
import { Photo, Scrim, modeWords, onPhotoText, useRefresh } from "./parts";

/** "Out 07:30 Fri 7 Aug · back 18:40 Wed 12 Aug" (or "· still away"). */
function outAndBack(t: TripDetail): string | null {
  if (!t.departure) return null;
  const out = `Out ${fmtTime(t.departure)} ${fmtDay(t.startDate, true)}`;
  return `${out} · ${t.arrival != null ? `back ${fmtTime(t.arrival)} ${fmtDay(t.endDate, true)}` : "still away"}`;
}

export default function TripDetailView({
  id,
  name,
  backLabel,
  onBack,
  onOpenCity,
}: {
  id: string;
  name: string;
  backLabel: string;
  onBack: () => void;
  onOpenCity: (city: string, country: string | null) => void;
}) {
  const t = useTheme();
  const { authLost, openDay } = useSession();
  const fetcher = useCallback((p: Pairing) => getTrip(p, id), [id]);
  const { data: trip, error, reload } = useViewerQuery(fetcher);
  const { refreshing, onRefresh } = useRefresh(reload);
  const [viewing, setViewing] = useState<number | null>(null);

  // One line of facts; the dates come from "Out … · back …" when it is known, so they aren't said twice.
  const outBack = trip ? outAndBack(trip) : null;
  const meta = trip
    ? [outBack ? null : fmtDateRange(trip.startDate, trip.endDate), plural(trip.days, "day"), plural(trip.nights, "night"), trip.countries.join(", ") || null]
        .filter(Boolean)
        .join(" · ")
    : null;
  const away = trip ? [...trip.cities.filter((c) => c.away)].sort((a, b) => b.duration - a.duration) : [];
  const shares = trip ? modeShares(trip.modes) : [];
  const pct = roundShares(shares.map((m) => m.share));
  const cover = trip?.cover ?? null;

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={onRefresh}
      appBar={<AppBar title={trip?.name ?? (error ? name : null)} onBack={onBack} backLabel={backLabel} />}
    >
      {authLost ? <PairingLost /> : null}

      {authLost && !trip ? null : error && !trip ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !trip ? (
        // The loading shape: the full-bleed 16:9 hero, the stat strip, the share card.
        <View style={{ gap: t.space.lg }}>
          <View style={{ aspectRatio: 16 / 9, marginHorizontal: -t.layout.gutter, marginTop: -t.space.sm, backgroundColor: t.c.surfaceAlt }} />
          <Card padded={false} style={{ flexDirection: "row" }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ flex: 1, gap: 6, padding: t.space.md, borderLeftWidth: i ? 1 : 0, borderLeftColor: t.c.border }}>
                <Skeleton height={12} width="55%" radius={6} />
                <Skeleton height={18} width="50%" radius={6} />
              </View>
            ))}
          </Card>
          <Skeleton height={18} width={170} radius={6} style={{ marginTop: t.space.lg }} />
          <Skeleton height={110} />
        </View>
      ) : (
        <>
          {cover ? (
            // Full-bleed hero: the cover edge to edge under the app bar.
            <View style={{ aspectRatio: 16 / 9, marginHorizontal: -t.layout.gutter, marginTop: -t.space.sm }}>
              <Photo id={cover} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
              {/* Darkening over the bottom half so the two caption lines hold on a bright photo. */}
              <Scrim from={0.4} to={0.78} />
              <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: t.layout.gutter, paddingBottom: t.space.lg, gap: 2 }}>
                <Text variant="headline" style={onPhotoText} tabular numberOfLines={1}>
                  {meta}
                </Text>
                {outBack ? (
                  <Text variant="callout" style={[onPhotoText, { opacity: 0.92 }]} tabular numberOfLines={1}>
                    {outBack}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={{ gap: 2 }}>
              <Text variant="callout" color="textSecondary" tabular>
                {meta}
              </Text>
              {outBack ? (
                <Text variant="callout" color="textSecondary" tabular>
                  {outBack}
                </Text>
              ) : null}
            </View>
          )}

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
            size="sm"
            columns={3}
            items={[
              { label: "Distance", value: fmtKm(trip.distance) },
              { label: "On the move", value: fmtLongDuration(trip.duration) },
              { label: "Cities", value: String(away.length) },
            ]}
          />

          <SectionHeader title="How you travelled" />
          <Card style={{ gap: t.space.lg }}>
            {shares.length === 0 ? (
              <Text variant="callout" color="textSecondary">
                No moves recorded.
              </Text>
            ) : (
              <>
                <ModeShareBar shares={shares} />
                <ModeLegend shares={shares} percents={pct} />
              </>
            )}
          </Card>

          <SectionHeader title="Cities" trailing={away.length ? "Time on this trip" : undefined} />
          {away.length === 0 ? (
            <Card>
              <Text variant="callout" color="textSecondary">
                No named places yet.
              </Text>
            </Card>
          ) : (
            <ListGroup inset={0}>
              {away.map((c) => (
                <ListRow
                  key={`${c.city}/${c.country ?? ""}`}
                  title={c.city}
                  subtitle={c.country}
                  trailing={fmtLongDuration(c.duration)}
                  onPress={() => onOpenCity(c.city, c.country)}
                  accessibilityLabel={`${c.city}${c.country ? `, ${c.country}` : ""}, ${fmtLongDuration(c.duration)} on this trip`}
                />
              ))}
            </ListGroup>
          )}

          <SectionHeader title="Day by day" />
          <ListGroup inset={0}>
            {trip.dayList.map((d, i) => {
              const modes = modeWords(d.modes);
              const sub = [d.cities.length ? d.cities.join(", ") : "No places", modes || null].filter(Boolean).join(" · ");
              return (
                <ListRow
                  key={d.date}
                  title={`Day ${i + 1} · ${fmtDay(d.date, true)}`}
                  subtitle={sub}
                  trailing={d.distance > 0 ? fmtKm(d.distance) : "–"}
                  onPress={() => openDay(d.date)}
                  accessibilityLabel={`Day ${i + 1}, ${fmtDay(d.date)}: ${sub}. Open timeline`}
                />
              );
            })}
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
