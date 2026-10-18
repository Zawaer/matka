import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { C, fmtDuration } from "../theme";
import { getJSON, type Overview } from "../api";
import {
  flushQueue,
  isTracking,
  queuedCount,
  requestPermissions,
  startTracking,
  stopTracking,
} from "../collector";

export default function OverviewScreen() {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(0);

  const load = useCallback(async () => {
    try {
      setErr(null);
      setData(await getJSON<Overview>("/api/overview"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
    isTracking().then(setTracking);
    // Upload anything recorded while the server was unreachable.
    flushQueue().finally(() => setQueued(queuedCount()));
    const id = setInterval(() => {
      isTracking().then(setTracking);
      setQueued(queuedCount());
    }, 4000);
    return () => clearInterval(id);
  }, [load]);

  const toggle = useCallback(async () => {
    setBusy(true);
    try {
      if (tracking) {
        await stopTracking();
        setTracking(false);
      } else {
        const p = await requestPermissions();
        if (p.fg !== "granted" || p.bg !== "granted") {
          setErr("Location needs 'Allow all the time' for background tracking.");
          setBusy(false);
          return;
        }
        await startTracking();
        setTracking(true);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }, [tracking]);

  const t = data?.totals;
  const maxMonth = Math.max(1, ...(data?.months.map((m) => m.distance) ?? [1]));
  const range =
    t?.first && t?.last
      ? `${new Date(t.first).toLocaleDateString()} – ${new Date(
          t.last,
        ).toLocaleDateString()}`
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
            await Promise.all([load(), flushQueue()]);
            setQueued(queuedCount());
            setRefreshing(false);
          }}
        />
      }
    >
      <Text style={s.h1}>Overview</Text>
      <Text style={s.sub}>{range}</Text>

      {/* Tracking control */}
      <View style={s.card}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={s.cardTitle}>Recording</Text>
            <Text style={[s.statLabel, { marginTop: 2 }]}>
              {tracking ? "Collecting in the background" : "Off"}
            </Text>
            {queued > 0 && (
              <Text style={[s.statLabel, { marginTop: 2 }]}>
                {queued.toLocaleString()} points waiting to upload
              </Text>
            )}
          </View>
          <Pressable
            onPress={toggle}
            disabled={busy}
            style={[s.btn, tracking ? s.btnStop : s.btnStart, busy && { opacity: 0.6 }]}
          >
            <Text style={[s.btnText, { color: tracking ? "#fff" : "#02110f" }]}>
              {busy ? "…" : tracking ? "Stop" : "Start"}
            </Text>
          </Pressable>
        </View>
      </View>

      {err && <Text style={s.err}>{err}</Text>}

      {!data && !err && (
        <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
      )}

      {t && (
        <>
          <View style={s.grid}>
            <Stat label="Points" value={t.points.toLocaleString()} />
            <Stat label="Days" value={t.days.toLocaleString()} />
            <Stat label="Visits" value={t.visits.toLocaleString()} />
            <Stat label="Distance" value={`${t.totalKm.toLocaleString()} km`} accent />
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Distance by month</Text>
            <View style={s.bars}>
              {data!.months.map((m) => (
                <View key={`${m.year}-${m.month}`} style={s.barCol}>
                  <View style={s.barTrack}>
                    <View
                      style={[
                        s.bar,
                        { height: `${Math.max(3, (m.distance / maxMonth) * 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={s.barLabel}>
                    {new Date(m.year, m.month - 1, 1).toLocaleDateString([], {
                      month: "short",
                    })}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {data!.cities.length > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Top places</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {data!.cities.map((c) => (
                  <View key={c.city} style={s.chip}>
                    <Text style={{ color: C.text, fontSize: 13 }}>
                      {c.city} <Text style={{ color: C.muted }}>{c.count}</Text>
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <Text style={s.cardTitle}>Recent visits</Text>
          <View style={s.card}>
            {data!.recent.map((v, i) => (
              <View
                key={v.id}
                style={[s.row, i < data!.recent.length - 1 && s.rowBorder]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.text, fontWeight: "600" }} numberOfLines={1}>
                    {v.name && v.name !== "Unknown Location" ? v.name : "Unknown location"}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: 12 }}>
                    {new Date(v.startedAt).toLocaleString()}
                  </Text>
                </View>
                <Text style={{ color: C.muted, fontSize: 13 }}>
                  {fmtDuration(v.duration)}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, accent && { color: C.primary }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { padding: 20, paddingTop: 24, paddingBottom: 100, gap: 14 },
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
  chip: { backgroundColor: C.surface2, borderColor: C.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  rowBorder: { borderBottomColor: C.border, borderBottomWidth: 1 },
  btn: { borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12 },
  btnStart: { backgroundColor: C.primaryStrong },
  btnStop: { backgroundColor: C.danger },
  btnText: { fontSize: 15, fontWeight: "700" },
  err: { color: C.accent, fontSize: 13 },
});
