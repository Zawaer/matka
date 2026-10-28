"use client";

import { useState } from "react";
import useSWR from "swr";
import { formatDuration, formatKm } from "@/lib/format";
import { MODE_META } from "@/lib/modes";
import { ModeGlyph, Skeleton } from "@/components/ui";
import { stripModes, type DaySummary, type StripMode } from "./daySummary";

const fetcher = (url: string): Promise<DaySummary> =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Request failed: ${r.status}`);
    return r.json();
  });

/**
 * "19.1 km · 25 min · [car] 18 km …": distance and time per travel mode on the
 * day, under the date header. Text stays in text colours; only the mode icon
 * (a data mark) carries the mode colour.
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
            <span className="font-semibold text-text tabular-nums">{total[0]}</span>
            {total[1] && <span className="tabular-nums"> · {total[1]}</span>} on the move
          </p>
          <ul
            className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0"
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
                  className="h-8 rounded-full border border-border bg-surface px-3 text-meta font-medium text-muted transition-colors hover:border-strong hover:text-text"
                >
                  +{hidden.length}
                </button>
              </li>
            )}
          </ul>
        </>
      ) : (
        <div aria-hidden>
          <Skeleton className="h-5 w-48" />
          <div className="mt-2 flex gap-1.5">
            {["w-28", "w-24", "w-20"].map((w) => (
              <Skeleton key={w} className={`h-8 rounded-full ${w}`} />
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
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface pl-2.5 pr-3 text-meta shadow-card"
      title={[meta.label, dist, time].filter(Boolean).join(" · ")}
    >
      <span className="flex items-center" style={{ color: meta.color }} aria-hidden>
        <ModeGlyph mode={m.mode} size={16} strokeWidth={1.75} />
      </span>
      <span className="sr-only">{meta.label}: </span>
      {dist && <span className="font-medium text-text tabular-nums">{dist}</span>}
      {time && <span className="text-muted tabular-nums">{time}</span>}
    </li>
  );
}
