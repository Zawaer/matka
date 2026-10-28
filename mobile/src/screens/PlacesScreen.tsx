import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FlatList, RefreshControl, TextInput, View } from "react-native";
import { categoryMeta } from "../design/categories";
import { useStyles, useTheme } from "../design/theme";
import { fmtDuration, placeLabel } from "../format";
import { KIND_META, mostVisitedId } from "../insights-logic";
import { Badge, Card, EmptyState, ErrorState, GroupedItem, Icon, IconButton, IconTile, ListRow, Skeleton } from "../ui";
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
    content: { paddingHorizontal: th.layout.gutter, paddingTop: th.space.sm, paddingBottom: th.space.xxl },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: th.space.sm,
      backgroundColor: th.c.surfaceAlt,
      borderRadius: th.radius.sm,
      paddingLeft: th.space.md,
      paddingRight: th.space.xs,
      height: 48,
    },
    input: { flex: 1, color: th.c.text, fontSize: 15, padding: 0, height: 48, outlineStyle: "none" as never },
  }));

  const header = (
    <View style={{ gap: t.space.lg, marginBottom: t.space.lg }}>
      {top ? (
        <>
          {top}
          <Text variant="callout" color="textSecondary" tabular>
            {places ? `${places.length.toLocaleString()} places you come back to` : "Where you spend your time"}
          </Text>
        </>
      ) : (
        <ScreenHeader title="Places" subtitle={places ? `${places.length.toLocaleString()} places you come back to` : "Where you spend your time"} />
      )}
      {authLost ? <PairingLost /> : null}
      <View style={s.search}>
        <Icon name="search" size={20} color={t.c.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search places, streets, cities"
          placeholderTextColor={t.c.textMuted}
          style={s.input}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search places"
        />
        {query.length > 0 && <IconButton icon="close" label="Clear search" color={t.c.textSecondary} onPress={() => setQuery("")} />}
      </View>
      {err && !places && !authLost && <ErrorState message={err} onRetry={reload} />}
      {!places && !err && !authLost && (
        <Skeleton height={6 * 68} />
      )}
      {places && places.length === 0 && (
        <Card>
          <EmptyState icon="place" title="No places yet" body="Places appear once you have spent a few minutes somewhere. Keep Matka recording and check back soon." />
        </Card>
      )}
      {q && search.error && !results && places && shown.length > 0 ? (
        <Text variant="callout" color="textSecondary">
          Showing matches from this list; search on the server isn&apos;t available right now.
        </Text>
      ) : null}
      {searching && rows.length === 0 && (
        <Text variant="callout" color="textSecondary">
          Searching…
        </Text>
      )}
      {noMatches && (
        <Card>
          <EmptyState icon="search" title="Nothing matches" body={`No place found for “${trimmed}”. Try part of a name, a street, a city or a type like “library”.`} />
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
      renderItem={({ item, index }) => {
        if (item.type === "heading") {
          return (
            <Text variant="overline" color="textSecondary" style={{ marginTop: index === 0 ? 0 : t.space.xl, marginBottom: t.space.sm, paddingHorizontal: t.space.lg }}>
              {item.title}
            </Text>
          );
        }
        const prev = rows[index - 1];
        const nextRow = rows[index + 1];
        const first = !prev || prev.type === "heading";
        const last = !nextRow || nextRow.type === "heading";
        let body: ReactNode;
        if (item.type === "hit") body = <SearchPlaceRow place={item.hit} onOpenDay={openDay} />;
        else if (item.type === "area") body = <SearchAreaRow area={item.area} onPress={() => openInsights("world")} />;
        else {
          const p = item.place;
          const meta = categoryMeta(p.category, p.kind);
          const locale = [p.city, p.country === "Finland" ? null : p.country].filter(Boolean).join(", ");
          body = (
            <ListRow
              leading={<IconTile icon={p.kind ? KIND_META[p.kind].icon : meta.icon} tone={p.kind ? "accent" : "neutral"} />}
              title={placeName(p)}
              titleLines={2}
              subtitle={`${meta.label}${locale ? ` · ${locale}` : ""}`}
              trailing={`${p.visitCount.toLocaleString()} ${p.visitCount === 1 ? "visit" : "visits"}`}
              trailingSub={fmtDuration(p.totalTime)}
              below={
                p.kind || p.id === mostVisited ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.space.xs, marginTop: t.space.xs }}>
                    {p.kind ? <Badge label={p.kind === "other" ? "Saved" : KIND_META[p.kind].label} tone="accent" /> : null}
                    {p.id === mostVisited ? <Badge label="Most visited" /> : null}
                  </View>
                ) : null
              }
            />
          );
        }
        return (
          <GroupedItem first={first} last={last}>
            {body}
          </GroupedItem>
        );
      }}
    />
  );
}
