import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { count } from "../format";
import { C, fmtDuration } from "../theme";
import { PairingLost, useSession, useViewerQuery } from "../ui/session";
import type { CollectorState } from "../ui/useCollectorState";
import { getOverview } from "../viewer";

const placeName = (n: string | null) => (n && n !== "Unknown Location" ? n : "Unknown location");
const km = (m: number) => `${count(m / 1000)} km`;

export default function OverviewScreen({ collector }: { collector: CollectorState | null }) {
  const { authLost, goTab } = useSession();
  const { data, error, reload } = useViewerQuery(getOverview);
  const [refreshing, setRefreshing] = useState(false);

  const t = data?.totals;
  const maxMonth = Math.max(1, ...(data?.months.map((m) => m.distance) ?? [1]));
  const range =
    t?.first && t?.last
      ? `${new Date(t.first).toLocaleDateString()} – ${new Date(t.last).toLocaleDateString()}`
      : "—";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={s.container}
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
    >
      <Text style={s.h1}>Overview</Text>
      <Text style={s.sub}>{range}</Text>

      {authLost ? <PairingLost /> : null}

      {collector ? (
        <Pressable onPress={() => goTab("recorder")} accessibilityRole="button" style={s.card}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Recorder</Text>
              <Text style={[s.statLabel, { marginTop: 2 }]}>
                {collector.trackingEnabled
                  ? collector.trackingRunning
                    ? "Recording in the background"
                    : "On — not running"
                  : "Off"}
                {collector.queued > 0 ? ` · ${count(collector.queued)} points waiting to upload` : ""}
              </Text>
            </View>
            <Text style={{ color: C.primary, fontWeight: "600" }}>›</Text>
          </View>
        </Pressable>
      ) : null}

      {error && !authLost ? <Text style={s.err}>{error}</Text> : null}
      {!data && !error && !authLost ? <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} /> : null}

      {t && data ? (
        <>
          <View style={s.grid}>
            <Stat label="Points" value={count(t.points)} />
            <Stat label="Days" value={count(t.days)} />
            <Stat label="Visits" value={count(t.visits)} />
            <Stat label="Trips" value={count(t.trips)} />
            <Stat label="Distance" value={km(t.distance)} accent wide />
          </View>

          {data.months.length > 0 ? (
            <View style={s.card}>
              <Text style={s.cardTitle}>Distance by month</Text>
              <View style={s.bars}>
                {data.months.map((m) => (
                  <View key={`${m.year}-${m.month}`} style={s.barCol}>
                    <View style={s.barTrack}>
                      <View style={[s.bar, { height: `${Math.max(3, (m.distance / maxMonth) * 100)}%` }]} />
                    </View>
                    <Text style={s.barLabel}>
                      {new Date(m.year, m.month - 1, 1).toLocaleDateString([], { month: "short" })}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {data.topPlaces.length > 0 ? (
            <View style={s.card}>
              <Text style={s.cardTitle}>Top places</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {data.topPlaces.map((p) => (
                  <Pressable key={p.id} style={s.chip} onPress={() => goTab("places")}>
                    <Text style={{ color: C.text, fontSize: 13 }}>
                      {placeName(p.name)} <Text style={{ color: C.muted }}>{fmtDuration(p.hours * 3600)}</Text>
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {data.recent.length > 0 ? (
            <>
              <Text style={s.cardTitle}>Recent visits</Text>
              <View style={s.card}>
                {data.recent.map((v, i) => (
                  <View key={v.id} style={[s.row, i < data.recent.length - 1 && s.rowBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.text, fontWeight: "600" }} numberOfLines={1}>
                        {placeName(v.name)}
                      </Text>
                      <Text style={{ color: C.muted, fontSize: 12 }}>{new Date(v.startedAt).toLocaleString()}</Text>
                    </View>
                    <Text style={{ color: C.muted, fontSize: 13 }}>{fmtDuration(v.duration)}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function Stat({ label, value, accent, wide }: { label: string; value: string; accent?: boolean; wide?: boolean }) {
  return (
    <View style={[s.stat, wide && { width: "100%" }]}>
      <Text style={[s.statValue, accent && { color: C.primary }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { padding: 20, paddingTop: 24, paddingBottom: 40, gap: 14 },
  h1: { color: C.text, fontSize: 30, fontWeight: "700" },
  sub: { color: C.muted, marginTop: -4 },
  card: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 14, padding: 16 },
  cardTitle: { color: C.muted, fontSize: 13, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    width: "47%",
    flexGrow: 1,
  },
  statValue: { color: C.text, fontSize: 24, fontWeight: "700" },
  statLabel: { color: C.muted, fontSize: 12, marginTop: 2 },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 130, marginTop: 12 },
  barCol: { flex: 1, alignItems: "center", gap: 6 },
  barTrack: { flex: 1, width: "100%", justifyContent: "flex-end" },
  bar: { width: "100%", backgroundColor: C.primaryStrong, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  barLabel: { color: C.muted, fontSize: 9 },
  chip: {
    backgroundColor: C.surface2,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  rowBorder: { borderBottomColor: C.border, borderBottomWidth: 1 },
  err: { color: C.accent, fontSize: 13 },
});
