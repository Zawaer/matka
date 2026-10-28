// "Phone battery" card (Devices → Recording quality): average unplugged drain per day, with a
// marker where the recorder changed. One neutral hue for the bars, numbers in
// text tokens, CSS tooltips (hover or keyboard focus), no client JS.

import type { BatteryDay, Drain } from "@/lib/insights/battery";
import { startOfDay } from "@/lib/insights/time";
import { ChevronRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";

type Annotation = { at: number; label: string; date: string; before: Drain; after: Drain };

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayLabel = (date: string, weekday = true) =>
  `${weekday ? `${WD[new Date(`${date}T12:00:00Z`).getUTCDay()]} ` : ""}${formatDate(date)}`;
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
    <Card as="section">
      <CardHeader title="Phone battery" description="How fast the whole phone drains while unplugged, % per hour" />
      {compare && (
        <dl className="mb-2 flex flex-wrap items-end gap-x-8 gap-y-2">
          <div>
            <dt className="text-meta text-muted">Before {compare.label}</dt>
            <dd className="text-stat tabular-nums text-text">{rate(compare.before.rate)}</dd>
          </div>
          <div>
            <dt className="text-meta text-muted">After</dt>
            <dd className="text-stat tabular-nums text-text">{rate(compare.after.rate)}</dd>
          </div>
          <p className="pb-1 text-caption text-muted">7 days either side</p>
        </dl>
      )}

      <div className="relative mt-3 pt-5">
        <span className="absolute left-0 top-0 text-caption leading-none text-muted tabular-nums">{rate(max)}</span>
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
                    className="w-full rounded-t-[2px] opacity-55 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                    style={{ height: `${Math.max(3, (d.rate / max) * 100)}%`, background: "var(--mk-muted)" }}
                  />
                ) : (
                  <span className="h-px w-full bg-border" />
                )}
                <span
                  role="tooltip"
                  className={`pointer-events-none absolute bottom-full z-20 mb-2 hidden whitespace-nowrap rounded-control border border-border bg-surface px-2.5 py-1.5 text-caption text-text shadow-pop group-hover:block group-focus-visible:block ${align}`}
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
            <span className="absolute bottom-0 top-3 w-px bg-primary" />
            <span
              className={`absolute top-0 whitespace-nowrap text-caption font-medium leading-none text-primary ${m.pos > 70 ? "right-1" : "left-1"}`}
            >
              {m.label}
            </span>
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-caption leading-none text-muted">
        <span>{dayLabel(days[0].date, false)}</span>
        <span>{dayLabel(days[n - 1].date, false)}</span>
      </div>

      <details className="group mt-4 text-caption text-muted">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm font-medium text-secondary hover:text-text [&::-webkit-details-marker]:hidden">
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="transition-transform group-open:rotate-90" />
          Details
        </summary>
        <p className="mt-1.5 pl-5">
          This includes the screen and other apps. It is measured from the battery level the app reports with each
          point; charging and gaps over 3 hours are left out, and days follow your time zone.
        </p>
      </details>
    </Card>
  );
}
