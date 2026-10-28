import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FlatList, Pressable, RefreshControl, TextInput, View } from "react-native";
import { categoryMeta } from "../design/categories";
import { useStyles, useTheme } from "../design/theme";
import { fmtDuration, placeLabel } from "../format";
import { KIND_META, mostVisitedId } from "../insights-logic";
import { Card, EmptyState, ErrorState, Icon, IconChip, Pill, Skeleton } from "../ui";
import { ScreenHeader } from "../ui/Screen";
import { SearchAreaRow, SearchPlaceRow } from "../ui/SearchRows";
import { PairingLost, useSession, useViewerQuery } from "../ui/session";
import { Text } from "../ui/Text";
import { searchPlaces, type SearchArea, type SearchPlace, type SearchResults } from "../search";
import { getPlaces, type Place } from "../viewer";

const SEARCH_DEBOUNCE_MS = 250;

/** One row of the list: a place, or (while searching) a search hit, a city/country or a heading. */
type Row =
  | { type: "place"; key: string; place: Place }
  | { type: "hit"; key: string; hit: SearchPlace }
  | { type: "area"; key: string; area: SearchArea }
  | { type: "heading"; key: string; title: string };

/**
 * The server's search (GET /api/search) for the query, debounced. Until its
 * answer for the current query arrives, `results` is null and the screen
 * filters the loaded list itself.
 */
function usePlaceSearch(query: string) {
  const { pairing, authLost, onUnauthorized } = useSession();
  const [state, setState] = useState<{ query: string; results: SearchResults | null; error: string | null }>({
    query: "",
    results: null,
    error: null,
  });
  const seq = useRef(0);
  useEffect(() => {
    if (!query || authLost) return;
    const n = ++seq.current;
    const timer = setTimeout(async () => {
      const r = await searchPlaces(pairing, query);
      if (n !== seq.current) return;
      if (r.ok) setState({ query, results: r.data, error: null });
      else {
        setState({ query, results: null, error: r.error });
        if (r.unauthorized) onUnauthorized();
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, pairing, authLost, onUnauthorized]);
  const current = state.query === query;
  return { results: current ? state.results : null, error: current ? state.error : null };
}

const placeName = (p: Place) => placeLabel(p.name);

/** `top`: shown as a segment of Insights, under that header instead of its own title. */
export default function PlacesScreen({ top }: { top?: ReactNode }) {
  const t = useTheme();
  const { authLost, openDay, openInsights } = useSession();
  const { data, error: err, reload } = useViewerQuery(getPlaces);
  // A renamed place keeps existing after its visits are gone; it isn't one you come back to.
  const places = useMemo(() => data?.filter((p) => p.visitCount > 0), [data]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");

  const mostVisited = useMemo(() => mostVisitedId(places ?? []), [places]);
  const trimmed = query.trim();
  const q = trimmed.toLowerCase();
  const search = usePlaceSearch(trimmed);
  const shown = useMemo(
    () =>
      (places ?? []).filter(
        (p) => !q || [placeName(p), p.city ?? "", categoryMeta(p.category).label].some((x) => x.toLowerCase().includes(q)),
      ),
    [places, q],
  );
  // While searching, the server's results (accents, streets, last visits); until
  // they arrive (or if the server can't search), the list filtered here.
  const results = q ? search.results : null;
  const rows = useMemo<Row[]>(() => {
    if (!results) return shown.map((p) => ({ type: "place", key: `p${p.id}`, place: p }));
    const hits: Row[] = results.places.map((h) => ({ type: "hit", key: `h${h.id}`, hit: h }));
    if (results.areas.length === 0) return hits;
    const areas: Row[] = [
      { type: "heading", key: "areas", title: "Cities and countries" },
      ...results.areas.map((a): Row => ({ type: "area", key: `a${a.type}/${a.name}/${a.country ?? ""}`, area: a })),
    ];
    // "tallinn": the city itself before the places that are only in it.
    if (results.places.every((h) => h.match === "area")) {
      return [...areas, ...(hits.length ? [{ type: "heading", key: "places", title: "Places" } as Row] : []), ...hits];
    }
    return [...hits, ...areas];
  }, [results, shown]);
  const searching = !!q && !results && !search.error;
  const noMatches = !!q && !!places && places.length > 0 && rows.length === 0 && !searching;

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
      {top ? (
        <>
          {top}
          <Text variant="callout" color="textSecondary">
            {places ? `${places.length.toLocaleString()} places you come back to` : "Where you spend your time"}
          </Text>
        </>
      ) : (
        <ScreenHeader title="Places" subtitle={places ? `${places.length.toLocaleString()} places you come back to` : "Where you spend your time"} />
      )}
      {authLost ? <PairingLost /> : null}
      <View style={s.search}>
        <Icon name="magnify" size={20} color={t.c.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search places, streets, cities"
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
      {err && !places && !authLost && <ErrorState message={err} onRetry={reload} />}
      {!places && !err && !authLost && (
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
      {q && search.error && !results && places && shown.length > 0 ? (
        <Text variant="caption" color="textSecondary">
          Showing matches from this list; search on the server isn't available right now.
        </Text>
      ) : null}
      {searching && rows.length === 0 && (
        <Text variant="callout" color="textSecondary">
          Searching…
        </Text>
      )}
      {noMatches && (
        <Card>
          <EmptyState icon="magnify" title="Nothing matches" body={`No place found for “${trimmed}”. Try part of a name, a street, a city or a type like “library”.`} />
        </Card>
      )}
    </View>
  );

  return (
    <FlatList
      style={s.root}
      contentContainerStyle={s.content}
      data={rows}
      keyExtractor={(r) => r.key}
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
            await reload();
            setRefreshing(false);
          }}
        />
      }
      renderItem={({ item }) => {
        if (item.type === "hit") return <SearchPlaceRow place={item.hit} onOpenDay={openDay} />;
        if (item.type === "area") return <SearchAreaRow area={item.area} onPress={() => openInsights("world")} />;
        if (item.type === "heading") {
          return (
            <Text variant="overline" color="textSecondary" style={{ marginTop: 8 }}>
              {item.title}
            </Text>
          );
        }
        const p = item.place;
        const meta = categoryMeta(p.category);
        const locale = [p.city, p.country === "Finland" ? null : p.country].filter(Boolean).join(", ");
        return (
          <Card style={s.row}>
            <IconChip icon={meta.icon} tint={meta.tint} size={44} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="headline" numberOfLines={2}>
                {placeName(p)}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {meta.label}
                {locale ? ` · ${locale}` : ""}
              </Text>
              {(p.kind || p.id === mostVisited) && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {p.kind ? <Pill label={p.kind === "other" ? "Saved" : KIND_META[p.kind].label} icon={KIND_META[p.kind].icon} tint="violet" /> : null}
                  {p.id === mostVisited ? <Pill label="Most visited" icon="star-four-points-outline" tint="amber" /> : null}
                </View>
              )}
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
