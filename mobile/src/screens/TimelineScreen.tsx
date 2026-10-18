import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { C, MODE_META, categoryLabel, fmtDistance, fmtDuration, fmtTime } from "../theme";
import { PairingLost, useSession, useViewerQuery } from "../ui/session";
import { getTimeline, type Timeline } from "../viewer";
import type { Pairing } from "../pairing";

/** "2026-10-18" → that calendar day at local midnight (not UTC, which can show the previous day). */
function localDay(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export default function TimelineScreen() {
  const { authLost } = useSession();
  // null = latest day with data (server default)
  const [want, setWant] = useState<string | null>(null);
  const fetcher = useCallback((p: Pairing) => getTimeline(p, want), [want]);
  const { data, error, loading, reload } = useViewerQuery<Timeline>(fetcher);
  const [refreshing, setRefreshing] = useState(false);

  const date = data?.day.date || null;
  const dates = data?.dates ?? [];
  const idx = date ? dates.indexOf(date) : -1;
  const canPrev = idx > 0;
  const canNext = idx >= 0 && idx < dates.length - 1;
  const go = (delta: number) => {
    const ni = idx + delta;
    if (idx >= 0 && ni >= 0 && ni < dates.length) setWant(dates[ni]);
  };
  const items = data?.day.items ?? [];
  const day = date ? localDay(date) : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        contentContainerStyle={st.container}
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
        <Text style={st.h1}>Timeline</Text>
        {authLost ? <PairingLost /> : null}

        <View style={st.navRow}>
          <Pressable
            onPress={() => go(-1)}
            disabled={!canPrev}
            accessibilityLabel="Previous day"
            style={[st.navBtn, !canPrev && { opacity: 0.4 }]}
          >
            <Text style={st.navBtnText}>‹</Text>
          </Pressable>
          <Text style={st.dateText}>
            {day ? day.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "—"}
          </Text>
          <Pressable
            onPress={() => go(1)}
            disabled={!canNext}
            accessibilityLabel="Next day"
            style={[st.navBtn, !canNext && { opacity: 0.4 }]}
          >
            <Text style={st.navBtnText}>›</Text>
          </Pressable>
        </View>

        {loading && !refreshing ? <ActivityIndicator color={C.primary} style={{ marginTop: 30 }} /> : null}
        {error && !authLost ? <Text style={st.err}>{error}</Text> : null}
        {data && !loading && items.length === 0 && !error ? (
          <View style={st.empty}>
            <Text style={{ color: C.muted }}>{date ? "No activity this day." : "No visits or trips yet."}</Text>
          </View>
        ) : null}

        <View style={{ marginTop: 10 }}>
          {items.map((it, i) => {
            if (it.kind === "visit") {
              const v = it.visit;
              const cat = categoryLabel(v.category);
              return (
                <View key={`v${v.id}-${i}`} style={st.visitRow}>
                  <View style={st.dot} />
                  <View style={st.visitCard}>
                    <Text style={st.visitName} numberOfLines={1}>
                      {v.placeName ?? (v.category ? cat : "Unknown location")}
                    </Text>
                    <Text style={st.visitMeta}>
                      {fmtTime(v.startedAt)} – {fmtTime(v.endedAt)} · {fmtDuration(v.duration)}
                      {v.placeName && v.category ? ` · ${cat}` : ""}
                    </Text>
                  </View>
                </View>
              );
            }
            const t = it.track;
            const meta = MODE_META[t.mode];
            return (
              <View key={`m${t.id}-${i}`} style={st.moveRow}>
                <View style={[st.moveLine, { backgroundColor: meta.color }]} />
                <Text style={st.moveText}>
                  {meta.icon} {meta.label} · {fmtDistance(t.distance)} · {fmtDuration(t.duration)}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { padding: 20, paddingTop: 24, paddingBottom: 40, gap: 0 },
  h1: { color: C.text, fontSize: 30, fontWeight: "700", marginBottom: 12 },
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4 },
  navBtn: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  navBtnText: { color: C.text, fontSize: 20, fontWeight: "700" },
  dateText: { color: C.text, fontSize: 15, fontWeight: "600", flex: 1, textAlign: "center" },
  err: { color: C.accent, marginTop: 16 },
  empty: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    marginTop: 20,
  },
  visitRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: C.primary,
    marginTop: 18,
    borderWidth: 2,
    borderColor: C.bg,
  },
  visitCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginVertical: 4,
  },
  visitName: { color: C.text, fontSize: 15, fontWeight: "600" },
  visitMeta: { color: C.muted, fontSize: 12, marginTop: 3 },
  moveRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 3, marginVertical: 2 },
  moveLine: { width: 6, height: 26, borderRadius: 3, marginLeft: 3 },
  moveText: { color: C.muted, fontSize: 13 },
});
