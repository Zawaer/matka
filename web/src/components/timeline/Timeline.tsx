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
import { ArrowRight, CalendarX2, ChevronLeft, ChevronRight, Ellipsis, Import, MapPinOff, Pencil, RotateCw, Smartphone } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  DatePicker,
  EmptyState,
  IconButton,
  KIND_ICONS,
  ModeGlyph,
  PlaceGlyph,
  Skeleton,
  cx,
  placeIconLabel,
} from "@/components/ui";
import { MissingTravelRow, PhotoStrip, PhotoViewer, PlaceQuestion, questionGuess, useDayPhotos, type PhotoSet } from "./TimelineExtras";
import { dayHasMap, selectionKey } from "./dayMap";
import type { DayMapSelection } from "./DayMap";
import { badgeColors, legBadgeText } from "@/lib/transit/colors";
import { TripEditor } from "./TripEditor";
import { subRows } from "./legs";
import { formatDate, formatDay, formatDistance, formatDuration, formatTime, localDate } from "@/lib/format";
import type { TimelineDay, TimelineItem, Visit, TrackSummary, TransitLeg } from "@/lib/types";

type TimelineResponse = {
  day: TimelineDay;
  dates: string[];
  minDate: string | null;
  maxDate: string | null;
};

// The split view (list left, map right) is `split:`, written out in
// full in each class so Tailwind sees it; below 1200 px the map sits above the list.

// MapLibre is big: load the day map only once a day with something to draw shows up.
const DayMap = dynamic(() => import("./DayMap"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

/** Rows scrolled to from the map stop below the sticky map (phone) and above the tab bar. */
const ROW_SCROLL_MARGIN = "scroll-mt-[340px] scroll-mb-20 md:scroll-mt-[380px] md:scroll-mb-4 split:scroll-mt-6";

const fetcher = (url: string): Promise<TimelineResponse> =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    return r.json();
  });

/** The closest day with data to `date` (earlier wins a tie). */
function nearestDate(dates: string[], date: string): string | null {
  const t = new Date(`${date}T12:00:00Z`).getTime();
  let best: string | null = null;
  let bestD = Infinity;
  for (const d of dates) {
    const dd = Math.abs(new Date(`${d}T12:00:00Z`).getTime() - t);
    if (dd < bestD) {
      best = d;
      bestD = dd;
    }
  }
  return best;
}

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

  const { data, error, isLoading, mutate } = useSWR<TimelineResponse>(
    date ? `/api/timeline?date=${date}` : "/api/timeline",
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true, shouldRetryOnError: false },
  );

  const dates = data?.dates ?? [];
  const current = date ?? data?.day.date ?? "";
  const items = error ? [] : (data?.day.items ?? []);
  const noHistory = !!data && !error && dates.length === 0;

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
  const loadingFirst = isLoading && !data;

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
  const photos = useDayPhotos(data?.day.date ?? null, !!data && !isLoading && !error);
  const photosByKey = new Map<string, PhotoSet>(
    data && photos ? photos.items.map((p) => [p.key, { ids: p.ids, total: p.total }]) : [],
  );
  const [viewing, setViewing] = useState<(PhotoSet & { start: number; caption: string }) | null>(null);
  const nearest = !showMap && current && dates.length ? nearestDate(dates, current) : null;

  const mapSlot = (
    <div
      className={cx(
        // Phone and tablet: sticky under the top bar, above the list.
        "sticky top-[52px] z-20 -mx-4 mt-2 bg-bg px-4 pb-1 pt-3 sm:-mx-6 sm:px-6 md:top-0 md:-mx-10 md:px-10 md:pt-4",
        // Split view: the right column, full height, sticky.
        `split:col-start-2 split:row-span-2 split:row-start-1 split:m-0 split:h-dvh split:self-start split:border-l split:border-border split:p-0`,
        !showMap && !loadingFirst && `hidden split:block`,
      )}
    >
      {mapMounted && data ? (
        <div className={cx("h-full", !showMap && "hidden")}>
          <DayMap day={data.day} selected={selected} onSelect={selectFromMap} photos={photos?.points} split />
        </div>
      ) : null}
      {loadingFirst && <MapSkeleton />}
      {!loadingFirst && !showMap && (
        <div className={`hidden h-full items-center justify-center bg-surface-2/50 text-meta text-muted split:flex`}>
          {error ? "" : noHistory ? "Your days will be mapped here." : "No route on this day."}
        </div>
      )}
    </div>
  );

  return (
    <div className={`split:grid split:min-h-dvh split:grid-cols-[480px_minmax(0,1fr)] split:grid-rows-[auto_1fr]`}>
      <div className={`split:col-start-1 split:row-start-1 split:px-10 split:pt-10`}>
        <DayHeader
          date={noHistory ? "" : current}
          dates={dates}
          prevDate={prevDate}
          nextDate={nextDate}
          onPick={pick}
        />

        {current && !error && !noHistory && (
          <DaySummaryStrip
            date={current}
            loading={loadingFirst}
            travelled={items.some((it) => it.kind === "move" && it.track.mode !== "stationary")}
          />
        )}
      </div>

      {mapSlot}

      <div className={cx(`split:col-start-1 split:row-start-2 split:px-10 split:pb-14`, showMap || loadingFirst ? "mt-4" : "mt-6")}>
        {error ? (
          <Callout
            tone="danger"
            role="alert"
            title={`Couldn't load ${current ? formatDay(current) : "this day"}`}
            action={
              <Button size="sm" icon={RotateCw} onClick={() => void mutate()}>
                Retry
              </Button>
            }
          >
            The server didn&apos;t answer. Check your connection and try again.
          </Callout>
        ) : loadingFirst ? (
          <TimelineSkeleton />
        ) : noHistory ? (
          <EmptyState
            icon={Smartphone}
            title="No location history yet"
            description="Pair your phone and Matka starts recording, or bring in your past years from Google."
            action={
              <ButtonLink href="/devices" variant="primary" icon={Smartphone}>
                Pair your phone
              </ButtonLink>
            }
            secondary={
              <ButtonLink href="/settings#import" icon={Import}>
                Import from Google Timeline
              </ButtonLink>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={CalendarX2}
            title="Nothing recorded on this day"
            description="No visits or trips were recorded."
            action={
              nearest && nearest !== current ? (
                <Button variant="primary" onClick={() => pick(nearest)}>
                  Go to the nearest day ({formatDate(nearest)})
                </Button>
              ) : undefined
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
              const caption =
                item.kind === "visit"
                  ? `${formatTime(item.visit.startedAt)} · ${placeTitle(item.visit.placeName, item.visit.category)}`
                  : `${formatTime(item.track.startedAt)} · ${MODE_META[item.track.mode].label}`;
              return (
                <Fragment key={rowKey(item, i)}>
                  {gap && <GapRow from={gap.from} to={gap.to} />}
                  {missing && <MissingTravelRow gap={missing} onAdd={() => addTravel(missing)} />}
                  <TimelineRow
                    item={item}
                    day={data!.day.date}
                    num={item.kind === "visit" && showMap ? ++visitNo : undefined}
                    isFirst={i === 0}
                    isLast={i === items.length - 1}
                    selected={selected?.key === selectionKey(item)}
                    onSelect={showMap ? selectFromList : undefined}
                    onFix={setEditing}
                    photos={set ? <PhotoStrip set={set} onOpen={(start) => setViewing({ ...set, start, caption })} /> : null}
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
          caption={viewing.caption}
          linkBase={photos?.linkBase ?? null}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

function rowKey(item: TimelineItem, i: number) {
  return item.kind === "visit" ? `v-${item.visit.id}` : `m-${item.track.id}-${i}`;
}

/* ---------------- Day header ---------------- */

function DayHeader({
  date,
  dates,
  prevDate,
  nextDate,
  onPick,
}: {
  date: string;
  dates: string[];
  prevDate: string | null;
  nextDate: string | null;
  onPick: (d: string) => void;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between split:flex-col split:items-start">
      <h1 className="min-w-0 text-title text-text">
        {date ? (
          <>
            {formatDay(date)} <span className="font-normal text-muted">{date.slice(0, 4)}</span>
          </>
        ) : (
          "Timeline"
        )}
      </h1>

      {date && dates.length > 0 && (
        <div className="flex items-center gap-1.5">
          <IconButton
            icon={ChevronLeft}
            label="Previous day"
            variant="secondary"
            disabled={!prevDate}
            onClick={() => prevDate && onPick(prevDate)}
          />
          <DatePicker value={date} available={dates} onChange={onPick} label="Pick a day" />
          <IconButton
            icon={ChevronRight}
            label="Next day"
            variant="secondary"
            disabled={!nextDate}
            onClick={() => nextDate && onPick(nextDate)}
          />
        </div>
      )}
    </header>
  );
}

/* ---------------- Rows ---------------- */

type Pick = { selected: boolean; onClick?: (e: MouseEvent) => void; id: string };

function TimelineRow({
  item,
  day,
  num,
  isFirst,
  isLast,
  selected,
  onSelect,
  onFix,
  photos,
}: {
  item: TimelineItem;
  /** The day shown (YYYY-MM-DD): a visit that began before it or ends after it says so. */
  day: string;
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
    <VisitRow visit={item.visit} day={day} num={num} isFirst={isFirst} isLast={isLast} pick={pick} photos={photos} />
  ) : (
    <MoveRow track={item.track} pick={pick} onFix={onFix} photos={photos} />
  );
}

/** "16:58 – 18:20", or "Since 16:58 yesterday" / "until 09:45 tomorrow" across midnight. */
function visitTimes(v: Visit, day: string): string {
  const startDay = localDate(v.startedAt);
  const endDay = v.endedAt ? localDate(v.endedAt) : day;
  const start = formatTime(v.startedAt);
  const end = v.endedAt ? formatTime(v.endedAt) : null;
  const earlier = startDay < day;
  const later = endDay > day;
  if (earlier && later) return `${start} yesterday – ${end} tomorrow`;
  if (earlier) return `Since ${start} yesterday${end ? `, until ${end}` : ""}`;
  if (later) return `${start} – until ${end} tomorrow`;
  return end ? `${start} – ${end}` : start;
}

function VisitRow({
  visit,
  day,
  num,
  isFirst,
  isLast,
  pick,
  photos,
}: {
  visit: Visit;
  day: string;
  num?: number;
  isFirst: boolean;
  isLast: boolean;
  pick: Pick;
  photos: React.ReactNode;
}) {
  const known = placeTitle(visit.placeName, visit.category);
  const unknown = !visit.placeName;
  const kind = visit.placeKind ? KIND_META[visit.placeKind] : null;
  // "Café Maiasmokk?": the name is a guess among several.
  const asking = !!visit.candidates?.length;
  const guess = asking ? questionGuess(visit) : null;
  const name = guess?.name ?? known;

  return (
    <li id={pick.id} onClick={pick.onClick} className={cx("flex items-stretch gap-2 sm:gap-3", ROW_SCROLL_MARGIN, pick.onClick && "cursor-pointer")}>
      {/* The rail: the glyph's centre sits on the title's line (12 px padding + half a 20 px line). */}
      <div className="relative flex w-10 shrink-0 flex-col items-center">
        <span className={cx("h-1.5 w-0.5", isFirst ? "bg-transparent" : "bg-strong")} />
        <span
          className={cx(
            "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-surface transition-colors",
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
        <span className={cx("w-0.5 flex-1", isLast ? "bg-transparent" : "bg-strong")} />
      </div>

      <div
        className={cx(
          "mb-1 min-w-0 flex-1 rounded-card border px-3 py-3 transition-colors",
          pick.selected
            ? "border-primary/60 bg-surface shadow-card"
            : cx("border-transparent", pick.onClick && "hover:bg-surface-2/70"),
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className={cx("min-w-0 break-words text-label", unknown && !guess ? "text-muted" : "text-text")}>
            <Link href={`/places/${visit.placeId}`} className="hover:text-primary hover:underline">
              {name}
            </Link>
            {asking && (
              <span className="ml-0.5 font-normal text-muted" title="Not sure this is the right place">
                ?
              </span>
            )}
          </h3>
          <span className="shrink-0 text-meta font-medium tabular-nums text-secondary">{formatDuration(visit.duration)}</span>
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted">
          {kind && kind.label !== name && (
            <Badge icon={visit.placeKind ? KIND_ICONS[visit.placeKind] : undefined}>{kind.label}</Badge>
          )}
          <span className="tabular-nums">{visitTimes(visit, day)}</span>
          {guess && guess.others.length > 0 && <span className="min-w-0">Or: {guess.others.join(" · ")}</span>}
        </p>
        {asking && <PlaceQuestion visit={visit} shownName={name} />}
        {photos}
      </div>
    </li>
  );
}

function LegLine({ leg: l }: { leg: TransitLeg }) {
  const c = badgeColors(l.kind);
  const stops = [l.fromStop, l.toStop].filter(Boolean) as string[];
  return (
    <div className="flex min-w-0 items-center gap-2 text-meta">
      <span
        className="shrink-0 rounded px-1.5 text-caption font-medium"
        style={{ backgroundColor: c.bg, color: c.fg }}
        title={l.lines.length > 1 ? `One of ${l.lines.join(", ")} (they share this stretch)` : undefined}
      >
        {legBadgeText(l.kind, l.lines)}
      </span>
      {stops.length > 0 && (
        <span className="flex min-w-0 items-center gap-1 truncate text-muted">
          {stops.map((st, i) => (
            <Fragment key={i}>
              {i > 0 && <ArrowRight size={16} strokeWidth={1.75} aria-label="to" className="shrink-0" />}
              <span className="truncate">{st}</span>
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
  const parts = [formatDistance(track.distance), formatDuration(track.duration)].filter((p) => p && p !== "—");
  const fixLabel = track.added ? "Edit added trip" : track.correctionId != null ? "Edit fix" : "Fix trip";
  const canFix = track.mode !== "stationary";
  const rows = subRows(track);

  return (
    <li id={pick.id} onClick={pick.onClick} className={cx("group flex gap-2 sm:gap-3", ROW_SCROLL_MARGIN, pick.onClick && "cursor-pointer")}>
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
          "mb-1 flex min-w-0 flex-1 flex-col gap-1.5 rounded-card px-3 py-2 transition-colors",
          pick.selected ? "bg-surface-2" : pick.onClick && "hover:bg-surface-2/70",
        )}
      >
        <div className="flex min-h-7 items-center gap-2">
          <span className="flex shrink-0" style={{ color: meta.color }} aria-hidden>
            <ModeGlyph mode={track.mode} size={20} />
          </span>
          <p className="min-w-0 flex-1 truncate text-meta text-secondary">
            <span className="sr-only">Travel: </span>
            {[meta.label, ...parts].join(" · ")}
          </p>
          {track.correctionId != null && (
            <Badge title={track.added ? "You added this trip; nothing was recorded" : "You fixed this trip"}>
              {track.added ? "Added" : "Edited"}
            </Badge>
          )}
          {canFix && (
            <>
              {/* Desktop: shown on hover, focus or selection. */}
              <Button
                size="sm"
                variant="ghost"
                icon={Pencil}
                onClick={() => onFix(track)}
                className={cx(
                  "-my-1 h-7 px-2 text-muted max-md:hidden",
                  !pick.selected && "md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100",
                )}
              >
                {track.added ? "Edit" : track.correctionId != null ? "Edit fix" : "Fix trip"}
              </Button>
              {/* Phone: one quiet overflow button. */}
              <IconButton
                icon={Ellipsis}
                label={fixLabel}
                size="sm"
                onClick={() => onFix(track)}
                className="-my-1 -mr-1.5 h-7 md:hidden"
              />
            </>
          )}
        </div>
        {rows.length > 0 && (
          <div className="flex flex-col gap-1 pl-7">
            {rows.map((r, i) =>
              r.kind === "wait" ? (
                <p key={i} className="text-caption text-muted">
                  {r.stop ? `Waited at ${r.stop}` : "Change"} · {formatDuration(r.secs)}
                </p>
              ) : (
                <LegLine key={i} leg={r.leg} />
              ),
            )}
          </div>
        )}
        {photos && <div className="pl-7">{photos}</div>}
      </div>
    </li>
  );
}

function GapRow({ from, to }: { from: string; to: string }) {
  const secs = (new Date(to).getTime() - new Date(from).getTime()) / 1000;
  return (
    <li className="flex gap-2 sm:gap-3">
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
      <p className="flex flex-1 items-center gap-1.5 px-3 py-2.5 text-meta text-muted">
        <MapPinOff size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
        <span>
          No location recorded · <span className="tabular-nums">{formatDuration(secs)}</span>{" "}
          <span className="tabular-nums">
            ({formatTime(from)} – {formatTime(to)})
          </span>
        </span>
      </p>
    </li>
  );
}

/* ---------------- States ---------------- */

function MapSkeleton() {
  return <Skeleton className="h-[260px] rounded-card md:h-[340px] split:h-full split:rounded-none" />;
}

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="flex w-10 justify-center pt-1.5">
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
          <div className="flex-1 px-3 py-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="mt-2 h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
