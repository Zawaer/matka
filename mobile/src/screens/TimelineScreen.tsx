import { Fragment, useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { categoryMeta } from "../design/categories";
import { useStyles, useTheme } from "../design/theme";
import { fmtDistance, fmtDuration, fmtTime, isLikelyDrift, isNamed, localDay } from "../format";
import type { Pairing } from "../pairing";
import { Badge, Card, EmptyState, ErrorState, Icon, IconButton, Skeleton } from "../ui";
import { Pager, Screen, ScreenHeader } from "../ui/Screen";
import { PairingLost, useSession, useViewerQuery } from "../ui/session";
import { Text } from "../ui/Text";
import { getDayPhotos, getTimeline, type DayPhotos, type Leg, type Move, type Timeline, type TimelineItem } from "../viewer";
import { placeIcon } from "../design/placeIcons";
import { DashedRail, MissingTravelRow, PhotoStrip, PhotoViewer, PlaceQuestion, type PhotoSet } from "../ui/TimelineExtras";
import { getDaySummary, stripModes, type DaySummary } from "../daySummary";
import { DaySummaryStrip } from "../ui/DaySummary";
import { modeMeta } from "../design/modes";
import { LEG_BADGE, legBadgeText } from "../design/transit";
import { TripFixSheet } from "../ui/TripFixSheet";
import { addedMove, adjacentDays, dayHasMap, gapBetween, missingTravel, selectionKey, subRows, type Gap } from "../timeline-logic";
import { DayMapCard, type DayMapSelection } from "../ui/DayMapCard";

const RAIL = 40;

/** "Bus 159  Leppävaara → Matinkylä (M)", in HSL's line colours ("Metro M1/M2" on shared track). */
function LegBadge({ leg }: { leg: Leg }) {
  const t = useTheme();
  const b = LEG_BADGE[leg.kind];
  const route = [leg.fromStop, leg.toStop].filter(Boolean).join(" → ");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: t.space.sm, rowGap: 2, marginTop: t.space.xs }}>
      <View style={{ backgroundColor: b.bg, borderRadius: t.radius.xs, paddingHorizontal: 8, height: 22, justifyContent: "center" }}>
        <Text variant="micro" style={{ color: b.fg }}>
          {legBadgeText(leg.kind, leg.lines)}
        </Text>
      </View>
      {route ? (
        <Text variant="callout" color="textSecondary" style={{ flexShrink: 1 }}>
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
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: t.space.xs }}>
      <Icon name="wait" size={16} color={t.c.textMuted} />
      <Text variant="callout" color="textSecondary" tabular style={{ flexShrink: 1 }}>
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
      <DashedRail rail={RAIL} color={t.c.borderStrong} dashes={4} />
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: t.space.sm }}>
        <Icon name="noLocation" size={16} color={t.c.textMuted} />
        <Text variant="callout" color="textMuted" tabular style={{ flexShrink: 1 }}>
          No location recorded · {fmtDuration(gap.secs)} · {fmtTime(gap.from)}–{fmtTime(gap.to)}
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
  // The trip being fixed ("Fix this trip" bottom sheet).
  const [fixing, setFixing] = useState<Move | null>(null);
  // Photos of the day (Immich), after the list; asked again while the server looks them up.
  const photoFetcher = useCallback(
    async (p: Pairing) => {
      if (!date) return { ok: true as const, data: null };
      const r = await getDayPhotos(p, date);
      return r.ok ? { ok: true as const, data: { date, ...r.data } } : r;
    },
    [date],
  );
  const { data: photosResp, reload: reloadPhotos } = useViewerQuery<(DayPhotos & { date: string }) | null>(photoFetcher);
  const photos = photosResp && photosResp.date === date && photosResp.configured ? photosResp : null;
  const pending = photosResp?.pending === true;
  useEffect(() => {
    if (!pending) return;
    const id = setTimeout(reloadPhotos, 3000);
    return () => clearTimeout(id);
  }, [pending, photosResp, reloadPhotos]);
  const photoSets = new Map<string, PhotoSet>((photos?.items ?? []).map((p) => [p.key, { ids: p.ids, total: p.total }]));
  const [viewing, setViewing] = useState<{ set: PhotoSet; start: number } | null>(null);
  const refreshDay = () => {
    reload();
    reloadSum();
    reloadPhotos();
  };
  const visitNo = new Map<string, number>();
  if (hasMap) for (const it of items) if (it.kind === "visit") visitNo.set(selectionKey(it), visitNo.size + 1);

  const s = useStyles((th) => ({
    summary: { padding: 0 },
    stats: { flexDirection: "row" },
    divider: { width: 1, backgroundColor: th.c.border },
    row: { flexDirection: "row", gap: th.space.md },
    rail: { width: RAIL, alignItems: "center" },
    line: { position: "absolute", width: 2, backgroundColor: th.c.borderStrong, borderRadius: 1 },
    tile: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: th.c.surface,
      borderWidth: 1,
      borderColor: th.c.borderStrong,
    },
    tileOn: { borderColor: th.c.primary, borderWidth: 2, backgroundColor: th.c.primarySoft },
    num: {
      position: "absolute",
      top: -6,
      right: -8,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: th.c.text,
      borderWidth: 2,
      borderColor: th.c.bg,
    },
    visit: { flex: 1, marginVertical: th.space.xs },
    visitOn: { borderColor: th.c.primary },
    move: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: th.space.xs, paddingVertical: th.space.md },
    moveOn: { backgroundColor: th.c.surfaceAlt, borderRadius: th.radius.sm, marginLeft: -th.space.sm, paddingLeft: th.space.sm },
    glyph: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: th.c.bg },
  }));

  const dayStat = (label: string, value: string) => (
    <View style={{ flex: 1, paddingHorizontal: t.space.md, paddingVertical: t.space.md, gap: 2 }}>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="statSm" tabular numberOfLines={1}>
        {value}
      </Text>
    </View>
  );

  return (
    <Screen
      refreshing={false}
      onRefresh={() => {
        reload();
        reloadSum();
      }}
    >
      <ScreenHeader title="Timeline" />
      {authLost ? <PairingLost /> : null}

      {/* No day at all (nothing recorded yet): the empty state below says so. */}
      {resp && !date ? null : (
        <Pager
          kicker={
            day
              ? `${day.toLocaleDateString([], { weekday: "long" })}${day.getFullYear() !== new Date().getFullYear() ? ` · ${day.getFullYear()}` : ""}`
              : " "
          }
          title={day ? day.toLocaleDateString([], { day: "numeric", month: "long" }) : "…"}
          onPrev={prev ? () => setWant(prev) : undefined}
          onNext={next ? () => setWant(next) : undefined}
          prevLabel="Previous day"
          nextLabel="Next day"
        />
      )}

      {resp && date ? (
        <DayMapCard date={date} visible={hasMap} selected={selected} onSelect={(key) => setSel({ key, from: "map", date })} />
      ) : null}

      {authLost && !resp ? null : err && !resp ? (
        <ErrorState message={err} onRetry={reload} />
      ) : !resp ? (
        <View style={{ gap: t.space.md }}>
          <Skeleton height={124} />
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ flexDirection: "row", gap: t.space.md }}>
              <Skeleton height={32} width={32} radius={16} style={{ marginLeft: 4, marginTop: 16 }} />
              <View style={{ flex: 1, gap: t.space.md }}>
                <Skeleton height={68} />
                <Skeleton height={20} width="50%" radius={6} />
              </View>
            </View>
          ))}
        </View>
      ) : items.length === 0 ? (
        <Card>
          {date ? (
            <EmptyState icon="quiet" title="A quiet day" body="Nothing was recorded on this day. Use the arrows to go to a day with visits or trips." />
          ) : (
            <EmptyState icon="route" title="No days yet" body="Visits and trips show up here once the server has processed what this phone recorded." />
          )}
        </Card>
      ) : (
        <>
          <Card padded={false}>
            <View style={s.stats}>
              {dayStat("Travelled", fmtDistance(km))}
              <View style={s.divider} />
              {dayStat("On the move", fmtDuration(moving))}
              <View style={s.divider} />
              {dayStat(visits === 1 ? "Stop" : "Stops", String(visits))}
            </View>
            {moves.length > 0 && (summary ? stripModes(summary).length > 0 : !sumErr) ? (
              <View style={{ borderTopWidth: 1, borderTopColor: t.c.border, paddingVertical: t.space.md, paddingHorizontal: t.space.lg }}>
                <DaySummaryStrip summary={summary} />
              </View>
            ) : null}
          </Card>

          {err ? (
            <Text variant="callout" color="danger">
              {err}
            </Text>
          ) : null}

          <View style={{ opacity: loading ? 0.5 : 1 }}>
            {items.map((it, i) => {
              // Far apart with no move between: "Missing travel" (it says
              // "No location recorded" itself when that is why).
              const missing = i > 0 ? missingTravel(items[i - 1], it) : null;
              const gap = i > 0 && !missing ? gapBetween(items[i - 1], it) : null;
              return (
                <Fragment key={it.kind === "visit" ? `v${it.visit.id}-${i}` : `m${it.track.id}-${i}`}>
                  {gap ? <GapRow gap={gap} /> : null}
                  {missing ? <MissingTravelRow gap={missing} rail={RAIL} onAdd={() => setFixing(addedMove(missing))} /> : null}
                  {row(it, i)}
                </Fragment>
              );
            })}
          </View>
        </>
      )}
      <TripFixSheet move={fixing} onClose={() => setFixing(null)} onSaved={refreshDay} />
      <PhotoViewer set={viewing?.set ?? null} start={viewing?.start ?? 0} linkBase={photos?.linkBase ?? null} onClose={() => setViewing(null)} />
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
      const icon = placeIcon(v.placeKind, v.category, v.osmKey);
      const title = named ? v.placeName! : (cat ?? "Unnamed place");
      // "Were you here?": the name is a guess among several.
      const asking = !!v.candidates?.length;
      const set = photoSets.get(key);
      const on = selected?.key === key;
      return (
        <View style={s.row}>
          <View style={s.rail}>
            <View style={[s.line, { top: first ? 26 : 0, bottom: last ? undefined : 0, height: last ? 26 : undefined }]} />
            <View style={[s.tile, { marginTop: 14 }, on && s.tileOn]} accessible accessibilityLabel={num != null ? `Stop ${num}, ${icon.label}` : icon.label}>
              <Icon name={icon.icon} size={16} color={on ? t.c.primary : t.c.textSecondary} />
              {num != null ? (
                <View style={s.num}>
                  <Text variant="micro" tabular style={{ color: t.c.bg, fontSize: 11, lineHeight: 13 }}>
                    {num}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <Card style={[s.visit, on && s.visitOn]}>
            <Pressable
              onPress={hasMap ? () => pick(key) : undefined}
              disabled={!hasMap}
              accessibilityRole={hasMap ? "button" : undefined}
              accessibilityState={hasMap ? { selected: on } : undefined}
              style={{ flexDirection: "row", alignItems: "flex-start", gap: t.space.md }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="headline" numberOfLines={2}>
                  {title}
                </Text>
                <Text variant="callout" color="textSecondary" tabular numberOfLines={1}>
                  {fmtTime(v.startedAt)}–{fmtTime(v.endedAt)}
                  {named && cat ? ` · ${cat}` : ""}
                </Text>
              </View>
              <Text variant="headline" tabular>
                {fmtDuration(v.duration)}
              </Text>
            </Pressable>
            {asking ? <PlaceQuestion key={v.placeId} visit={v} shownName={title} onAnswered={refreshDay} /> : null}
            {set ? <PhotoStrip set={set} onOpen={(start) => setViewing({ set, start })} /> : null}
          </Card>
        </View>
      );
    }
    const m = it.track;
    const meta = modeMeta(m.mode);
    const color = t.mode(m.mode);
    const drift = isLikelyDrift(m.mode, m.distance, m.duration);
    const key = selectionKey(it);
    const set = photoSets.get(key);
    const canPick = hasMap && m.mode !== "stationary";
    const picked = selected?.key === key;
    return (
      <View style={s.row}>
        <View style={s.rail}>
          <View style={[s.line, { top: 0, bottom: 0, width: picked ? 6 : 4, backgroundColor: color, borderRadius: 3 }]} />
          <View style={[s.glyph, { marginTop: 8 }]}>
            <Icon name={meta.icon} size={20} color={color} />
          </View>
        </View>
        <View style={[s.move, picked && s.moveOn]}>
          <Pressable
            onPress={canPick ? () => pick(key) : undefined}
            disabled={!canPick}
            accessibilityRole={canPick ? "button" : undefined}
            accessibilityState={canPick ? { selected: picked } : undefined}
            style={{ flex: 1, gap: 2 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.sm }}>
              <Text variant="headline">{meta.label}</Text>
              {m.correctionId != null ? <Badge label={m.added ? "Added by you" : "Edited"} /> : null}
            </View>
            <Text variant="callout" color="textSecondary" tabular>
              {m.mode === "stationary" ? fmtDuration(m.duration) : `${fmtDistance(m.distance)} · ${fmtDuration(m.duration)}`}
            </Text>
            {subRows(m).map((r, k) =>
              r.kind === "leg" ? <LegBadge key={k} leg={r.leg} /> : <WaitLine key={k} stop={r.stop} secs={r.secs} />,
            )}
            {drift && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: t.space.xs }}>
                <Icon name="warning" size={16} color={t.c.warning} />
                <Text variant="callout" color="warning" style={{ flexShrink: 1 }}>
                  GPS jumped around here, not counted
                </Text>
              </View>
            )}
            {set ? <PhotoStrip set={set} onOpen={(start) => setViewing({ set, start })} /> : null}
          </Pressable>
          {m.mode !== "stationary" ? (
            <IconButton
              icon="edit"
              color={t.c.textSecondary}
              label={m.added ? "Edit the trip you added" : m.correctionId != null ? "Edit the fix of this trip" : "Fix this trip"}
              onPress={() => setFixing(m)}
            />
          ) : null}
        </View>
      </View>
    );
  }
}
