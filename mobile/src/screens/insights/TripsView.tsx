import type { ReactNode } from "react";
import { View } from "react-native";
import { useTheme } from "../../design/theme";
import { getTrips, type Trip } from "../../insights";
import { fmtKm, plural, tripDates, tripLength, tripsByYear } from "../../insights-logic";
import { Card, EmptyState, ErrorState, Icon, SectionHeader, Skeleton } from "../../ui";
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
        <Text variant="callout" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
          {t.countries.join(", ")}
        </Text>
      ) : null}
    </View>
  );
}

/** Photo-led card: the cover fills the top (16:9), title and dates on a scrim; no cover → a quiet backdrop with a route glyph. */
function PhotoCard({ trip: t, onPress }: { trip: Trip; onPress: () => void }) {
  const th = useTheme();
  return (
    <Card padded={false} style={{ overflow: "hidden" }} onPress={onPress} accessibilityLabel={`${t.name}, ${tripDates(t)}`}>
      <View style={{ aspectRatio: 16 / 9, backgroundColor: PHOTO_BACKDROP }}>
        {t.cover ? (
          <Photo id={t.cover} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
        ) : (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 48, alignItems: "center", justifyContent: "center" }}>
            <Icon name="route" size={32} color="rgba(255,255,255,0.35)" />
          </View>
        )}
        <Scrim />
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: th.space.lg, flexDirection: "row", alignItems: "flex-end", gap: th.space.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="title3" style={[onPhotoText, { fontWeight: "800" }]} numberOfLines={2}>
              {t.name}
            </Text>
            <Text variant="callout" style={[onPhotoText, { opacity: 0.9 }]} tabular>
              {tripDates(t)}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 2 }}>
            <Text variant="headline" style={onPhotoText} tabular>
              {fmtKm(t.distance)}
            </Text>
            <Text variant="callout" style={[onPhotoText, { opacity: 0.9 }]} tabular>
              {tripLength(t)}
            </Text>
          </View>
        </View>
      </View>
      <View style={{ paddingVertical: th.space.md, paddingHorizontal: th.space.lg }}>
        <Footer trip={t} />
      </View>
    </Card>
  );
}

function PlainCard({ trip: t, onPress }: { trip: Trip; onPress: () => void }) {
  const th = useTheme();
  return (
    <Card style={{ gap: th.space.md }} onPress={onPress} accessibilityLabel={`${t.name}, ${tripDates(t)}`}>
      <View style={{ flexDirection: "row", gap: th.space.md, alignItems: "flex-start" }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="headline" numberOfLines={2}>
            {t.name}
          </Text>
          <Text variant="callout" color="textSecondary" tabular>
            {tripDates(t)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <Text variant="headline" tabular>
            {fmtKm(t.distance)}
          </Text>
          <Text variant="callout" color="textSecondary" tabular>
            {tripLength(t)}
          </Text>
        </View>
      </View>
      <Footer trip={t} />
    </Card>
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
          <Skeleton height={248} />
          <Skeleton height={248} />
        </View>
      ) : data.trips.length === 0 ? (
        <Card>
          <EmptyState icon="trip" title="No trips yet" body="A trip appears once you have spent a night away from home." />
        </Card>
      ) : (
        tripsByYear(data.trips).map((g) => (
          <View key={g.year} style={{ gap: 12 }}>
            <SectionHeader title={String(g.year)} trailing={plural(g.trips.length, "trip")} />
            {g.trips.map((t) =>
              photoCards ? <PhotoCard key={t.id} trip={t} onPress={() => onOpen(t)} /> : <PlainCard key={t.id} trip={t} onPress={() => onOpen(t)} />,
            )}
          </View>
        ))
      )}
    </Screen>
  );
}
