import { Fragment, useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { categoryMeta } from "../design/categories";
import { useStyles, useTheme } from "../design/theme";
import { fmtDistance, fmtDuration, fmtTime, isLikelyDrift, isNamed, localDay } from "../format";
import type { Pairing } from "../pairing";
import { Card, EmptyState, ErrorState, Icon, RoundButton, Skeleton } from "../ui";
import { Screen, ScreenHeader } from "../ui/Screen";
import { PairingLost, useSession, useViewerQuery } from "../ui/session";
import { Text } from "../ui/Text";
import { getTimeline, type Leg, type Timeline, type TimelineItem } from "../viewer";
import { getDaySummary, stripModes, type DaySummary } from "../daySummary";
import { DaySummaryStrip } from "../ui/DaySummary";
import { modeMeta } from "../design/modes";
import { LEG_BADGE } from "../design/transit";
import { adjacentDays, dayHasMap, gapBetween, selectionKey, subRows, type Gap } from "../timeline-logic";
import { DayMapCard, type DayMapSelection } from "../ui/DayMapCard";

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

/** "Waited at Kamppi · 6 min" (or "Change") between two rides of a move. */
function WaitLine({ stop, secs }: { stop: string | null; secs: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 }}>
      <Icon name="timer-sand" size={13} color={t.c.textMuted} />
      <Text variant="caption" color="textSecondary" style={{ flexShrink: 1 }}>
        {stop ? `Waited at ${stop}` : "Change"} · {fmtDuration(secs)}
      </Text>
    </View>
  );
}

/** Time with nothing recorded between two rows (location off, phone dead). */
function GapRow({ gap }: { gap: Gap }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: t.space.md }} accessible accessibilityLabel={`No location recorded for ${fmtDuration(gap.secs)}`}>
      <View style={{ width: RAIL, alignItems: "center", paddingVertical: 2, gap: 4 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ width: 2, height: 5, borderRadius: 1, backgroundColor: t.c.borderStrong }} />
        ))}
      </View>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name="map-marker-off-outline" size={15} color={t.c.textMuted} />
        <Text variant="caption" color="textMuted" style={{ flexShrink: 1, fontStyle: "italic" }}>
          No location recorded · {fmtDuration(gap.secs)} ({fmtTime(gap.from)} – {fmtTime(gap.to)})
        </Text>
      </View>
    </View>
  );
}

export default function TimelineScreen() {
  const t = useTheme();
  const { authLost, timelineDate } = useSession();
  // null = latest day with data (server default); another tab may open a given day.
  const [want, setWant] = useState<string | null>(() => timelineDate?.date ?? null);
  const fetcher = useCallback((p: Pairing) => getTimeline(p, want), [want]);
  const { data: resp, error: err, loading, reload } = useViewerQuery<Timeline>(fetcher);

  const date = resp?.day.date || null;
  // The day's per-mode totals load alongside the timeline once the day is known
  // (straight away when a day was picked, after the first answer for "latest").
  const sumDate = want ?? date;
  const sumFetcher = useCallback(
    async (p: Pairing) => (sumDate ? getDaySummary(p, sumDate) : { ok: true as const, data: null }),
    [sumDate],
  );
  const { data: sumResp, error: sumErr, reload: reloadSum } = useViewerQuery<DaySummary | null>(sumFetcher);
  // Ignore a summary left over from the previous day while this one loads.
  const summary = sumResp && sumResp.date === date ? sumResp : null;
  const { prev, next } = adjacentDays(resp?.dates ?? [], date);

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

  // The day map, and the row picked in the list or on the map (per day).
  const hasMap = dayHasMap(items);
  const [sel, setSel] = useState<(DayMapSelection & { date: string }) | null>(null);
  const selected: DayMapSelection = sel && sel.date === date ? sel : null;
  const pick = (key: string) => date && setSel(selected?.key === key ? null : { key, from: "list", date });
  const visitNo = new Map<string, number>();
  if (hasMap) for (const it of items) if (it.kind === "visit") visitNo.set(selectionKey(it), visitNo.size + 1);

  const s = useStyles((th) => ({
    nav: { flexDirection: "row", alignItems: "center", gap: th.space.md },
    summary: { paddingVertical: th.space.md, gap: th.space.md },
    stats: { flexDirection: "row" },
    hairline: { height: 1, backgroundColor: th.c.border, marginHorizontal: -th.space.lg },
    sumCell: { flex: 1, alignItems: "center", gap: 2 },
    divider: { width: 1, backgroundColor: th.c.border, marginVertical: 4 },
    row: { flexDirection: "row", gap: th.space.md },
    rail: { width: RAIL, alignItems: "center" },
    line: { position: "absolute", width: 2, backgroundColor: th.c.borderStrong, borderRadius: 1 },
    num: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", backgroundColor: th.c.primary, borderWidth: 2, borderColor: th.c.bg },
    picked: { borderColor: th.c.primary, borderWidth: 2 },
    pickedMove: { backgroundColor: th.c.surfaceAlt, borderRadius: th.radius.md, marginHorizontal: -th.space.sm, paddingHorizontal: th.space.sm },
    node: { width: 16, height: 16, borderRadius: 8, backgroundColor: th.c.primary, borderWidth: 3, borderColor: th.c.bg, boxShadow: `0 0 0 2px ${th.c.primary}` },
    visit: { flex: 1, marginVertical: 5, flexDirection: "row", alignItems: "center", gap: th.space.md, padding: th.space.md + 2 },
    move: { flex: 1, flexDirection: "row", alignItems: "center", gap: th.space.md, paddingVertical: th.space.sm },
  }));

  return (
    <Screen
      refreshing={false}
      onRefresh={() => {
        reload();
        reloadSum();
      }}
    >
      <ScreenHeader title="Timeline" subtitle="Your day, stop by stop" />
      {authLost ? <PairingLost /> : null}

      {/* No day at all (nothing recorded yet): the empty state below says so. */}
      {resp && !date ? null : (
        <View style={s.nav}>
          <RoundButton icon="chevron-left" label="Previous day" onPress={() => prev && setWant(prev)} disabled={!prev} />
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text variant="overline" color="primary">
              {day
                ? `${day.toLocaleDateString([], { weekday: "long" })}${day.getFullYear() !== new Date().getFullYear() ? ` · ${day.getFullYear()}` : ""}`
                : " "}
            </Text>
            <Text variant="title2">{day ? day.toLocaleDateString([], { day: "numeric", month: "long" }) : "…"}</Text>
          </View>
          <RoundButton icon="chevron-right" label="Next day" onPress={() => next && setWant(next)} disabled={!next} />
        </View>
      )}

      {resp && date ? (
        <DayMapCard
          date={date}
          visible={hasMap}
          selected={selected}
          onSelect={(key) => setSel({ key, from: "map", date })}
        />
      ) : null}

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
            <View style={s.stats}>
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
            </View>
            {moves.length > 0 && (summary ? stripModes(summary).length > 0 : !sumErr) ? (
              <>
                <View style={s.hairline} />
                <DaySummaryStrip summary={summary} />
              </>
            ) : null}
          </Card>

          {err ? (
            <Text variant="caption" style={{ color: t.c.danger }}>
              {err}
            </Text>
          ) : null}

          <View style={{ opacity: loading ? 0.5 : 1 }}>
            {items.map((it, i) => {
              const gap = i > 0 ? gapBetween(items[i - 1], it) : null;
              return (
                <Fragment key={it.kind === "visit" ? `v${it.visit.id}-${i}` : `m${it.track.id}-${i}`}>
                  {gap ? <GapRow gap={gap} /> : null}
                  {row(it, i)}
                </Fragment>
              );
            })}
          </View>
        </>
      )}
    </Screen>
  );

  function row(it: TimelineItem, i: number) {
    const first = i === 0;
    const last = i === items.length - 1;
    if (it.kind === "visit") {
      const v = it.visit;
      const named = isNamed(v.placeName);
      const cat = v.category ? categoryMeta(v.category).label : null;
      const key = selectionKey(it);
      const num = visitNo.get(key);
      return (
        <Pressable
          style={s.row}
          onPress={hasMap ? () => pick(key) : undefined}
          disabled={!hasMap}
          accessibilityRole={hasMap ? "button" : undefined}
          accessibilityState={hasMap ? { selected: selected?.key === key } : undefined}
        >
          <View style={s.rail}>
            <View style={[s.line, { top: first ? 26 : 0, bottom: last ? undefined : 0, height: last ? 26 : undefined }]} />
            {num != null ? (
              <View style={[s.num, { marginTop: 15 }]}>
                <Text variant="caption" tabular style={{ color: t.c.onPrimary, fontSize: 11, lineHeight: 14, fontWeight: "800" }}>
                  {num}
                </Text>
              </View>
            ) : (
              <View style={{ marginTop: 18 }}>
                <View style={s.node} />
              </View>
            )}
          </View>
          <Card style={[s.visit, selected?.key === key ? s.picked : null]}>
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
        </Pressable>
      );
    }
    const m = it.track;
    const meta = modeMeta(m.mode);
    const color = t.mode(m.mode);
    const drift = isLikelyDrift(m.mode, m.distance, m.duration);
    const key = selectionKey(it);
    const canPick = hasMap && m.mode !== "stationary";
    const picked = selected?.key === key;
    return (
      <Pressable
        style={s.row}
        onPress={canPick ? () => pick(key) : undefined}
        disabled={!canPick}
        accessibilityRole={canPick ? "button" : undefined}
        accessibilityState={canPick ? { selected: picked } : undefined}
      >
        <View style={s.rail}>
          <View style={[s.line, { top: 0, bottom: 0, width: picked ? 7 : 5, backgroundColor: color, borderRadius: 4 }]} />
        </View>
        <View style={[s.move, picked ? s.pickedMove : null]}>
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
            {subRows(m).map((r, k) =>
              r.kind === "leg" ? <LegBadge key={k} leg={r.leg} /> : <WaitLine key={k} stop={r.stop} secs={r.secs} />,
            )}
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
      </Pressable>
    );
  }
}
