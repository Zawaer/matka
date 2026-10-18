"use client";

import Link from "next/link";
import { useState } from "react";
import { categoryLabel } from "@/components/places/category";
import useSWR from "swr";
import { MODE_META } from "@/lib/modes";
import {
  formatDuration,
  formatDistance,
  formatTime,
  formatDateLong,
} from "@/lib/format";
import type { TimelineDay, TimelineItem, Visit, TrackSummary } from "@/lib/types";

type TimelineResponse = {
  day: TimelineDay;
  dates: string[];
  minDate: string | null;
  maxDate: string | null;
};

const fetcher = (url: string): Promise<TimelineResponse> =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    return r.json();
  });

export function Timeline() {
  // `null` lets the API pick the latest day that has data.
  const [date, setDate] = useState<string | null>(null);

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

  return (
    <div>
      <DayHeader
        date={current}
        minDate={data?.minDate ?? undefined}
        maxDate={data?.maxDate ?? undefined}
        prevDate={prevDate}
        nextDate={nextDate}
        onPick={setDate}
      />

      <div className="mt-6">
        {error ? (
          <Notice
            title="Couldn't load this day"
            body="Something went wrong talking to the server. Try again."
          />
        ) : isLoading && !data ? (
          <TimelineSkeleton />
        ) : items.length === 0 ? (
          <Notice
            title="Nothing here"
            body={
              current
                ? "No visits or trips recorded on this day."
                : "No location history yet."
            }
          />
        ) : (
          <ol className="relative">
            {items.map((item, i) => (
              <TimelineRow
                key={rowKey(item, i)}
                item={item}
                isFirst={i === 0}
                isLast={i === items.length - 1}
              />
            ))}
          </ol>
        )}
      </div>
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
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">
          {date ? formatDateLong(date) : "Timeline"}
        </h1>
        {date && (
          <p className="mt-0.5 text-sm text-muted">
            {new Date(date).toLocaleDateString([], { year: "numeric" })}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <NavButton
          label="Previous day"
          disabled={!prevDate}
          onClick={() => prevDate && onPick(prevDate)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z" />
          </svg>
        </NavButton>

        <label className="relative">
          <span className="sr-only">Pick a date</span>
          <input
            type="date"
            value={date}
            min={minDate}
            max={maxDate}
            onChange={(e) => e.target.value && onPick(e.target.value)}
            className="mk-card h-9 cursor-pointer px-3 text-sm text-text [color-scheme:light_dark]"
          />
        </label>

        <NavButton
          label="Next day"
          disabled={!nextDate}
          onClick={() => nextDate && onPick(nextDate)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4L13.2 12z" />
          </svg>
        </NavButton>
      </div>
    </header>
  );
}

function NavButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="mk-card flex h-9 w-9 items-center justify-center text-muted transition-colors hover:text-text enabled:hover:border-primary/60 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/* ---------------- Rows ---------------- */

function TimelineRow({
  item,
  isFirst,
  isLast,
}: {
  item: TimelineItem;
  isFirst: boolean;
  isLast: boolean;
}) {
  return item.kind === "visit" ? (
    <VisitRow visit={item.visit} isFirst={isFirst} isLast={isLast} />
  ) : (
    <MoveRow track={item.track} />
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
        className={`w-px flex-1 ${topLine ? "bg-border" : "bg-transparent"}`}
        style={{ minHeight: 10 }}
      />
      {children}
      <span
        className={`w-px flex-1 ${bottomLine ? "bg-border" : "bg-transparent"}`}
      />
    </div>
  );
}

function VisitRow({
  visit,
  isFirst,
  isLast,
}: {
  visit: Visit;
  isFirst: boolean;
  isLast: boolean;
}) {
  const name = visit.placeName ?? categoryLabel(visit.category);
  const unknown = !visit.placeName;

  return (
    <li className="flex gap-3 sm:gap-4">
      <Rail topLine={!isFirst} bottomLine={!isLast}>
        <span className="z-10 flex h-8 w-8 items-center justify-center rounded-full border border-primary/40 bg-surface text-primary shadow-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2C7.6 2 4 5.6 4 10c0 5.5 8 12 8 12s8-6.5 8-12c0-4.4-3.6-8-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" />
          </svg>
        </span>
      </Rail>

      <div className="mk-card my-1.5 flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3
            className={`min-w-0 break-words font-medium ${
              unknown ? "text-muted" : "text-text"
            }`}
          >
            <Link href={`/places/${visit.placeId}`} className="hover:text-primary">
              {name}
            </Link>
          </h3>
          <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted">
            {formatDuration(visit.duration)}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">
          {formatTime(visit.startedAt)}
          {visit.endedAt ? ` – ${formatTime(visit.endedAt)}` : ""}
        </p>
      </div>
    </li>
  );
}

function MoveRow({ track }: { track: TrackSummary }) {
  const meta = MODE_META[track.mode];
  const parts = [
    formatDistance(track.distance),
    formatDuration(track.duration),
  ].filter((p) => p && p !== "—");

  return (
    <li className="flex gap-3 sm:gap-4">
      <div className="relative flex w-10 shrink-0 flex-col items-center">
        <span
          className="w-0.5 flex-1"
          style={{
            backgroundImage: `linear-gradient(${meta.color} 60%, transparent 0%)`,
            backgroundSize: "2px 10px",
            backgroundRepeat: "repeat-y",
          }}
        />
      </div>

      <div className="flex flex-1 items-center gap-2 py-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
          style={{ backgroundColor: `${meta.color}22` }}
          aria-hidden
        >
          {meta.icon}
        </span>
        <span className="text-sm font-medium" style={{ color: meta.color }}>
          {meta.label}
        </span>
        {parts.length > 0 && (
          <span className="text-sm text-muted">· {parts.join(" · ")}</span>
        )}
      </div>
    </li>
  );
}

/* ---------------- States ---------------- */

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mk-card flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3Zm-1 4v6l5 3 .9-1.6-4.9-2.9V7h-1Z" />
        </svg>
      </div>
      <h2 className="font-medium text-text">{title}</h2>
      <p className="max-w-xs text-sm text-muted">{body}</p>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-4">
          <div className="flex w-10 justify-center">
            <span className="h-8 w-8 animate-pulse rounded-full bg-surface-2" />
          </div>
          <div className="mk-card h-20 flex-1 animate-pulse bg-surface-2/40" />
        </div>
      ))}
    </div>
  );
}
