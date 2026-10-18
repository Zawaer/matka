import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { categoryMeta } from "../design/categories";
import { useStyles, useTheme } from "../design/theme";
import { fmtDistance, fmtDuration, fmtTime, isLikelyDrift, localDay } from "../format";
import type { Pairing } from "../pairing";
import { Card, EmptyState, ErrorState, Icon, Skeleton } from "../ui";
import type { IconName } from "../ui/Icon";
import { Screen, ScreenHeader } from "../ui/Screen";
import { PairingLost, useSession, useViewerQuery } from "../ui/session";
import { Text } from "../ui/Text";
import { getTimeline, type Leg, type Mode, type Timeline } from "../viewer";
import { LEG_BADGE } from "../design/transit";

const MODES: Record<Mode, { label: string; icon: IconName }> = {
  unknown: { label: "Move", icon: "dots-horizontal" },
  stationary: { label: "Stationary", icon: "pause-circle-outline" },
  walking: { label: "Walk", icon: "walk" },
  running: { label: "Run", icon: "run" },
  cycling: { label: "Cycle", icon: "bike" },
  driving: { label: "Drive", icon: "car" },
  bus: { label: "Bus", icon: "bus" },
  tram: { label: "Tram", icon: "tram" },
  metro: { label: "Metro", icon: "subway-variant" },
  train: { label: "Train", icon: "train" },
  flying: { label: "Flight", icon: "airplane" },
  boat: { label: "Ferry", icon: "ferry" },
  motorcycle: { label: "Motorbike", icon: "motorbike" },
};

const RAIL = 28;

/** "Bus 159  Leppävaara → Matinkylä (M)", in HSL's line colours. */
function LegBadge({ leg }: { leg: Leg }) {
  const b = LEG_BADGE[leg.kind];
  const route = [leg.fromStop, leg.toStop].filter(Boolean).join(" → ");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 5 }}>
      <View style={{ backgroundColor: b.bg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
        <Text variant="caption" style={{ color: b.fg, fontWeight: "800" }}>
          {b.label} {leg.lines[0]}
          {leg.lines.length > 1 ? ` +${leg.lines.length - 1}` : ""}
        </Text>
      </View>
      {route ? (
        <Text variant="caption" color="textSecondary" style={{ flexShrink: 1 }}>
          {route}
        </Text>
      ) : null}
    </View>
  );
}

function NavButton({ icon, onPress, disabled, label }: { icon: IconName; onPress: () => void; disabled: boolean; label: string }) {
  const t = useTheme();
  const s = useStyles((th) => ({
    navBtn: { width: 44, height: 44, borderRadius: th.radius.pill, backgroundColor: th.c.surface, borderColor: th.c.border, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  }));
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={[s.navBtn, disabled && { opacity: 0.4 }]}>
      <Icon name={icon} size={22} color={t.c.text} />
    </Pressable>
  );
}

export default function TimelineScreen() {
  const t = useTheme();
  const { authLost } = useSession();
  // null = latest day with data (server default)
  const [want, setWant] = useState<string | null>(null);
  const fetcher = useCallback((p: Pairing) => getTimeline(p, want), [want]);
  const { data: resp, error: err, loading, reload } = useViewerQuery<Timeline>(fetcher);

  const date = resp?.day.date || null;
  const dates = resp?.dates ?? [];
  const idx = date ? dates.indexOf(date) : -1;
  const canPrev = idx > 0;
  const canNext = idx >= 0 && idx < dates.length - 1;
  const go = (delta: number) => {
    const ni = idx + delta;
    if (idx >= 0 && ni >= 0 && ni < dates.length) setWant(dates[ni]);
  };

  const items = resp?.day.items ?? [];
  // Stationary segments and impossible speeds are GPS drift; keep them out of the day's totals.
  const moves = items.flatMap((i) =>
    i.kind === "move" && i.track.mode !== "stationary" && !isLikelyDrift(i.track.mode, i.track.distance, i.track.duration)
      ? [i.track]
      : [],
  );
  const visits = items.filter((i) => i.kind === "visit").length;
  const km = moves.reduce((a, m) => a + (m.distance ?? 0), 0);
  const moving = moves.reduce((a, m) => a + (m.duration ?? 0), 0);
  const day = date ? localDay(date) : null;

  const s = useStyles((th) => ({
    nav: { flexDirection: "row", alignItems: "center", gap: th.space.md },
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

  return (
    <Screen refreshing={false} onRefresh={reload}>
      <ScreenHeader title="Timeline" subtitle="Your day, stop by stop" />
      {authLost ? <PairingLost /> : null}

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

      {authLost && !resp ? null : err && !resp ? (
        <ErrorState message={err} onRetry={reload} />
      ) : !resp ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={76} radius={20} />
          <Skeleton height={72} radius={20} />
          <Skeleton height={44} radius={14} />
          <Skeleton height={72} radius={20} />
        </View>
      ) : items.length === 0 ? (
        <Card>
          {date ? (
            <EmptyState icon="sleep" title="A quiet day" body="Nothing was recorded on this day. Use the arrows to browse the days you were out and about." />
          ) : (
            <EmptyState icon="map-marker-path" title="No days yet" body="Visits and trips show up here once the server has processed what this phone recorded." />
          )}
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

          {err ? (
            <Text variant="caption" style={{ color: t.c.danger }}>
              {err}
            </Text>
          ) : null}

          <View style={{ opacity: loading ? 0.5 : 1 }}>
            {items.map((it, i) => {
              const first = i === 0;
              const last = i === items.length - 1;
              if (it.kind === "visit") {
                const v = it.visit;
                const named = v.placeName && v.placeName !== "Unknown Location";
                const cat = v.category ? categoryMeta(v.category).label : null;
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
                        <Text variant="headline" numberOfLines={2}>
                          {named ? v.placeName : (cat ?? "Unnamed place")}
                        </Text>
                        <Text variant="caption" color="textSecondary">
                          {fmtTime(v.startedAt)} – {fmtTime(v.endedAt)}
                          {named && cat ? ` · ${cat}` : ""}
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
              const meta = MODES[m.mode];
              const color = t.mode(m.mode);
              const drift = isLikelyDrift(m.mode, m.distance, m.duration);
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
                      <Text variant="callout" style={{ fontWeight: "800" }}>
                        {meta.label}
                      </Text>
                      <Text variant="caption" color="textSecondary">
                        {m.mode === "stationary" ? fmtDuration(m.duration) : `${fmtDistance(m.distance)} · ${fmtDuration(m.duration)}`}
                      </Text>
                      {m.legs.map((l, k) => (
                        <LegBadge key={k} leg={l} />
                      ))}
                      {drift && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                          <Icon name="map-marker-alert-outline" size={13} color={t.c.accent} />
                          <Text variant="caption" color="accent">
                            GPS jumped around here, not counted
                          </Text>
                        </View>
                      )}
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
