import { Fragment, useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { categoryMeta } from "../design/categories";
import { useStyles, useTheme } from "../design/theme";
import { fmtDateShort, fmtDayHeading, fmtDistance, fmtDuration, fmtTime, fmtVisitRange, isLikelyDrift, isNamed, localDay, displayName } from "../format";
import type { Pairing } from "../pairing";
import { Badge, Button, Card, EmptyState, ErrorState, Icon, IconButton, Skeleton } from "../ui";
import { Screen, ScreenHeader } from "../ui/Screen";
import { PairingLost, useSession, useViewerQuery } from "../ui/session";
import { Text } from "../ui/Text";
import { getDayPhotos, getTimeline, type DayPhotos, type Leg, type Move, type Timeline, type TimelineItem } from "../viewer";
import { placeIcon } from "../design/placeIcons";
import { DashedRail, MissingTravelRow, PhotoStrip, PhotoViewer, PlaceQuestion, type PhotoSet } from "../ui/TimelineExtras";
import { getDaySummary, type DaySummary } from "../daySummary";
import { DayModes } from "../ui/DaySummary";
import { DayPicker } from "../ui/DayPicker";
import { modeMeta } from "../design/modes";
import { legBadgeText } from "../design/transit";
import { LineBadge } from "../ui/LineBadge";
import { TripFixSheet } from "../ui/TripFixSheet";
import { addedMove, adjacentDays, dayHasMap, gapBetween, missingTravel, selectionKey, subRows, type Gap } from "../timeline-logic";
import { DayMapCard, MAP_HEIGHT, type DayMapSelection } from "../ui/DayMapCard";

/** The rail column: glyphs centre on it; every row's text starts after it. */
const RAIL = 40;
const RAIL_GAP = 12;
/** Visit circle: 32, its centre this far below the row top. */
const DOT = 32;
const DOT_TOP = 10;

/** "Bus 550  Esimerkkitie → Ruskeasuo": the line as signed at the stop, then the stops in muted text. */
function LegLine({ leg }: { leg: Leg }) {
  const t = useTheme();
  const route = [leg.fromStop, leg.toStop].filter(Boolean).join(" → ");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: t.space.sm, rowGap: 2 }}>
      <LineBadge kind={leg.kind} text={legBadgeText(leg.kind, leg.lines)} />
      {route ? (
        <Text variant="callout" color="textSecondary" style={{ flexShrink: 1 }}>
          {route}
        </Text>
      ) : null}
    </View>
  );
}

/** A quiet note on the rail: a 16 icon and one muted line ("Waited at Kamppi · 6 min"). */
function Note({ icon, color, children }: { icon: "wait" | "warning" | "stationary" | "noLocation"; color?: string; children: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
      <View style={{ height: 18, justifyContent: "center" }}>
        <Icon name={icon} size={16} color={color ?? t.c.textMuted} />
      </View>
      <Text variant="callout" color="textSecondary" tabular style={{ flexShrink: 1 }}>
        {children}
      </Text>
    </View>
  );
}

/**
 * Time with nothing recorded between two rows (location off, phone dead): the
 * same two-line anatomy as "Missing travel", in neutral colours ("No location"
 * over "13:20–16:55 · 3 h 35 min").
 */
function GapRow({ gap }: { gap: Gap }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: RAIL_GAP }} accessible accessibilityLabel={`No location, ${fmtTime(gap.from)} to ${fmtTime(gap.to)}, ${fmtDuration(gap.secs)}`}>
      <DashedRail rail={RAIL} color={t.c.borderStrong} dashes={5} />
      <View style={{ flex: 1, gap: 2, paddingVertical: t.space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="noLocation" size={16} color={t.c.textMuted} />
          <Text variant="headline" color="textSecondary">
            No location
          </Text>
        </View>
        <Text variant="callout" color="textSecondary" tabular>
          {`${fmtTime(gap.from)}–${fmtTime(gap.to)} · ${fmtDuration(gap.secs)}`}
        </Text>
      </View>
    </View>
  );
}

/**
 * The loading shape, as loaded: the full-bleed map block at the map's height,
 * the day's stats card, then a rail with stops on it and lines of text.
 */
function TimelineSkeleton() {
  const t = useTheme();
  return (
    <View style={{ gap: t.space.lg }}>
      <View style={{ height: MAP_HEIGHT, marginHorizontal: -t.layout.gutter, marginTop: -t.space.sm, backgroundColor: t.c.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
        <Icon name="tabMap" size={24} color={t.c.textMuted} />
      </View>
      <Card style={{ gap: t.space.md }}>
        <Skeleton height={18} width="70%" radius={6} />
        <Skeleton height={10} radius={5} />
        <View style={{ flexDirection: "row", gap: t.space.lg }}>
          <Skeleton height={14} width="25%" radius={6} />
          <Skeleton height={14} width="25%" radius={6} />
        </View>
      </Card>
      <View>
        <View style={{ position: "absolute", left: RAIL / 2 - 1, top: DOT_TOP + DOT / 2, bottom: 40, width: 2, backgroundColor: t.c.skeleton }} />
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ flexDirection: "row", gap: RAIL_GAP, minHeight: i % 2 ? 44 : 72 }}>
            <View style={{ width: RAIL, alignItems: "center", paddingTop: i % 2 ? 12 : DOT_TOP }}>
              {i % 2 ? <Skeleton height={20} width={20} radius={10} /> : <Skeleton height={DOT} width={DOT} radius={DOT / 2} />}
            </View>
            <View style={{ flex: 1, gap: 6, paddingTop: i % 2 ? 14 : 14 }}>
              <Skeleton height={16} width={i % 2 ? "45%" : "65%"} radius={6} />
              {i % 2 ? null : <Skeleton height={12} width="40%" radius={6} />}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function TimelineScreen() {
  const t = useTheme();
  const { authLost, timelineDate, goTab } = useSession();
  // null = latest day with data (server default); another tab may open a given day.
  const [want, setWant] = useState<string | null>(() => timelineDate?.date ?? null);
  const fetcher = useCallback((p: Pairing) => getTimeline(p, want), [want]);
  const { data: resp, error: err, loading, reload } = useViewerQuery<Timeline>(fetcher);
  const [picking, setPicking] = useState(false);

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
  // The day being asked for shows in the app bar at once; its rows follow.
  const shownDate = want ?? date;
  const day = shownDate ? localDay(shownDate) : null;

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
  const [viewing, setViewing] = useState<{ set: PhotoSet; start: number; caption: string } | null>(null);
  const refreshDay = () => {
    reload();
    reloadSum();
    reloadPhotos();
  };

  const s = useStyles((th) => ({
    row: { flexDirection: "row", gap: RAIL_GAP },
    rail: { width: RAIL, alignItems: "center" },
    line: { position: "absolute", width: 2, left: RAIL / 2 - 1 },
    dot: {
      width: DOT,
      height: DOT,
      borderRadius: DOT / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: th.c.surface,
      borderWidth: 1,
      borderColor: th.c.borderStrong,
      marginTop: DOT_TOP,
    },
    dotOn: { borderColor: th.c.primary, borderWidth: 2, backgroundColor: th.c.primarySoft },
    glyph: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: th.c.bg, marginTop: 8 },
    body: { flex: 1, paddingVertical: th.space.md, paddingRight: th.space.sm, gap: th.space.xs, borderRadius: th.radius.sm, marginLeft: -th.space.sm, paddingLeft: th.space.sm },
    bodyOn: { backgroundColor: th.c.surfaceAlt },
  }));

  const title = day ? fmtDayHeading(day) : null;
  const appBar = (
    <ScreenHeader
      title={
        title ? (
          <Text variant="title1" accessibilityRole="header" numberOfLines={1} accessibilityLabel={day ? day.toDateString() : undefined}>
            {title}
            {title === "Today" || title === "Yesterday" ? (
              <Text variant="title1" color="textMuted">
                {` · ${fmtDateShort(day!).replace(/^\w+ /, "")}`}
              </Text>
            ) : null}
          </Text>
        ) : resp && !date ? (
          "Timeline"
        ) : err && !resp ? (
          "Timeline"
        ) : (
          <Skeleton height={22} width={150} radius={6} />
        )
      }
      // The same three buttons in every state (disabled while loading or with no days), so the bar never changes shape.
      right={
        <>
          <IconButton icon="back" label="Previous day" onPress={() => prev && setWant(prev)} disabled={!prev} />
          <IconButton icon="forward" label="Next day" onPress={() => next && setWant(next)} disabled={!next} />
          <IconButton icon="calendarDays" label="Go to a day" onPress={() => setPicking(true)} disabled={!(resp && date)} />
        </>
      }
    />
  );

  return (
    <Screen
      appBar={appBar}
      refreshing={false}
      onRefresh={() => {
        reload();
        reloadSum();
      }}
    >
      {authLost ? <PairingLost /> : null}

      {resp && date ? (
        <DayMapCard date={date} visible={hasMap} selected={selected} onSelect={(key) => setSel({ key, from: "map", date })} />
      ) : null}

      {authLost && !resp ? null : err && !resp ? (
        <ErrorState message={err} onRetry={reload} />
      ) : !resp ? (
        <TimelineSkeleton />
      ) : items.length === 0 ? (
        <Card>
          {date ? (
            <EmptyState icon="quiet" title="A quiet day" body="Nothing was recorded on this day. Use the arrows to go to a day with visits or trips." />
          ) : (
            <EmptyState
              icon="noDays"
              title="No days yet"
              body="Visits and trips show up here once the server has processed what this phone recorded."
              action={<Button label="Open recorder" icon="tabRecorder" variant="tonal" onPress={() => goTab("recorder")} />}
            />
          )}
        </Card>
      ) : (
        <>
          <Card style={{ gap: t.space.md }}>
            <Text variant="callout" color="textSecondary" tabular accessibilityRole="summary">
              <Text variant="statSm" tabular>
                {fmtDistance(km)}
              </Text>
              {"  ·  "}
              <Text variant="headline" tabular>
                {fmtDuration(moving)}
              </Text>
              {" moving  ·  "}
              <Text variant="headline" tabular>
                {String(visits)}
              </Text>
              {visits === 1 ? " stop" : " stops"}
            </Text>
            {moves.length > 0 && !(sumErr && !summary) ? <DayModes summary={summary} /> : null}
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
      <PhotoViewer
        set={viewing?.set ?? null}
        start={viewing?.start ?? 0}
        caption={viewing?.caption}
        linkBase={photos?.linkBase ?? null}
        onClose={() => setViewing(null)}
      />
      <DayPicker visible={picking} dates={resp?.dates ?? []} selected={date} onPick={setWant} onClose={() => setPicking(false)} />
    </Screen>
  );

  /** The rail colour next to an item: a move's mode colour, else the neutral rail. */
  function railColor(it: TimelineItem | undefined, joined: boolean): string {
    if (!it || !joined) return t.c.borderStrong;
    return it.kind === "move" && it.track.mode !== "stationary" ? t.mode(it.track.mode) : t.c.borderStrong;
  }

  function row(it: TimelineItem, i: number) {
    const before = items[i - 1];
    const after = items[i + 1];
    // A gap or "Missing travel" row breaks the rail with its own dashes.
    const joinedAbove = !!before && !missingTravel(before, it) && !gapBetween(before, it);
    const key = selectionKey(it);

    if (it.kind === "visit") {
      const v = it.visit;
      const named = isNamed(v.placeName);
      const cat = v.category ? categoryMeta(v.category).label : null;
      const icon = placeIcon(v.placeKind, v.category, v.osmKey);
      const title = named ? displayName(v.placeName!) : (cat ?? "Unnamed place");
      // "Were you here?": the name is a guess among several.
      const asking = !!v.candidates?.length;
      const set = photoSets.get(key);
      const on = selected?.key === key;
      // Across midnight the times say which day ("Since 22:05 yesterday, until 08:20").
      const times = fmtVisitRange(v.startedAt, v.endedAt, date);
      const meta = [times, fmtDuration(v.duration), named && cat ? cat : null].filter(Boolean).join(" · ");
      return (
        <View style={s.row}>
          <View style={s.rail}>
            {/* Mode-coloured from the move above down to this stop, neutral past it. */}
            {before ? <View style={[s.line, { top: 0, height: DOT_TOP, backgroundColor: railColor(before, joinedAbove) }]} /> : null}
            {/* Under the stop the rail stays neutral; the next trip's colour starts at its own row. */}
            {after ? <View style={[s.line, { top: DOT_TOP + DOT, bottom: 0, backgroundColor: t.c.borderStrong }]} /> : null}
            <View style={[s.dot, on && s.dotOn]} accessible accessibilityLabel={icon.label}>
              <Icon name={icon.icon} size={16} color={on ? t.c.primary : t.c.textSecondary} />
            </View>
          </View>
          <View style={[s.body, { paddingVertical: 0 }, (asking || set) && { paddingBottom: t.space.md }, on && s.bodyOn]}>
            {/* The text block is the touch target: padded to 64+ for two lines. */}
            <Pressable
              onPress={hasMap ? () => pick(key) : undefined}
              disabled={!hasMap}
              accessibilityRole={hasMap ? "button" : undefined}
              accessibilityState={hasMap ? { selected: on } : undefined}
              style={{ gap: 2, paddingTop: t.space.md + 2, paddingBottom: asking || set ? 0 : t.space.md, minHeight: 64 }}
            >
              <Text variant="headline" numberOfLines={2} color={named || cat ? "text" : "textSecondary"}>
                {title}
              </Text>
              <Text variant="callout" color="textSecondary" tabular numberOfLines={2}>
                {meta}
              </Text>
            </Pressable>
            {asking ? <PlaceQuestion key={v.placeId} visit={v} shownName={title} onAnswered={refreshDay} /> : null}
            {set ? <PhotoStrip set={set} onOpen={(start) => setViewing({ set, start, caption: `${title} · ${times}` })} /> : null}
          </View>
        </View>
      );
    }

    const m = it.track;
    const meta = modeMeta(m.mode);
    const set = photoSets.get(key);

    // Lying still between two stops isn't travel: a quiet note on the neutral rail.
    if (m.mode === "stationary") {
      return (
        <View style={s.row}>
          <View style={s.rail}>
            <View style={[s.line, { top: 0, bottom: 0, backgroundColor: t.c.borderStrong }]} />
          </View>
          <View style={{ flex: 1, paddingVertical: t.space.sm, gap: t.space.xs }}>
            <Note icon="stationary">{`Still for ${fmtDuration(m.duration)} nearby · ${fmtTime(m.startedAt)}–${fmtTime(m.endedAt)}`}</Note>
            {set ? <PhotoStrip set={set} onOpen={(start) => setViewing({ set, start, caption: `${fmtTime(m.startedAt)}–${fmtTime(m.endedAt)}` })} /> : null}
          </View>
        </View>
      );
    }

    const color = t.mode(m.mode);
    const drift = isLikelyDrift(m.mode, m.distance, m.duration);
    const picked = selected?.key === key;
    const facts = `${fmtDistance(m.distance)} · ${fmtDuration(m.duration)}`;
    const action = m.added ? "edit the trip you added" : m.correctionId != null ? "edit the fix of this trip" : "fix this trip";
    const subs = subRows(m);
    // A ride on more than one kind of line is titled by all of them ("Bus + Metro"), as the mode legend counts them.
    const legKinds = [...new Set(m.legs.map((l) => l.kind))];
    const label = legKinds.length > 1 ? legKinds.map((k) => modeMeta(k).label).join(" + ") : meta.label;
    return (
      <View style={s.row}>
        <View style={s.rail}>
          <View style={[s.line, { top: 0, bottom: 0, width: picked ? 4 : 2, left: RAIL / 2 - (picked ? 2 : 1), backgroundColor: color }]} />
          <View style={s.glyph}>
            <Icon name={meta.icon} size={20} color={color} />
          </View>
        </View>
        {/* The whole row opens "Fix this trip" (and shows the move on the map). */}
        <Pressable
          onPress={() => {
            if (hasMap && date) setSel({ key, from: "list", date });
            setFixing(m);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${facts}: ${action}`}
          style={({ pressed }) => [s.body, { paddingVertical: t.space.sm + 2, minHeight: 44 }, (picked || pressed) && s.bodyOn]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.space.sm }}>
            <Text variant="callout" color="textSecondary" tabular numberOfLines={1} style={{ flexShrink: 1 }}>
              <Text variant="label" style={{ fontSize: 13 }}>
                {label}
              </Text>
              {` · ${facts}`}
            </Text>
            {m.correctionId != null ? <Badge label={m.added ? "Added by you" : "Edited"} /> : null}
            <View style={{ flex: 1 }} />
            <Icon name="chevronRight" size={16} color={t.c.textMuted} />
          </View>
          {subs.length > 0 ? (
            <View style={{ gap: 6, marginTop: 2 }}>
              {subs.map((r, k) =>
                r.kind === "leg" ? (
                  <LegLine key={k} leg={r.leg} />
                ) : (
                  <Note key={k} icon="wait">{`${r.stop ? `Waited at ${r.stop}` : "Change"} · ${fmtDuration(r.secs)}`}</Note>
                ),
              )}
            </View>
          ) : null}
          {drift ? (
            <Note icon="warning" color={t.c.warning}>
              Noisy GPS — distance not counted
            </Note>
          ) : null}
          {set ? (
            <PhotoStrip set={set} onOpen={(start) => setViewing({ set, start, caption: `${meta.label} · ${fmtTime(m.startedAt)}–${fmtTime(m.endedAt)}` })} />
          ) : null}
        </Pressable>
      </View>
    );
  }
}
