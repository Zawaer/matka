import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { C, fmtDuration } from "../theme";
import { getJSON, type PlaceItem } from "../api";

function categoryIcon(cat: string | null): string {
  switch (cat) {
    case "cafe": return "☕";
    case "school":
    case "university":
    case "college": return "🏫";
    case "library": return "📚";
    case "restaurant":
    case "fast_food": return "🍽️";
    case "bar":
    case "pub": return "🍺";
    case "supermarket":
    case "convenience": return "🛒";
    case "station": return "🚉";
    case "platform": return "🚏";
    case "apartments":
    case "house":
    case "residential": return "🏠";
    case "park": return "🌳";
    case "gym":
    case "sports_centre": return "🏋️";
    default: return "📍";
  }
}

function label(cat: string | null): string {
  if (!cat || cat === "yes") return "Place";
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function PlacesScreen() {
  const [places, setPlaces] = useState<PlaceItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const r = await getJSON<{ places: PlaceItem[] }>("/api/places");
      setPlaces(r.places);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <FlatList
        data={places ?? []}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={ps.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={C.primary}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={
          <>
            <Text style={ps.h1}>Places</Text>
            <Text style={ps.sub}>Where you spend your time</Text>
            {err && <Text style={ps.err}>{err}</Text>}
            {!places && !err && (
              <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
            )}
            {places && places.length === 0 && (
              <View style={ps.empty}>
                <Text style={{ color: C.muted, textAlign: "center" }}>
                  No places yet — they are generated from your visits.
                </Text>
              </View>
            )}
          </>
        }
        renderItem={({ item: p }) => {
          const name =
            p.name && p.name !== "Unknown Location" ? p.name : label(p.category);
          const locale = [p.city, p.country].filter(Boolean).join(", ");
          return (
            <View style={ps.card}>
              <Text style={ps.icon}>{categoryIcon(p.category)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={ps.name} numberOfLines={1}>{name}</Text>
                <Text style={ps.meta} numberOfLines={1}>
                  {label(p.category)}{locale ? ` · ${locale}` : ""}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={ps.count}>{p.visitCount}×</Text>
                <Text style={ps.meta}>{fmtDuration(p.totalTime)}</Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const ps = StyleSheet.create({
  container: { padding: 20, paddingTop: 64, paddingBottom: 100, gap: 10 },
  h1: { color: C.text, fontSize: 30, fontWeight: "700" },
  sub: { color: C.muted, marginTop: -4, marginBottom: 10 },
  err: { color: C.accent, marginTop: 16 },
  empty: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 14, padding: 24, marginTop: 20 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  icon: { fontSize: 22, width: 40, height: 40, textAlign: "center", lineHeight: 40, backgroundColor: C.surface2, borderRadius: 10, overflow: "hidden" },
  name: { color: C.text, fontSize: 15, fontWeight: "600" },
  meta: { color: C.muted, fontSize: 12, marginTop: 2 },
  count: { color: C.primary, fontSize: 15, fontWeight: "700" },
});
