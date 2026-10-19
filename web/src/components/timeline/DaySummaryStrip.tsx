"use client";

import { useState } from "react";
import useSWR from "swr";
import { formatDuration, formatKm } from "@/lib/format";
import { MODE_META } from "@/lib/modes";
import { stripModes, type DaySummary, type StripMode } from "./daySummary";

const fetcher = (url: string): Promise<DaySummary> =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    return r.json();
  });

/**
 * "19.1 km · 25 min · 🚗 Drive …": distance and time per travel mode on the
 * day, under the date header. Text stays in text colours; only the mode icon
 * carries the mode colour.
 *
 * `travelled` is the timeline's own hint that the day has trips, so the strip's
 * height is held while its numbers load and nothing below it jumps.
 */
export function DaySummaryStrip({ date, travelled }: { date: string; travelled: boolean }) {
  const { data, error } = useSWR<DaySummary>(date ? `/api/day-summary?date=${date}` : null, fetcher, {
    revalidateOnFocus: false,
  });
  // A fresh "+N" state per day.
  return <Strip key={date} summary={data} failed={!!error} travelled={travelled} />;
}

function Strip({
  summary,
  failed,
  travelled,
}: {
  summary: DaySummary | undefined;
  failed: boolean;
  travelled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { visible, hidden } = stripModes(summary);

  if (failed || (summary ? visible.length === 0 : !travelled)) return null;

  const shown = open ? [...visible, ...hidden] : visible;
  const total = summary
    ? [formatKm(summary.distance), formatDuration(summary.duration)].filter((p) => p !== "—")
    : [];

  return (
    <section aria-label="Day summary" aria-busy={!summary} className="mt-4 h-[60px]">
      {summary ? (
        <>
          <p className="truncate text-sm text-muted">
            <span className="font-medium text-text tabular-nums">{total[0]}</span>
            {total[1] && <span className="tabular-nums"> · {total[1]}</span>} on the move
          </p>
          <ul
            className="-mx-5 mt-2 flex gap-2 overflow-x-auto px-5 md:mx-0 md:px-0"
            style={{ scrollbarWidth: "none" }}
          >
            {shown.map((m) => (
              <ModeChip key={m.mode} m={m} />
            ))}
            {hidden.length > 0 && !open && (
              <li className="shrink-0">
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  aria-label={`Show ${hidden.length} more modes`}
                  title={hidden.map((m) => MODE_META[m.mode].label).join(", ")}
                  className="mk-card h-8 px-3 text-sm font-medium text-muted transition-colors hover:text-text"
                  style={{ borderRadius: 999 }}
                >
                  +{hidden.length}
                </button>
              </li>
            )}
          </ul>
        </>
      ) : (
        <div aria-hidden>
          <div className="h-5 w-48 animate-pulse rounded bg-surface-2" />
          <div className="mt-2 flex gap-2">
            {[112, 96, 88].map((w) => (
              <div key={w} className="h-8 animate-pulse rounded-full bg-surface-2" style={{ width: w }} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ModeChip({ m }: { m: StripMode }) {
  const meta = MODE_META[m.mode];
  const dist = m.distance > 0 ? formatKm(m.distance) : null;
  const time = m.duration > 0 ? formatDuration(m.duration) : null;
  return (
    <li
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface pl-1 pr-3 text-sm"
      title={[meta.label, dist, time].filter(Boolean).join(" · ")}
    >
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full text-xs leading-none"
        style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 22%, transparent)` }}
        aria-hidden
      >
        {meta.icon}
      </span>
      <span className="sr-only">{meta.label}: </span>
      {dist && <span className="font-medium text-text tabular-nums">{dist}</span>}
      {time && <span className="text-muted tabular-nums">{time}</span>}
    </li>
  );
}
