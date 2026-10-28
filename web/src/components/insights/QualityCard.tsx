// "Recording quality" on the Devices page: how good the phone app's fixes are
// while moving, per recording preset, and Matka's own estimated battery use
// per preset. Compact tables (presets as columns, measures as rows), numbers
// tabular, the methodology behind a "Details" disclosure. No client JS.

import type { CurrentAgg, UsageGroup } from "@/lib/insights/matkaPower";
import type { QualityInsight } from "@/lib/insights/load";
import type { QualityStats } from "@/lib/insights/quality";
import { ChevronRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { formatCount, formatDate, localDate } from "@/lib/format";

type Period = QualityInsight["periods"][number];

function when(iso: string, tz: string): string {
  return formatDate(localDate(iso, tz), localDate(new Date(), tz));
}

function span(p: Period, tz: string): string {
  if (p.start && p.end) return `${when(p.start, tz)} – ${when(p.end, tz)}`;
  if (p.start) return `Since ${when(p.start, tz)}`;
  if (p.end) return `Until ${when(p.end, tz)}`;
  return "All days";
}

const pct = (v: number | null | undefined) => (v == null ? "–" : `${Math.round(v * 100)} %`);
const m = (v: number | null | undefined) => (v == null ? "–" : `${Math.round(v)} m`);
const s = (v: number | null | undefined) => (v == null ? "–" : v < 90 ? `${Math.round(v)} s` : `${Math.round(v / 60)} min`);
const dur = (sec: number) => (sec < 5400 ? `${Math.round(sec / 60)} min` : `${(sec / 3600).toFixed(1)} h`);
const ma = (c: CurrentAgg) => (c.n > 0 && c.median != null ? `${Math.round(c.median)} mA` : "–");
const dayLabel = (date: string) => formatDate(date);

/** A table with measures as rows and one column per preset. */
function Table({ columns, rows }: { columns: { key: string; title: string; sub?: string }[]; rows: [string, string[]][] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
      <table className="w-full min-w-[20rem] border-collapse text-meta">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="py-2 pr-3 text-left font-normal text-muted">
              <span className="sr-only">Measure</span>
            </th>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="py-2 pl-3 text-right align-bottom font-medium text-text">
                {c.title}
                {c.sub && <span className="block font-normal text-muted">{c.sub}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map(([label, values]) => (
            <tr key={label}>
              <th scope="row" className="py-2 pr-3 text-left font-normal text-muted">
                {label}
              </th>
              {values.map((v, i) => (
                <td key={i} className="py-2 pl-3 text-right tabular-nums text-secondary">
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Details({ summary = "Details", children }: { summary?: string; children: React.ReactNode }) {
  return (
    <details className="group mt-3 text-caption text-muted">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm font-medium text-secondary hover:text-text [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="transition-transform group-open:rotate-90" />
        {summary}
      </summary>
      <div className="mt-1.5 pl-5">{children}</div>
    </details>
  );
}

const qualityRows = (ts: QualityStats[]): [string, string[]][] => [
  ["Typical accuracy", ts.map((t) => m(t.moving?.accuracyMedian))],
  ["9 in 10 fixes within", ts.map((t) => m(t.moving?.accuracyP90))],
  ["One fix every", ts.map((t) => s(t.moving?.secondsPerFix))],
  ["Fixes off by over 50 m", ts.map((t) => pct(t.moving?.over50))],
  ["Fixes within 10 m", ts.map((t) => pct(t.moving?.within10))],
  ["Wobble along the path", ts.map((t) => (t.moving?.pathNoise == null ? "–" : `${t.moving.pathNoise.toFixed(1)} m`))],
  ["Time moving", ts.map((t) => (t.moving ? dur(t.moving.minutes * 60) : "–"))],
  ["Fixes per hour", ts.map((t) => (t.fixesPerHour == null ? "–" : formatCount(t.fixesPerHour)))],
];

const usageRows = (gs: UsageGroup[]): [string, string[]][] => [
  ["Per day", gs.map((g) => `${formatCount(g.perDay.mAh)} mAh`)],
  ["Of the battery", gs.map((g) => `${g.perDay.percent.toFixed(1)} %`)],
  ["GPS on per day", gs.map((g) => dur(g.perDay.activeS))],
  ["Standby per day", gs.map((g) => dur(g.perDay.standbyS))],
  ["Phone draw, GPS on", gs.map((g) => ma(g.current.active))],
  ["Phone draw, standby", gs.map((g) => ma(g.current.standby))],
  ["Days measured", gs.map((g) => String(g.perDay.days))],
];

export function QualityCard({ data, tz }: { data: QualityInsight; tz: string }) {
  const periods = data.periods.filter((p) => p.total.fixes > 0);
  if (periods.length === 0 && data.usage.length === 0) return null;
  return (
    <>
      {periods.length > 0 && (
        <Card as="section">
          <CardHeader title="Location fixes while moving" description="How exact and how frequent, by recording setting" />
          <Table
            columns={periods.map((p) => ({ key: `${p.label}${p.start}`, title: p.label, sub: span(p, tz) }))}
            rows={qualityRows(periods.map((p) => p.total))}
          />
          <Details>
            <p>
              Only moving stretches count: fixes at most 5 minutes apart at over 1 m/s, over 30 m a minute, or while the
              phone reports a moving activity. The wobble is how far a fix sits from the line between its neighbours.
              {periods.some((p) => p.total.standbyShare != null) && (
                <>
                  {" "}
                  Standby quality:{" "}
                  {periods.map((p, i) => (
                    <span key={i} className="tabular-nums">
                      {i > 0 && ", "}
                      {p.label} {pct(p.total.standbyShare)}
                    </span>
                  ))}
                  .
                </>
              )}
            </p>
          </Details>
        </Card>
      )}

      {data.usage.length > 0 && (
        <Card as="section">
          <CardHeader title="Matka's battery use" description="Estimated per recording setting" />
          <Table columns={data.usage.map((g) => ({ key: g.preset, title: g.label }))} rows={usageRows(data.usage)} />
          <Details>
            <p>
              Estimated from the time the GPS was on, time in standby and the number of fixes, using a model measured on
              a {data.model.device} ({formatCount(data.model.batteryMah)} mAh battery, {data.model.calibrated}). The
              phone draw figures are measurements of the whole phone.
            </p>
            {data.usage.map((g) => (
              <div key={g.preset} className="mt-2">
                <p className="font-medium text-secondary">{g.label}, per day</p>
                <ul className="mt-0.5 space-y-0.5 tabular-nums">
                  {g.days.map((d) => (
                    <li key={d.day}>
                      {dayLabel(d.day)}: {formatCount(d.estimate.mAh)} mAh ({d.estimate.percent.toFixed(1)} %) · GPS{" "}
                      {dur(d.activeS)} · standby {dur(d.standbyS)} · {formatCount(d.fixes)} fixes
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Details>
        </Card>
      )}
    </>
  );
}
