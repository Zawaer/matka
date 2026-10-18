import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { C, MODE_META, fmtDuration, fmtDistance, fmtTime } from "../theme";
import { getJSON, type TimelineResp } from "../api";

export default function TimelineScreen() {
  const [date, setDate] = useState<string | null>(null);
  const [resp, setResp] = useState<TimelineResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (d: string | null) => {
    setLoading(true);
    try {
      setErr(null);
      const path = d ? `/api/timeline?date=${d}` : "/api/timeline";
      const r = await getJSON<TimelineResp>(path);
      setResp(r);
      setDate(r.day.date);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(null);
  }, [load]);

  const dates = resp?.dates ?? [];
  const idx = date ? dates.indexOf(date) : -1;
  const go = (delta: number) => {
    if (idx < 0) return;
    const ni = idx + delta;
    if (ni >= 0 && ni < dates.length) load(dates[ni]);
  };

  const items = resp?.day.items ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={st.container}>
        <Text style={st.h1}>Timeline</Text>

        <View style={st.navRow}>
          <Pressable
            onPress={() => go(-1)}
            disabled={idx <= 0}
            style={[st.navBtn, idx <= 0 && { opacity: 0.4 }]}
          >
            <Text style={st.navBtnText}>‹</Text>
          </Pressable>
          <Text style={st.dateText}>
            {date
              ? new Date(date).toLocaleDateString([], {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })
              : "—"}
          </Text>
          <Pressable
            onPress={() => go(1)}
            disabled={idx < 0 || idx >= dates.length - 1}
            style={[st.navBtn, (idx < 0 || idx >= dates.length - 1) && { opacity: 0.4 }]}
          >
            <Text style={st.navBtnText}>›</Text>
          </Pressable>
        </View>

        {loading && <ActivityIndicator color={C.primary} style={{ marginTop: 30 }} />}
        {err && <Text style={st.err}>{err}</Text>}
        {!loading && items.length === 0 && !err && (
          <View style={st.empty}>
            <Text style={{ color: C.muted }}>No activity this day.</Text>
          </View>
        )}

        <View style={{ marginTop: 10 }}>
          {items.map((it, i) =>
            it.kind === "visit" ? (
              <View key={`v${it.visit.id}-${i}`} style={st.visitRow}>
                <View style={st.dot} />
                <View style={st.visitCard}>
                  <Text style={st.visitName} numberOfLines={1}>
                    {it.visit.placeName ?? "Unknown location"}
                  </Text>
                  <Text style={st.visitMeta}>
                    {fmtTime(it.visit.startedAt)} – {fmtTime(it.visit.endedAt)} ·{" "}
                    {fmtDuration(it.visit.duration)}
                  </Text>
                </View>
              </View>
            ) : (
              <View key={`m${it.track.id}-${i}`} style={st.moveRow}>
                <View
                  style={[st.moveLine, { backgroundColor: MODE_META[it.track.mode]?.color ?? C.muted }]}
                />
                <Text style={st.moveText}>
                  {MODE_META[it.track.mode]?.icon} {MODE_META[it.track.mode]?.label ?? "Move"} ·{" "}
                  {fmtDistance(it.track.distance)} · {fmtDuration(it.track.duration)}
                </Text>
              </View>
            ),
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { padding: 20, paddingTop: 24, paddingBottom: 100 },
  h1: { color: C.text, fontSize: 30, fontWeight: "700", marginBottom: 12 },
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  navBtn: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 6 },
  navBtnText: { color: C.text, fontSize: 20, fontWeight: "700" },
  dateText: { color: C.text, fontSize: 15, fontWeight: "600", flex: 1, textAlign: "center" },
  err: { color: C.accent, marginTop: 16 },
  empty: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 14, padding: 24, alignItems: "center", marginTop: 20 },
  visitRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.primary, marginTop: 18, borderWidth: 2, borderColor: C.bg },
  visitCard: { flex: 1, backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 12, marginVertical: 4 },
  visitName: { color: C.text, fontSize: 15, fontWeight: "600" },
  visitMeta: { color: C.muted, fontSize: 12, marginTop: 3 },
  moveRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 3, marginVertical: 2 },
  moveLine: { width: 6, height: 26, borderRadius: 3, marginLeft: 3 },
  moveText: { color: C.muted, fontSize: 13 },
});
