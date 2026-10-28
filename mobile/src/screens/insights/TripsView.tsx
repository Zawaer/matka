import { View } from "react-native";
import { useTheme } from "../../design/theme";
import { getTrips, type Trip } from "../../insights";
import { plural, tripDates, tripMeta, tripsByYear } from "../../insights-logic";
import { Button, Card, EmptyState, ErrorState, Icon, SectionHeader, Skeleton } from "../../ui";
import { Screen } from "../../ui/Screen";
import { useSession, useViewerQuery } from "../../ui/session";
import { Text } from "../../ui/Text";
import { PHOTO_BACKDROP, Photo, Scrim, onPhotoText, useRefresh } from "./parts";

/**
 * Photo-led card (Polarsteps): the cover fills it (16:9), the title (22/600)
 * and one meta line sit on a gradient, both left-aligned. No cover: a quiet
 * tonal backdrop with a muted glyph (dark in dark mode, light in light mode).
 */
function PhotoCard({ trip: t, onPress }: { trip: Trip; onPress: () => void }) {
  const th = useTheme();
  const photo = !!t.cover;
  const fg = photo ? onPhotoText : { color: th.c.text };
  return (
    <Card padded={false} style={{ overflow: "hidden" }} onPress={onPress} accessibilityLabel={`${t.name}, ${tripDates(t)}`}>
      <View style={{ aspectRatio: 16 / 9, backgroundColor: photo ? PHOTO_BACKDROP : th.c.surfaceAlt }}>
        {photo ? (
          <>
            <Photo id={t.cover!} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
            <Scrim />
          </>
        ) : (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 56, alignItems: "center", justifyContent: "center" }}>
            <Icon name="trip" size={32} color={th.c.textMuted} />
          </View>
        )}
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: th.space.lg, gap: 2 }}>
          <Text variant="title2" style={fg} numberOfLines={2}>
            {t.name}
          </Text>
          <Text variant="callout" style={photo ? [onPhotoText, { opacity: 0.92 }] : { color: th.c.textSecondary }} tabular numberOfLines={1}>
            {tripMeta(t)}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function PlainCard({ trip: t, onPress }: { trip: Trip; onPress: () => void }) {
  const th = useTheme();
  return (
    <Card style={{ gap: 2 }} onPress={onPress} accessibilityLabel={`${t.name}, ${tripDates(t)}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: th.space.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="headline" numberOfLines={2}>
            {t.name}
          </Text>
          <Text variant="callout" color="textSecondary" tabular numberOfLines={1}>
            {tripMeta(t)}
          </Text>
        </View>
        <Icon name="chevronRight" size={20} color={th.c.textMuted} />
      </View>
    </Card>
  );
}

export default function TripsView({ onOpen }: { onOpen: (t: Trip) => void }) {
  const t = useTheme();
  const { authLost, goTab } = useSession();
  const { data, error, reload } = useViewerQuery(getTrips);
  const { refreshing, onRefresh } = useRefresh(reload);
  // Photo cards once any trip has a photo; otherwise the plain cards (as on the web).
  const photoCards = !!data?.trips.some((t) => t.cover);

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Text variant="callout" color="textSecondary">
        Trips are nights you spent 30 km or more from home.
      </Text>

      {authLost && !data ? null : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <View style={{ gap: t.space.md }}>
          <Skeleton height={28} width="30%" radius={6} />
          <Skeleton height={194} />
          <Skeleton height={194} />
        </View>
      ) : data.trips.length === 0 ? (
        <Card>
          <EmptyState
            icon="trip"
            title="No trips yet"
            body="A trip appears once you have spent a night away from home with recording on."
            action={<Button label="Open recorder" icon="tabRecorder" variant="tonal" onPress={() => goTab("recorder")} />}
          />
        </Card>
      ) : (
        tripsByYear(data.trips).map((g) => (
          <View key={g.year} style={{ gap: t.space.md }}>
            <SectionHeader title={String(g.year)} trailing={plural(g.trips.length, "trip")} />
            {g.trips.map((tr) =>
              photoCards ? <PhotoCard key={tr.id} trip={tr} onPress={() => onOpen(tr)} /> : <PlainCard key={tr.id} trip={tr} onPress={() => onOpen(tr)} />,
            )}
          </View>
        ))
      )}
    </Screen>
  );
}
