import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "../../design/theme";
import { getTrips, type Trip } from "../../insights";
import { fmtKm, plural, tripDates, tripLength, tripsByYear } from "../../insights-logic";
import { Card, EmptyState, ErrorState, Skeleton } from "../../ui";
import { Screen } from "../../ui/Screen";
import { useSession, useViewerQuery } from "../../ui/session";
import { Text } from "../../ui/Text";
import { ModeChips, PHOTO_BACKDROP, Photo, Scrim, onPhotoText, useRefresh } from "./parts";

function Footer({ trip: t }: { trip: Trip }) {
  if (t.modes.length === 0 && t.countries.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
      <ModeChips modes={t.modes} />
      {t.countries.length > 0 ? (
        <Text variant="caption" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {t.countries.join(", ")}
        </Text>
      ) : null}
    </View>
  );
}

/** Google Trips style: the cover fills the top, title and dates over its scrim. */
function PhotoCard({ trip: t, onPress }: { trip: Trip; onPress: () => void }) {
  const th = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${t.name}, ${tripDates(t)}`}>
      {({ pressed }) => (
        <Card style={{ padding: 0, overflow: "hidden", opacity: pressed ? 0.85 : 1 }}>
          <View style={{ aspectRatio: 16 / 9 }}>
            {t.cover ? <Photo id={t.cover} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} /> : <View style={{ flex: 1, backgroundColor: PHOTO_BACKDROP }} />}
            <Scrim />
            <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: th.space.lg, flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text variant="title3" style={onPhotoText} numberOfLines={2}>
                  {t.name}
                </Text>
                <Text variant="callout" style={[onPhotoText, { opacity: 0.88 }]}>
                  {tripDates(t)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text variant="headline" style={onPhotoText} tabular>
                  {fmtKm(t.distance)}
                </Text>
                <Text variant="caption" style={[onPhotoText, { opacity: 0.85 }]}>
                  {tripLength(t)}
                </Text>
              </View>
            </View>
          </View>
          <View style={{ padding: th.space.md, paddingHorizontal: th.space.lg }}>
            <Footer trip={t} />
          </View>
        </Card>
      )}
    </Pressable>
  );
}

function PlainCard({ trip: t, onPress }: { trip: Trip; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${t.name}, ${tripDates(t)}`}>
      {({ pressed }) => (
        <Card style={{ gap: 12, opacity: pressed ? 0.85 : 1 }}>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text variant="headline" numberOfLines={2}>
                {t.name}
              </Text>
              <Text variant="caption" color="textSecondary">
                {tripDates(t)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text variant="headline" tabular>
                {fmtKm(t.distance)}
              </Text>
              <Text variant="caption" color="textSecondary">
                {tripLength(t)}
              </Text>
            </View>
          </View>
          <Footer trip={t} />
        </Card>
      )}
    </Pressable>
  );
}

export default function TripsView({ header, onOpen }: { header: ReactNode; onOpen: (t: Trip) => void }) {
  const { authLost } = useSession();
  const { data, error, reload } = useViewerQuery(getTrips);
  const { refreshing, onRefresh } = useRefresh(reload);
  // Photo cards once any trip has a photo; otherwise the plain cards (as on the web).
  const photoCards = !!data?.trips.some((t) => t.cover);
  const home = data?.home;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      {header}
      <Text variant="callout" color="textSecondary">
        {home && home.saved.length > 0
          ? `Nights spent more than 30 km from home (${home.saved.join(", ")}), found automatically.`
          : home
            ? `Nights spent more than 30 km from home${home.city ? ` (${home.city})` : ""}, found automatically.`
            : "Nights spent more than 30 km from home, found automatically."}
      </Text>

      {authLost && !data ? null : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={240} radius={20} />
          <Skeleton height={240} radius={20} />
        </View>
      ) : data.trips.length === 0 ? (
        <Card>
          <EmptyState icon="bag-suitcase-outline" title="No trips yet" body="A trip appears once you have spent a night away from home." />
        </Card>
      ) : (
        tripsByYear(data.trips).map((g) => (
          <View key={g.year} style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 4 }}>
              <Text variant="title3">{g.year}</Text>
              <Text variant="caption" color="textMuted">
                {plural(g.trips.length, "trip")}
              </Text>
            </View>
            {g.trips.map((t) =>
              photoCards ? <PhotoCard key={t.id} trip={t} onPress={() => onOpen(t)} /> : <PlainCard key={t.id} trip={t} onPress={() => onOpen(t)} />,
            )}
          </View>
        ))
      )}
    </Screen>
  );
}
