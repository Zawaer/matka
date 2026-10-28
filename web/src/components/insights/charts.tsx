// Small server-rendered charts for the Insights pages. Marks wear the mode's
// colour; every number and label stays in text tokens. Tooltips are CSS
// (hover or keyboard focus), so no client JS is needed.

import Link from "next/link";
import { formatDuration, formatKm, formatMonth } from "@/lib/format";
import { MODE_META, type ModeKey } from "@/lib/modes";
import { IconTile, Stat as UiStat, modeIcon } from "@/components/ui";

export function modeMeta(mode: string) {
  return MODE_META[mode as ModeKey] ?? MODE_META.unknown;
}

/** The mode's Lucide glyph, tinted with the mode colour, on a quiet tile. */
export function ModeIcon({ mode, size = "md" }: { mode: string; size?: "sm" | "md" }) {
  return <IconTile icon={modeIcon(mode)} size={size} color={modeMeta(mode).color} />;
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-control border border-border bg-surface px-2.5 py-1.5 text-caption text-text shadow-pop group-hover:block group-focus-visible:block"
    >
      {children}
    </span>
  );
}

/**
 * Six-month history of one mode: one bar per month, the selected month solid,
 * the others lighter. Each bar links to its month.
 */
export function ModeHistory({
  mode,
  history,
  selected,
}: {
  mode: string;
  history: { month: string; distance: number; duration: number }[];
  selected: string;
}) {
  const color = modeMeta(mode).color;
  const max = Math.max(1, ...history.map((h) => h.distance));
  return (
    <div className="mt-4 flex h-20 items-stretch gap-1.5" role="list" aria-label={`${modeMeta(mode).label}, last ${history.length} months`}>
      {history.map((h) => {
        const pct = (h.distance / max) * 100;
        const on = h.month === selected;
        return (
          <Link
            key={h.month}
            href={`/insights?month=${h.month}`}
            role="listitem"
            aria-label={`${formatMonth(h.month)}: ${formatKm(h.distance)}, ${formatDuration(h.duration)}`}
            className="group relative flex flex-1 flex-col items-center gap-1.5 outline-none"
          >
            <span className="relative flex w-full flex-1 items-end">
              {h.distance > 0 ? (
                <span
                  className="w-full rounded-t-[3px] transition-opacity group-hover:opacity-100"
                  style={{ height: `${Math.max(4, pct)}%`, background: color, opacity: on ? 1 : 0.45 }}
                />
              ) : (
                <span className="h-px w-full bg-border" />
              )}
              <Tip>
                <span className="font-medium">{formatMonth(h.month)}</span>
                <span className="text-muted">
                  {" "}
                  · {formatKm(h.distance)} · {formatDuration(h.duration)}
                </span>
              </Tip>
            </span>
            <span className={`text-caption leading-none ${on ? "font-semibold text-text" : "text-muted"}`}>
              {formatMonth(h.month, true)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** One stacked bar: each mode's share of the distance, 2px gaps between segments. */
export function ShareBar({ modes }: { modes: { mode: string; distance: number; duration: number }[] }) {
  const total = modes.reduce((a, m) => a + m.distance, 0);
  if (total <= 0) return null;
  return (
    <div className="flex h-2.5 w-full gap-[2px]" role="img" aria-label="Share of distance by mode">
      {modes
        .filter((m) => m.distance / total >= 0.004)
        .map((m, i, arr) => (
          <span
            key={m.mode}
            tabIndex={0}
            className={`group relative h-full outline-none ${i === 0 ? "rounded-l-full" : ""} ${i === arr.length - 1 ? "rounded-r-full" : ""}`}
            style={{ width: `${(m.distance / total) * 100}%`, background: modeMeta(m.mode).color, minWidth: 3 }}
          >
            <Tip>
              <span className="font-medium">{modeMeta(m.mode).label}</span>
              <span className="text-muted">
                {" "}
                · {formatKm(m.distance)} · {Math.round((m.distance / total) * 100)}%
              </span>
            </Tip>
          </span>
        ))}
    </div>
  );
}

/** Horizontal bars per mode (trip detail): label, bar, value. */
export function ModeBars({ modes }: { modes: { mode: string; distance: number; duration: number }[] }) {
  const max = Math.max(1, ...modes.map((m) => m.distance));
  return (
    <ul className="flex flex-col gap-3">
      {modes.map((m) => (
        <li key={m.mode} className="flex items-center gap-3">
          <ModeIcon mode={m.mode} size="sm" />
          <span className="w-20 shrink-0 text-sm text-text">{modeMeta(m.mode).label}</span>
          <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${Math.max(1, (m.distance / max) * 100)}%`, background: modeMeta(m.mode).color }}
            />
          </span>
          <span className="w-24 shrink-0 text-right text-sm tabular-nums">
            {formatKm(m.distance)}
            <span className="block text-caption text-muted">{formatDuration(m.duration)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Small "[dot][train] 412 km" chips for the top modes of a trip or day. */
export function ModeChips({ modes, max = 4 }: { modes: { mode: string; distance: number }[]; max?: number }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {modes.slice(0, max).map((m) => {
        const I = modeIcon(m.mode);
        return (
          <li
            key={m.mode}
            className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-surface pl-2 pr-2.5 text-caption text-secondary"
          >
            <I size={16} strokeWidth={1.75} aria-hidden style={{ color: modeMeta(m.mode).color }} />
            <span className="sr-only">{modeMeta(m.mode).label}</span>
            <span className="tabular-nums">{formatKm(m.distance)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** A labelled figure in its own card (the shared ui Stat). */
export function Stat({ label, value, hint }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return <UiStat label={label} value={value} hint={hint} />;
}
