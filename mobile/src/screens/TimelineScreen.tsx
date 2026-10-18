import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useStyles, useTheme } from "../design/theme";
import { getJSON, type TimelineItem, type TimelineResp } from "../api";
import { fmtDistance, fmtDuration, fmtTime } from "../format";
import { Card, EmptyState, ErrorState, Icon, Skeleton } from "../ui";
import type { IconName } from "../ui/Icon";
import { Screen, ScreenHeader } from "../ui/Screen";
import { Text } from "../ui/Text";

const MODES: Record<string, { label: string; icon: IconName }> = {
  unknown: { label: "Move", icon: "dots-horizontal" },
  stationary: { label: "Stop", icon: "pause-circle-outline" },
  walking: { label: "Walk", icon: "walk" },
  running: { label: "Run", icon: "run" },
  cycling: { label: "Cycle", icon: "bike" },
  driving: { label: "Drive", icon: "car" },
  bus: { label: "Bus", icon: "bus" },
  train: { label: "Train", icon: "train" },
  flying: { label: "Flight", icon: "airplane" },
  boat: { label: "Boat", icon: "ferry" },
  motorcycle: { label: "Motorbike", icon: "motorbike" },
};

const parseDay = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};

const RAIL = 28;

export default function TimelineScreen() {
  const t = useTheme();
  const [date, setDate] = useState<string | null>(null);
  const [resp, setResp] = useState<TimelineResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d: string | null) => {
    setLoading(true);
    try {
      setErr(null);
      const r = await getJSON<TimelineResp>(d ? `/api/timeline?date=${d}` : "/api/timeline");
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
  const canPrev = idx > 0;
  const canNext = idx >= 0 && idx < dates.length - 1;
  const go = (delta: number) => {
    const ni = idx + delta;
    if (idx >= 0 && ni >= 0 && ni < dates.length) load(dates[ni]);
  };

  const items: TimelineItem[] = resp?.day.items ?? [];
  const moves = items.flatMap((i) => (i.kind === "move" ? [i.track] : []));
  const visits = items.filter((i) => i.kind === "visit").length;
  const km = moves.reduce((a, m) => a + (m.distance ?? 0), 0);
  const moving = moves.reduce((a, m) => a + (m.duration ?? 0), 0);
  const day = date ? parseDay(date) : null;

  const s = useStyles((th) => ({
    nav: { flexDirection: "row", alignItems: "center", gap: th.space.md },
    navBtn: { width: 44, height: 44, borderRadius: th.radius.pill, backgroundColor: th.c.surface, borderColor: th.c.border, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    summary: { flexDirection: "row", paddingVertical: th.space.md },
    sumCell: { flex: 1, alignItems: "center", gap: 2 },
    divider: { width: 1, backgroundColor: th.c.border, marginVertical: 4 },
    row: { flexDirection: "row", gap: th.space.md },
    rail: { width: RAIL, alignItems: "center" },
    line: { position: "absolute", width: 2, backgroundColor: th.c.borderStrong, borderRadius: 1 },
    node: { width: 16, height: 16, borderRadius: 8, backgroundColor: th.c.primary, borderWidth: 3, borderColor: th.c.bg, boxShadow: `0 0 0 2px ${th.c.primary}` },
    visit: { flex: 1, marginVertical: 5, flexDirection: "row", alignItems: "center", gap: th.space.md, padding: th.space.md + 2 },
    move: { flex: 1, flexDirection: "row", alignItems: "center", gap: th.space.md, paddingVertical: th.space.sm },
  }));

  const NavButton = ({ icon, onPress, disabled, label }: { icon: IconName; onPress: () => void; disabled: boolean; label: string }) => (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={[s.navBtn, disabled && { opacity: 0.4 }]}>
      <Icon name={icon} size={22} color={t.c.text} />
    </Pressable>
  );

  return (
    <Screen refreshing={false} onRefresh={() => load(date)}>
      <ScreenHeader title="Timeline" subtitle="Your day, stop by stop" />

      <View style={s.nav}>
        <NavButton icon="chevron-left" label="Previous day" onPress={() => go(-1)} disabled={!canPrev} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text variant="overline" color="primary">
            {day ? day.toLocaleDateString([], { weekday: "long" }) : "—"}
          </Text>
          <Text variant="title2">{day ? day.toLocaleDateString([], { day: "numeric", month: "long" }) : "…"}</Text>
        </View>
        <NavButton icon="chevron-right" label="Next day" onPress={() => go(1)} disabled={!canNext} />
      </View>

      {err && !resp ? (
        <ErrorState message={err} onRetry={() => load(date)} />
      ) : loading && !resp ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={76} radius={20} />
          <Skeleton height={72} radius={20} />
          <Skeleton height={44} radius={14} />
          <Skeleton height={72} radius={20} />
        </View>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon="sleep" title="A quiet day" body="Nothing was recorded on this day. Use the arrows to browse the days you were out and about." />
        </Card>
      ) : (
        <>
          <Card style={s.summary}>
            <View style={s.sumCell}>
              <Text variant="stat" style={{ fontSize: 20, lineHeight: 24 }}>
                {fmtDistance(km)}
              </Text>
              <Text variant="caption" color="textSecondary">
                Travelled
              </Text>
            </View>
            <View style={s.divider} />
            <View style={s.sumCell}>
              <Text variant="stat" style={{ fontSize: 20, lineHeight: 24 }}>
                {fmtDuration(moving)}
              </Text>
              <Text variant="caption" color="textSecondary">
                On the move
              </Text>
            </View>
            <View style={s.divider} />
            <View style={s.sumCell}>
              <Text variant="stat" style={{ fontSize: 20, lineHeight: 24 }}>
                {visits}
              </Text>
              <Text variant="caption" color="textSecondary">
                {visits === 1 ? "Stop" : "Stops"}
              </Text>
            </View>
          </Card>

          <View style={{ opacity: loading ? 0.5 : 1 }}>
            {items.map((it, i) => {
              const first = i === 0;
              const last = i === items.length - 1;
              if (it.kind === "visit") {
                const v = it.visit;
                const named = v.placeName && v.placeName !== "Unknown Location";
                return (
                  <View key={`v${v.id}-${i}`} style={s.row}>
                    <View style={s.rail}>
                      <View style={[s.line, { top: first ? 26 : 0, bottom: last ? undefined : 0, height: last ? 26 : undefined }]} />
                      <View style={{ marginTop: 18 }}>
                        <View style={s.node} />
                      </View>
                    </View>
                    <Card style={s.visit}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="headline" numberOfLines={1}>
                          {named ? v.placeName : "Unnamed place"}
                        </Text>
                        <Text variant="caption" color="textSecondary">
                          {fmtTime(v.startedAt)} – {fmtTime(v.endedAt)}
                        </Text>
                      </View>
                      <Text variant="callout" color="textSecondary" tabular>
                        {fmtDuration(v.duration)}
                      </Text>
                    </Card>
                  </View>
                );
              }
              const m = it.track;
              const meta = MODES[m.mode] ?? MODES.unknown;
              const color = t.mode(m.mode);
              return (
                <View key={`m${m.id}-${i}`} style={s.row}>
                  <View style={s.rail}>
                    <View style={[s.line, { top: 0, bottom: 0, width: 5, backgroundColor: color, borderRadius: 3 }]} />
                  </View>
                  <View style={s.move}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: `${color}26`, alignItems: "center", justifyContent: "center" }}>
                      <Icon name={meta.icon} size={19} color={color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="callout" style={{ fontWeight: "700" }}>
                        {meta.label}
                      </Text>
                      <Text variant="caption" color="textSecondary">
                        {fmtDistance(m.distance)} · {fmtDuration(m.duration)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}
    </Screen>
  );
}
