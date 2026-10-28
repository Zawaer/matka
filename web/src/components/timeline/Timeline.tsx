"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Fragment, useState, type MouseEvent } from "react";
import { placeTitle } from "@/components/places/category";
import { KIND_META } from "@/lib/savedPlaces";
import useSWR from "swr";
import { MODE_META } from "@/lib/modes";
import { DaySummaryStrip } from "./DaySummaryStrip";
import { edgeGaps, gapBetween, missingTravel, type MissingTravel } from "./gaps";
import { ArrowRight, CalendarX2, ChevronLeft, ChevronRight, CloudOff, MapPinOff, Pencil } from "lucide-react";
import { Badge, Button, EmptyState, IconButton, ModeGlyph, PlaceGlyph, Skeleton, cx, inputClass, placeIconLabel } from "@/components/ui";
import { MissingTravelRow, PhotoStrip, PhotoViewer, PlaceQuestion, useDayPhotos, type PhotoSet } from "./TimelineExtras";
import { dayHasMap, selectionKey } from "./dayMap";
import type { DayMapSelection } from "./DayMap";
import { badgeColors, legBadgeText } from "@/lib/transit/colors";
import { TripEditor } from "./TripEditor";
import {
  formatDuration,
  formatDistance,
  formatTime,
  formatDateLong,
} from "@/lib/format";
import type { TimelineDay, TimelineItem, Visit, TrackSummary, TransitLeg } from "@/lib/types";

type TimelineResponse = {
  day: TimelineDay;
  dates: string[];
  minDate: string | null;
  maxDate: string | null;
};

// MapLibre is big: load the day map only once a day with something to draw shows up.
const DayMap = dynamic(() => import("./DayMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-[260px] rounded-card md:h-[340px]" />,
});

/** Rows scrolled to from the map stop below the sticky map and above the phone's tab bar. */
const ROW_SCROLL_MARGIN = "scroll-mt-[340px] scroll-mb-20 md:scroll-mt-[380px] md:scroll-mb-4";

const fetcher = (url: string): Promise<TimelineResponse> =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    return r.json();
  });

export function Timeline({ initialDate = null }: { initialDate?: string | null }) {
  // `null` lets the API pick the latest day that has data.
  const [date, setDate] = useState<string | null>(initialDate);
  // Keep the day in the address bar, so a reload or a shared link opens it.
  // replaceState, not a navigation: the page is client-driven and the server
  // render would only start over from the same day.
  const pick = (d: string) => {
    setDate(d);
    window.history.replaceState(window.history.state, "", `/timeline?date=${d}`);
  };

  const { data, error, isLoading } = useSWR<TimelineResponse>(
    date ? `/api/timeline?date=${date}` : `/api/timeline`,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const dates = data?.dates ?? [];
  const current = date ?? data?.day.date ?? "";
  const items = data?.day.items ?? [];

  const prevDate = [...dates].reverse().find((d) => d < current) ?? null;
  const nextDate = dates.find((d) => d > current) ?? null;
  const edges = data
    ? edgeGaps(items, data.day, { minDate: data.minDate, maxDate: data.maxDate })
    : { before: null, after: null };

  // The map stays mounted (and keeps its one MapLibre instance) from the
  // first day that has something to draw; an empty day only hides it.
  const showMap = !!data && !error && dayHasMap(items);
  const [mapMounted, setMapMounted] = useState(false);
  if (showMap && !mapMounted) setMapMounted(true);

  // A selection belongs to the day it was made on.
  const [sel, setSel] = useState<(DayMapSelection & { date: string }) | null>(null);
  const selected: DayMapSelection = sel && data && sel.date === data.day.date ? sel : null;
  const selectFromList = (key: string) => {
    if (!data) return;
    setSel(selected?.key === key ? null : { key, from: "list", date: data.day.date });
  };
  const selectFromMap = (key: string) => {
    if (!data) return;
    setSel({ key, from: "map", date: data.day.date });
    requestAnimationFrame(() =>
      document.getElementById(`tl-${key}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
  };
  let visitNo = 0;
  // The trip being fixed ("Fix this trip"), or added ("Add travel").
  const [editing, setEditing] = useState<TrackSummary | null>(null);
  const addTravel = (gap: MissingTravel) =>
    setEditing({
      id: 0,
      startedAt: gap.from,
      endedAt: gap.to,
      distance: gap.distance,
      duration: gap.secs,
      // A first guess the user changes anyway: walking distance or not.
      mode: gap.distance < 2500 ? "walking" : "driving",
      added: true,
      from: gap.fromPos,
      to: gap.toPos,
    });

  // Photos of the day (Immich), once the list is there.
  const photos = useDayPhotos(data?.day.date ?? null, !!data && !isLoading);
  const photosByKey = new Map<string, PhotoSet>(
    data && photos ? photos.items.map((p) => [p.key, { ids: p.ids, total: p.total }]) : [],
  );
  const [viewing, setViewing] = useState<(PhotoSet & { start: number }) | null>(null);

  return (
    <div>
      <DayHeader
        date={current}
        minDate={data?.minDate ?? undefined}
        maxDate={data?.maxDate ?? undefined}
        prevDate={prevDate}
        nextDate={nextDate}
        onPick={pick}
      />

      {current && (
        <DaySummaryStrip
          date={current}
          travelled={items.some((it) => it.kind === "move" && it.track.mode !== "stationary")}
        />
      )}

      {mapMounted && data ? (
        <div
          className={
            showMap
              ? "sticky top-[52px] z-20 -mx-4 mt-2 bg-bg px-4 pb-1 pt-3 sm:-mx-6 sm:px-6 md:top-0 md:-mx-10 md:px-10 md:pt-4"
              : "hidden"
          }
        >
          <DayMap day={data.day} selected={selected} onSelect={selectFromMap} photos={photos?.points} />
        </div>
      ) : null}

      <div className={showMap ? "mt-4" : "mt-6"}>
        {error ? (
          <EmptyState
            icon={CloudOff}
            title="Couldn't load this day"
            description="Something went wrong talking to the server."
            action={
              <Button size="sm" onClick={() => window.location.reload()}>
                Try again
              </Button>
            }
          />
        ) : isLoading && !data ? (
          <TimelineSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={CalendarX2}
            title={current ? "Nothing recorded" : "No location history yet"}
            description={
              current
                ? "No visits or trips on this day. Pick another day with the arrows or the date."
                : "Pair your phone under Devices; days appear here as soon as it records."
            }
          />
        ) : (
          <ol className="relative">
            {edges.before && <GapRow from={edges.before.from} to={edges.before.to} />}
            {items.map((item, i) => {
              // Far apart with no trip between: "Missing travel" (it says
              // "No location recorded" itself when that is why).
              const missing = i > 0 ? missingTravel(items[i - 1], item) : null;
              const gap = i > 0 && !missing ? gapBetween(items[i - 1], item) : null;
              const set = photosByKey.get(selectionKey(item));
              return (
                <Fragment key={rowKey(item, i)}>
                  {gap && <GapRow from={gap.from} to={gap.to} />}
                  {missing && <MissingTravelRow gap={missing} onAdd={() => addTravel(missing)} />}
                  <TimelineRow
                    item={item}
                    num={item.kind === "visit" && showMap ? ++visitNo : undefined}
                    isFirst={i === 0}
                    isLast={i === items.length - 1}
                    selected={selected?.key === selectionKey(item)}
                    onSelect={showMap ? selectFromList : undefined}
                    onFix={setEditing}
                    photos={set ? <PhotoStrip set={set} onOpen={(start) => setViewing({ ...set, start })} /> : null}
                  />
                </Fragment>
              );
            })}
            {edges.after && <GapRow from={edges.after.from} to={edges.after.to} />}
          </ol>
        )}
      </div>
      {editing && <TripEditor key={`${editing.id}-${editing.startedAt}`} track={editing} onClose={() => setEditing(null)} />}
      {viewing && (
        <PhotoViewer
          ids={viewing.ids}
          total={viewing.total}
          start={viewing.start}
          linkBase={photos?.linkBase ?? null}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

function rowKey(item: TimelineItem, i: number) {
  return item.kind === "visit"
    ? `v-${item.visit.id}`
    : `m-${item.track.id}-${i}`;
}

/* ---------------- Day header ---------------- */

function DayHeader({
  date,
  minDate,
  maxDate,
  prevDate,
  nextDate,
  onPick,
}: {
  date: string;
  minDate?: string;
  maxDate?: string;
  prevDate: string | null;
  nextDate: string | null;
  onPick: (d: string) => void;
}) {
  const year = date ? new Date(date).toLocaleDateString("en-GB", { year: "numeric" }) : null;
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-title text-text">
          {date ? formatDateLong(date) : "Timeline"}
        </h1>
        {year && <p className="mt-0.5 text-sm text-muted">{year}</p>}
      </div>

      <div className="flex items-center gap-1.5">
        <IconButton
          icon={ChevronLeft}
          label="Previous day"
          variant="secondary"
          disabled={!prevDate}
          onClick={() => prevDate && onPick(prevDate)}
        />
        <label className="relative">
          <span className="sr-only">Pick a date</span>
          <input
            type="date"
            value={date}
            min={minDate}
            max={maxDate}
            onChange={(e) => e.target.value && onPick(e.target.value)}
            className={cx(inputClass, "w-auto cursor-pointer tabular-nums [color-scheme:light_dark]")}
          />
        </label>
        <IconButton
          icon={ChevronRight}
          label="Next day"
          variant="secondary"
          disabled={!nextDate}
          onClick={() => nextDate && onPick(nextDate)}
        />
      </div>
    </header>
  );
}

/* ---------------- Rows ---------------- */

type Pick = { selected: boolean; onClick?: (e: MouseEvent) => void; id: string };

function TimelineRow({
  item,
  num,
  isFirst,
  isLast,
  selected,
  onSelect,
  onFix,
  photos,
}: {
  item: TimelineItem;
  /** The photos taken during it, if any. */
  photos: React.ReactNode;
  /** The stop's number on the day map. */
  num?: number;
  isFirst: boolean;
  isLast: boolean;
  selected: boolean;
  /** Set when the day map is shown: a click on the row shows it there. */
  onSelect?: (key: string) => void;
  onFix: (track: TrackSummary) => void;
}) {
  const key = selectionKey(item);
  const pick: Pick = {
    selected,
    id: `tl-${key}`,
    onClick: onSelect
      ? (e) => {
          // Links and buttons in the row keep doing their own thing.
          if ((e.target as Element).closest("a, button, input")) return;
          onSelect(key);
        }
      : undefined,
  };
  return item.kind === "visit" ? (
    <VisitRow visit={item.visit} num={num} isFirst={isFirst} isLast={isLast} pick={pick} photos={photos} />
  ) : (
    <MoveRow track={item.track} pick={pick} onFix={onFix} photos={photos} />
  );
}

function Rail({
  children,
  topLine = true,
  bottomLine = true,
}: {
  children: React.ReactNode;
  topLine?: boolean;
  bottomLine?: boolean;
}) {
  return (
    <div className="relative flex w-10 shrink-0 flex-col items-center">
      <span
        className={`w-0.5 flex-1 ${topLine ? "bg-strong" : "bg-transparent"}`}
        style={{ minHeight: 10 }}
      />
      {children}
      <span
        className={`w-0.5 flex-1 ${bottomLine ? "bg-strong" : "bg-transparent"}`}
      />
    </div>
  );
}

function VisitRow({
  visit,
  num,
  isFirst,
  isLast,
  pick,
  photos,
}: {
  visit: Visit;
  num?: number;
  isFirst: boolean;
  isLast: boolean;
  pick: Pick;
  photos: React.ReactNode;
}) {
  const name = placeTitle(visit.placeName, visit.category);
  const unknown = !visit.placeName;
  const kind = visit.placeKind ? KIND_META[visit.placeKind] : null;
  // "Visited X?": the name is a guess among several.
  const asking = !!visit.candidates?.length;

  return (
    <li
      id={pick.id}
      onClick={pick.onClick}
      className={`flex gap-3 sm:gap-4 ${ROW_SCROLL_MARGIN} ${pick.onClick ? "cursor-pointer" : ""}`}
    >
      <Rail topLine={!isFirst} bottomLine={!isLast}>
        <span
          className={cx(
            "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border bg-surface transition-colors",
            pick.selected ? "border-primary text-primary" : "border-strong text-secondary",
          )}
          title={placeIconLabel(visit.placeKind, visit.category, visit.osmKey)}
        >
          {num != null && (
            <span
              className={`absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-caption font-semibold leading-none tabular-nums ${
                pick.selected ? "bg-primary text-on-primary" : "border border-strong bg-surface text-secondary"
              }`}
              aria-label={`Stop ${num}`}
            >
              {num}
            </span>
          )}
          <PlaceGlyph kind={visit.placeKind} category={visit.category} osmKey={visit.osmKey} size={16} />
        </span>
      </Rail>

      <div
        className={cx(
          "my-1.5 min-w-0 flex-1 rounded-card border bg-surface px-4 py-3 shadow-card transition-colors",
          pick.selected ? "border-primary ring-1 ring-primary/40" : "border-border",
          pick.onClick && !pick.selected && "hover:border-strong",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className={`min-w-0 break-words text-label ${unknown ? "text-muted" : "text-text"}`}>
            <Link href={`/places/${visit.placeId}`} className="hover:text-primary hover:underline">
              {name}
            </Link>
            {asking && (
              <span className="ml-0.5 text-primary" title="Not sure this is the right place">
                ?
              </span>
            )}
          </h3>
          <span className="shrink-0 pt-px text-meta font-medium tabular-nums text-secondary">
            {formatDuration(visit.duration)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta tabular-nums text-muted">
          {kind && kind.label !== name && <Badge tone="primary">{kind.label}</Badge>}
          <span>
            {formatTime(visit.startedAt)}
            {visit.endedAt ? ` – ${formatTime(visit.endedAt)}` : ""}
          </span>
        </div>
        {asking && <PlaceQuestion visit={visit} shownName={name} />}
        {photos}
      </div>
    </li>
  );
}

/** A gap between two rides shorter than this is just getting off and on. */
const MIN_CHANGE_S = 3 * 60;

/** A transfer the server folded into the trip (lib/processing/detect.ts). */
type Wait = { startedAt: string; endedAt: string; stop: string | null };
type SubRow = { kind: "leg"; leg: TransitLeg } | { kind: "wait"; stop: string | null; secs: number };

const ms = (iso: string) => new Date(iso).getTime();

/**
 * The rides of a trip and the transfers between them, in order: "Waited at
 * Kamppi" where the server saw a wait at a stop, else "Change" when the next
 * ride starts a while after the last one ended.
 */
function subRows(track: TrackSummary & { waits?: Wait[] }): SubRow[] {
  const legs = track.legs ?? [];
  const waits = [...(track.waits ?? [])].sort((a, b) => ms(a.startedAt) - ms(b.startedAt));
  const rows: { at: number; row: SubRow }[] = waits.map((w) => ({
    at: ms(w.startedAt),
    row: { kind: "wait", stop: w.stop, secs: (ms(w.endedAt) - ms(w.startedAt)) / 1000 },
  }));
  legs.forEach((l, i) => {
    rows.push({ at: ms(l.startedAt), row: { kind: "leg", leg: l } });
    if (i === 0) return;
    const from = ms(legs[i - 1].endedAt);
    const to = ms(l.startedAt);
    const waited = waits.some((w) => ms(w.endedAt) > from && ms(w.startedAt) < to);
    if (!waited && (to - from) / 1000 >= MIN_CHANGE_S) {
      rows.push({ at: from, row: { kind: "wait", stop: null, secs: (to - from) / 1000 } });
    }
  });
  // A wait sorts before a ride starting at the same moment.
  return rows.sort((a, b) => a.at - b.at || (a.row.kind === "wait" ? -1 : 1)).map((r) => r.row);
}

function LegLine({ leg: l }: { leg: TransitLeg }) {
  const c = badgeColors(l.kind);
  const stops = [l.fromStop, l.toStop].filter(Boolean) as string[];
  return (
    <div className="flex flex-wrap items-center gap-2 pl-9 text-meta">
      <span
        className="rounded-[5px] px-1.5 py-px text-caption font-semibold"
        style={{ backgroundColor: c.bg, color: c.fg }}
        title={l.lines.length > 1 ? `One of ${l.lines.join(", ")} (they share this stretch)` : undefined}
      >
        {legBadgeText(l.kind, l.lines)}
      </span>
      {stops.length > 0 && (
        <span className="flex min-w-0 flex-wrap items-center gap-1 text-muted">
          {stops.map((st, i) => (
            <Fragment key={i}>
              {i > 0 && <ArrowRight size={16} strokeWidth={1.75} aria-label="to" />}
              <span>{st}</span>
            </Fragment>
          ))}
        </span>
      )}
    </div>
  );
}

function MoveRow({
  track,
  pick,
  onFix,
  photos,
}: {
  track: TrackSummary;
  pick: Pick;
  onFix: (track: TrackSummary) => void;
  photos: React.ReactNode;
}) {
  const meta = MODE_META[track.mode];
  const parts = [
    formatDistance(track.distance),
    formatDuration(track.duration),
  ].filter((p) => p && p !== "—");

  return (
    <li
      id={pick.id}
      onClick={pick.onClick}
      className={`flex gap-3 sm:gap-4 ${ROW_SCROLL_MARGIN} ${pick.onClick ? "cursor-pointer" : ""}`}
    >
      <div className="relative flex w-10 shrink-0 flex-col items-center">
        <span
          className={pick.selected ? "w-1 flex-1 rounded-full" : "w-0.5 flex-1"}
          style={{
            backgroundImage: `linear-gradient(${meta.color} 60%, transparent 0%)`,
            backgroundSize: pick.selected ? "4px 10px" : "2px 10px",
            backgroundRepeat: "repeat-y",
          }}
        />
      </div>

      <div
        className={cx(
          "-ml-2 flex min-w-0 flex-1 flex-col gap-1.5 rounded-control px-2 py-2 transition-colors",
          pick.selected ? "bg-surface-2" : pick.onClick && "hover:bg-surface-2/50",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2"
            style={{ color: meta.color }}
            aria-hidden
          >
            <ModeGlyph mode={track.mode} size={16} strokeWidth={1.75} />
          </span>
          <span className="text-label text-text">{meta.label}</span>
          {parts.length > 0 && (
            <span className="whitespace-nowrap text-meta tabular-nums text-muted">{parts.join(" · ")}</span>
          )}
          {track.correctionId != null && (
            <Badge title={track.added ? "You added this trip; nothing was recorded" : "You fixed this trip"}>
              {track.added ? "Added by you" : "Edited"}
            </Badge>
          )}
          {track.mode !== "stationary" && (
            <Button
              size="sm"
              variant="ghost"
              icon={Pencil}
              onClick={() => onFix(track)}
              className="ml-auto h-7 px-2 text-muted"
            >
              {track.added ? "Edit" : track.correctionId != null ? "Edit fix" : "Fix trip"}
            </Button>
          )}
        </div>
        {subRows(track).map((r, i) =>
          r.kind === "wait" ? (
            <div key={i} className="pl-9 text-caption text-muted">
              {r.stop ? `Waited at ${r.stop}` : "Change"} · {formatDuration(r.secs)}
            </div>
          ) : (
            <LegLine key={i} leg={r.leg} />
          ),
        )}
        {photos && <div className="pl-9">{photos}</div>}
      </div>
    </li>
  );
}

function GapRow({ from, to }: { from: string; to: string }) {
  const secs = (new Date(to).getTime() - new Date(from).getTime()) / 1000;
  return (
    <li className="flex gap-3 sm:gap-4">
      <div className="relative flex w-10 shrink-0 flex-col items-center">
        <span
          className="w-0.5 flex-1"
          style={{
            backgroundImage: "linear-gradient(currentColor 30%, transparent 0%)",
            backgroundSize: "2px 6px",
            backgroundRepeat: "repeat-y",
            opacity: 0.35,
          }}
        />
      </div>
      <p className="flex flex-1 items-center gap-1.5 py-2.5 text-meta text-muted">
        <MapPinOff size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
        <span>
          No location recorded · {formatDuration(secs)}{" "}
          <span className="tabular-nums">
            ({formatTime(from)} – {formatTime(to)})
          </span>
        </span>
      </p>
    </li>
  );
}

/* ---------------- States ---------------- */

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-4">
          <div className="flex w-10 justify-center">
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
          <Skeleton className="h-[74px] flex-1 rounded-card" />
        </div>
      ))}
    </div>
  );
}
