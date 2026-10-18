import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, TextInput, View } from "react-native";
import { useStyles, useTheme } from "../design/theme";
import { categoryMeta } from "../design/categories";
import { getJSON, type PlaceItem } from "../api";
import { fmtDuration } from "../format";
import { Card, EmptyState, ErrorState, Icon, IconChip, Pill, Skeleton } from "../ui";
import { ScreenHeader } from "../ui/Screen";
import { Text } from "../ui/Text";

function placeName(p: PlaceItem) {
  return p.name && p.name !== "Unknown Location" ? p.name : "Unnamed place";
}

export default function PlacesScreen() {
  const t = useTheme();
  const [places, setPlaces] = useState<PlaceItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      setErr(null);
      setPlaces((await getJSON<{ places: PlaceItem[] }>("/api/places")).places);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      (places ?? []).filter(
        (p) => !q || [placeName(p), p.city ?? "", categoryMeta(p.category).label].some((x) => x.toLowerCase().includes(q)),
      ),
    [places, q],
  );

  const s = useStyles((th) => ({
    root: { flex: 1, backgroundColor: th.c.bg },
    content: { paddingHorizontal: th.layout.gutter, paddingTop: th.space.md, paddingBottom: th.space.xxxl, gap: th.space.md },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: th.space.sm,
      backgroundColor: th.c.surface,
      borderColor: th.c.border,
      borderWidth: 1,
      borderRadius: th.radius.pill,
      paddingHorizontal: th.space.lg,
      height: 48,
      marginBottom: th.space.xs,
    },
    input: { flex: 1, color: th.c.text, fontSize: 15, padding: 0, outlineStyle: "none" as never },
    row: { flexDirection: "row", alignItems: "center", gap: th.space.md, paddingVertical: th.space.md, paddingHorizontal: th.space.md },
  }));

  const header = (
    <View style={{ gap: 14, marginBottom: 4 }}>
      <ScreenHeader title="Places" subtitle={places ? `${places.length.toLocaleString()} places you come back to` : "Where you spend your time"} />
      <View style={s.search}>
        <Icon name="magnify" size={20} color={t.c.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search places, cities, types"
          placeholderTextColor={t.c.textMuted}
          style={s.input}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Clear search">
            <Icon name="close-circle" size={18} color={t.c.textMuted} />
          </Pressable>
        )}
      </View>
      {err && !places && <ErrorState message={err} onRetry={load} />}
      {!places && !err && (
        <View style={{ gap: 10 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height={72} radius={20} />
          ))}
        </View>
      )}
      {places && places.length === 0 && (
        <Card>
          <EmptyState icon="map-marker-multiple-outline" title="No places yet" body="Places appear once you have spent a few minutes somewhere. Keep Matka recording and check back soon." />
        </Card>
      )}
      {places && places.length > 0 && shown.length === 0 && (
        <Card>
          <EmptyState icon="magnify" title="Nothing matches" body={`No place found for “${query.trim()}”. Try a city or a type like “library”.`} />
        </Card>
      )}
    </View>
  );

  return (
    <FlatList
      style={s.root}
      contentContainerStyle={s.content}
      data={shown}
      keyExtractor={(p) => String(p.id)}
      ListHeaderComponent={header}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={t.c.primary}
          colors={[t.c.primary]}
          progressBackgroundColor={t.c.surface}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
      renderItem={({ item: p, index }) => {
        const meta = categoryMeta(p.category);
        const locale = [p.city, p.country === "Finland" ? null : p.country].filter(Boolean).join(", ");
        return (
          <Card style={s.row}>
            <IconChip icon={meta.icon} tint={meta.tint} size={44} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="headline" numberOfLines={1}>
                {placeName(p)}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {meta.label}
                {locale ? ` · ${locale}` : ""}
              </Text>
              {index === 0 && !q && <Pill label="Most visited" icon="star-four-points-outline" tint="amber" />}
            </View>
            <View style={{ alignItems: "flex-end", gap: 2 }}>
              <Text variant="headline" color="primary">
                {p.visitCount.toLocaleString()} {p.visitCount === 1 ? "visit" : "visits"}
              </Text>
              <Text variant="caption" color="textSecondary" tabular>
                {fmtDuration(p.totalTime)}
              </Text>
            </View>
          </Card>
        );
      }}
    />
  );
}
