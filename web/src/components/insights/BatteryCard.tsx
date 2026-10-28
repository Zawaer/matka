// "Phone battery" card for Insights: average unplugged drain per day, with a
// marker where the recorder changed. One neutral hue for the bars, numbers in
// text tokens, CSS tooltips (hover or keyboard focus), no client JS.

import type { BatteryDay, Drain } from "@/lib/insights/battery";
import { startOfDay } from "@/lib/insights/time";

type Annotation = { at: number; label: string; date: string; before: Drain; after: Drain };

const dayLabel = (date: string, weekday = true) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    ...(weekday ? { weekday: "short" } : {}),
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const rate = (r: number | null) => (r == null ? "–" : `${r.toFixed(1)} %/h`);

export function BatteryCard({ days, annotations, tz }: { days: BatteryDay[]; annotations: Annotation[]; tz: string }) {
  if (!days.some((d) => d.rate != null)) return null;
  const max = Math.max(1, ...days.map((d) => d.rate ?? 0));
  const n = days.length;
  const marks = annotations
    .map((a) => {
      const i = days.findIndex((d) => d.date === a.date);
      if (i < 0) return null;
      const into = (a.at - startOfDay(a.date, tz)) / 86_400_000;
      return { ...a, pos: ((i + Math.min(1, Math.max(0, into))) / n) * 100 };
    })
    .filter((m) => m != null);
  const compare = marks.find((m) => m.before.rate != null || m.after.rate != null);

  return (
    <section className="mk-card mt-5 p-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-muted">Phone battery</h3>
        <span className="text-xs text-muted">Drain while unplugged, %/h</span>
      </div>
      {compare && (
        <p className="mb-1 text-sm tabular-nums">
          Before: <span className="font-semibold">{rate(compare.before.rate)}</span>
          <span className="text-muted"> · </span>
          After: <span className="font-semibold">{rate(compare.after.rate)}</span>
          <span className="text-xs text-muted"> (7 days either side of {compare.label})</span>
        </p>
      )}

      <div className="relative mt-3 pt-5">
        <span className="absolute left-0 top-0 text-[10px] leading-none text-muted tabular-nums">{rate(max)}</span>
        <div className="relative flex h-28 items-stretch gap-px border-t border-dashed border-border" role="list" aria-label={`Battery drain per day, last ${n} days`}>
          {days.map((d, i) => {
            const align = i < n / 4 ? "left-0" : i > (n * 3) / 4 ? "right-0" : "left-1/2 -translate-x-1/2";
            return (
              <span
                key={d.date}
                role="listitem"
                tabIndex={0}
                aria-label={`${dayLabel(d.date)}: ${d.rate == null ? "no data" : `${rate(d.rate)} over ${d.hours} h unplugged`}`}
                className="group relative flex flex-1 items-end outline-none"
              >
                {d.rate != null ? (
                  <span
                    className="w-full rounded-t-[4px] opacity-70 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                    style={{ height: `${Math.max(3, (d.rate / max) * 100)}%`, background: "var(--mk-muted)" }}
                  />
                ) : (
                  <span className="h-[2px] w-full rounded-full bg-border" />
                )}
                <span
                  role="tooltip"
                  className={`pointer-events-none absolute bottom-full z-20 mb-2 hidden whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text shadow-[var(--mk-shadow)] group-hover:block group-focus-visible:block ${align}`}
                >
                  <span className="block font-medium">{dayLabel(d.date)}</span>
                  {d.rate == null ? (
                    <span className="block text-muted">Not enough unplugged data</span>
                  ) : (
                    <span className="block text-muted tabular-nums">
                      {rate(d.rate)} · {d.used.toFixed(0)} % over {d.hours.toFixed(1)} h
                      {d.night?.rate != null && <span className="block">Night (00–07): {rate(d.night.rate)}</span>}
                      {d.fullChargeHours != null && (
                        <span className="block">A full charge would last ≈ {Math.round(d.fullChargeHours)} h</span>
                      )}
                    </span>
                  )}
                </span>
              </span>
            );
          })}
        </div>
        {marks.map((m) => (
          <span key={m.at} aria-hidden className="pointer-events-none absolute bottom-0 top-0" style={{ left: `${m.pos}%` }}>
            <span className="absolute bottom-0 top-3 w-px bg-text/60" />
            <span
              className={`absolute top-0 whitespace-nowrap text-[10px] font-medium leading-none text-text ${m.pos > 70 ? "right-1" : "left-1"}`}
            >
              {m.label}
            </span>
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] leading-none text-muted">
        <span>{dayLabel(days[0].date, false)}</span>
        <span>{dayLabel(days[n - 1].date, false)}</span>
      </div>

      <p className="mt-3 text-xs text-muted">
        The whole phone&apos;s drain (screen, other apps), measured from the battery level the app reports with each
        point. Charging and gaps over 3 h are left out; days follow your time zone.
      </p>
    </section>
  );
}
