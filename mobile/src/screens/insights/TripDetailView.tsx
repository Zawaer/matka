import { useCallback, useState } from "react";
import { Image, Modal, Pressable, ScrollView, View } from "react-native";
import { modeMeta } from "../../design/modes";
import { useTheme } from "../../design/theme";
import { fmtDuration, fmtTime } from "../../format";
import { assetSource, getTrip, type TripDetail } from "../../insights";
import { fmtDay, fmtKm, fmtDateRange, fmtLongDuration, scaled } from "../../insights-logic";
import type { Pairing } from "../../pairing";
import { Card, ErrorState, Icon, Skeleton } from "../../ui";
import { Screen } from "../../ui/Screen";
import { PairingLost, useSession, useViewerQuery } from "../../ui/session";
import { Text } from "../../ui/Text";
import { BackRow, Chip, ModeChips, ModeIcon, Photo, Scrim, StatRow, StatTile, onPhotoText, useRefresh } from "./parts";

function leftHome(t: TripDetail): string | null {
  if (!t.departure) return null;
  const back = t.arrival != null ? `, back ${fmtTime(t.arrival)} on ${fmtDay(t.endDate)}.` : ", still away.";
  return `Left home ${fmtTime(t.departure)} on ${fmtDay(t.startDate)}${back}`;
}

/** Full-screen photo; tap anywhere to close. */
function PhotoViewer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { pairing } = useSession();
  return (
    <Modal visible={id != null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} accessibilityLabel="Close photo" style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.94)", justifyContent: "center" }}>
        {id ? <Image source={assetSource(pairing, id, "preview")} style={{ width: "100%", height: "80%" }} resizeMode="contain" /> : null}
        <View style={{ position: "absolute", top: 48, right: 20 }}>
          <Icon name="close" size={28} color="#FFFFFF" />
        </View>
      </Pressable>
    </Modal>
  );
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
  const [viewing, setViewing] = useState<string | null>(null);

  const dates = trip ? `${fmtDateRange(trip.startDate, trip.endDate)}${trip.countries.length ? ` · ${trip.countries.join(", ")}` : ""}` : "";
  const away = trip ? [...trip.cities.filter((c) => c.away)].sort((a, b) => b.duration - a.duration) : [];
  const modes = trip ? [...trip.modes].filter((m) => m.distance > 0 || m.duration > 0).sort((a, b) => b.distance - a.distance) : [];
  const widths = scaled(modes.map((m) => m.distance));

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <BackRow label="Trips" onPress={onBack} />
      {authLost ? <PairingLost /> : null}

      {authLost && !trip ? null : error && !trip ? (
        <>
          <Text variant="title1">{name}</Text>
          <ErrorState message={error} onRetry={reload} />
        </>
      ) : !trip ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={230} radius={20} />
          <Skeleton height={76} radius={20} />
          <Skeleton height={180} radius={20} />
        </View>
      ) : (
        <>
          {trip.cover ? (
            <View style={{ aspectRatio: 3 / 2, borderRadius: t.radius.lg, overflow: "hidden" }}>
              <Photo id={trip.cover} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
              <Scrim />
              <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: t.space.xl }}>
                <Text variant="title1" style={onPhotoText} numberOfLines={2}>
                  {trip.name}
                </Text>
                <Text variant="callout" style={[onPhotoText, { opacity: 0.9 }]}>
                  {dates}
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ gap: 2 }}>
              <Text variant="title1">{trip.name}</Text>
              <Text variant="callout" color="textSecondary">
                {dates}
              </Text>
            </View>
          )}
          {leftHome(trip) ? (
            <Text variant="callout" color="textSecondary" style={{ marginTop: -6 }}>
              {leftHome(trip)}
            </Text>
          ) : null}

          {trip.photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -t.layout.gutter }}>
              <View style={{ width: t.layout.gutter - 8 }} />
              {trip.photos.map((p) => (
                <Pressable key={p} onPress={() => setViewing(p)} accessibilityRole="imagebutton" accessibilityLabel="Open photo">
                  <Photo id={p} size="thumbnail" style={{ width: 96, height: 96, borderRadius: 12 }} />
                </Pressable>
              ))}
              <View style={{ width: t.layout.gutter - 8 }} />
            </ScrollView>
          )}

          <StatRow>
            <StatTile label="Days" value={String(trip.days)} />
            <StatTile label="Nights away" value={String(trip.nights)} />
            <StatTile label="Distance" value={fmtKm(trip.distance)} accent />
            <StatTile label="Time on the move" value={fmtDuration(trip.duration)} />
          </StatRow>

          <Card style={{ gap: 14 }}>
            <Text variant="title3">How you travelled</Text>
            {modes.length === 0 ? (
              <Text variant="callout" color="textSecondary">
                No moves recorded.
              </Text>
            ) : (
              modes.map((m, i) => (
                <View key={m.mode} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <ModeIcon mode={m.mode} size={30} />
                  <View style={{ flex: 1, gap: 5 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text variant="callout" style={{ fontWeight: "800" }}>
                        {modeMeta(m.mode).label}
                      </Text>
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

          <Card style={{ gap: 12 }}>
            <Text variant="title3">Cities visited</Text>
            {away.length === 0 ? (
              <Text variant="callout" color="textSecondary">
                No named places yet.
              </Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {away.map((c) => (
                  <Chip key={`${c.city}/${c.country ?? ""}`} label={`${c.city} · ${fmtLongDuration(c.duration)}`} on={false} onPress={() => onOpenCity(c.city, c.country)} />
                ))}
              </View>
            )}
          </Card>

          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 4 }}>
            <Text variant="title3">Day by day</Text>
            <Text variant="caption" color="textMuted">
              Tap a day for its timeline
            </Text>
          </View>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            {trip.dayList.map((d, i) => (
              <Pressable
                key={d.date}
                onPress={() => openDay(d.date)}
                accessibilityRole="button"
                accessibilityLabel={`Day ${i + 1}, ${fmtDay(d.date)}: open timeline`}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: t.space.md,
                  paddingHorizontal: t.space.lg,
                  borderBottomWidth: i === trip.dayList.length - 1 ? 0 : 1,
                  borderBottomColor: t.c.border,
                  backgroundColor: pressed ? t.c.surfaceAlt : "transparent",
                })}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="headline" numberOfLines={1}>
                    <Text variant="headline" color="textMuted">
                      Day {i + 1} ·{" "}
                    </Text>
                    {fmtDay(d.date, true)}
                  </Text>
                  <Text variant="caption" color="textSecondary" numberOfLines={1}>
                    {d.cities.length ? d.cities.join(" · ") : "—"}
                  </Text>
                  <ModeChips modes={d.modes} />
                </View>
                <Text variant="callout" tabular color={d.distance > 0 ? "text" : "textMuted"} style={{ fontWeight: "800" }}>
                  {d.distance > 0 ? fmtKm(d.distance) : "—"}
                </Text>
                <Icon name="chevron-right" size={20} color={t.c.textMuted} />
              </Pressable>
            ))}
          </Card>
        </>
      )}
      <PhotoViewer id={viewing} onClose={() => setViewing(null)} />
    </Screen>
  );
}
