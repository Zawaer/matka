import { useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { C, categoryIcon, categoryLabel, fmtDuration } from "../theme";
import { PairingLost, useSession, useViewerQuery } from "../ui/session";
import { getPlaces } from "../viewer";

export default function PlacesScreen() {
  const { authLost } = useSession();
  const { data: places, error, reload } = useViewerQuery(getPlaces);
  const [refreshing, setRefreshing] = useState(false);

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
              await reload();
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            <Text style={ps.h1}>Places</Text>
            <Text style={ps.sub}>Where you spend your time</Text>
            {authLost ? <PairingLost /> : null}
            {error && !authLost ? <Text style={ps.err}>{error}</Text> : null}
            {!places && !error && !authLost ? (
              <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
            ) : null}
            {places && places.length === 0 ? (
              <View style={ps.empty}>
                <Text style={{ color: C.muted, textAlign: "center" }}>
                  No places yet — they are generated from your visits.
                </Text>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item: p }) => {
          const name = p.name && p.name !== "Unknown Location" ? p.name : categoryLabel(p.category);
          const locale = [p.city, p.country].filter(Boolean).join(", ");
          return (
            <View style={ps.card}>
              <Text style={ps.icon}>{categoryIcon(p.category)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={ps.name} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={ps.meta} numberOfLines={1}>
                  {categoryLabel(p.category)}
                  {locale ? ` · ${locale}` : ""}
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
  container: { padding: 20, paddingTop: 24, paddingBottom: 40, gap: 10 },
  h1: { color: C.text, fontSize: 30, fontWeight: "700" },
  sub: { color: C.muted, marginTop: -4, marginBottom: 4 },
  err: { color: C.accent, marginTop: 6 },
  empty: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 24,
    marginTop: 10,
  },
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
  icon: {
    fontSize: 22,
    width: 40,
    height: 40,
    textAlign: "center",
    lineHeight: 40,
    backgroundColor: C.surface2,
    borderRadius: 10,
    overflow: "hidden",
  },
  name: { color: C.text, fontSize: 15, fontWeight: "600" },
  meta: { color: C.muted, fontSize: 12, marginTop: 2 },
  count: { color: C.primary, fontSize: 15, fontWeight: "700" },
});
