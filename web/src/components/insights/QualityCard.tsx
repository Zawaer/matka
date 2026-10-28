// "Recording quality" card for Insights: how good the phone app's fixes are
// while moving, per recording-preset period, and Matka's own estimated battery
// use per preset with the phone's measured draw. Text only, in text tokens;
// numbers tabular; per-day rows behind a <details> (no client JS).

import type { CurrentAgg, UsageGroup } from "@/lib/insights/matkaPower";
import type { QualityInsight } from "@/lib/insights/load";
import type { QualityStats } from "@/lib/insights/quality";
import { ChevronRight } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";

type Period = QualityInsight["periods"][number];

function when(iso: string, tz: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: tz });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz });
  return time === "00:00" ? day : `${day} ${time}`;
}

function span(p: Period, tz: string): string {
  if (p.start && p.end) return `${when(p.start, tz)} – ${when(p.end, tz)}`;
  if (p.start) return `from ${when(p.start, tz)}`;
  if (p.end) return `until ${when(p.end, tz)}`;
  return "all days";
}

const pct = (v: number | null) => (v == null ? "–" : `${Math.round(v * 100)} %`);
const m = (v: number | null) => (v == null ? "–" : `${Math.round(v)} m`);
const s = (v: number) => (v < 90 ? `${Math.round(v)} s` : `${Math.round(v / 60)} min`);
const dur = (sec: number) => (sec < 5400 ? `${Math.round(sec / 60)} min` : `${(sec / 3600).toFixed(1)} h`);
const ma = (c: CurrentAgg) => (c.n > 0 && c.median != null ? `~${Math.round(c.median)} mA` : null);
const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Three headline figures, then the rest as a small label/value grid. */
function Figures({ main, more }: { main: [string, string][]; more: [string, string][] }) {
  return (
    <>
      <dl className="grid grid-cols-3 gap-3">
        {main.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="truncate text-caption text-muted">{k}</dt>
            <dd className="text-label font-semibold tabular-nums text-text">{v}</dd>
          </div>
        ))}
      </dl>
      {more.length > 0 && (
        <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
          {more.map(([k, v]) => (
            <div key={k} className="flex min-w-0 items-baseline justify-between gap-2 text-caption">
              <dt className="truncate text-muted">{k}</dt>
              <dd className="shrink-0 tabular-nums text-secondary">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}

function Numbers({ t }: { t: QualityStats }) {
  const mv = t.moving;
  if (!mv) {
    return (
      <p className="text-meta text-muted tabular-nums">
        No movement recorded · {t.fixes.toLocaleString("en-GB")} fixes
      </p>
    );
  }
  return (
    <Figures
      main={[
        ["Median accuracy", m(mv.accuracyMedian)],
        ["One fix every", s(mv.secondsPerFix)],
        ["Fixes over 50 m", pct(mv.over50)],
      ]}
      more={[
        ["p90 accuracy", m(mv.accuracyP90)],
        ["Interval median", s(mv.intervalMedianS)],
        ["Interval p90", s(mv.intervalP90S)],
        ["Within 10 m", pct(mv.within10)],
        ["Path noise", mv.pathNoise == null ? "–" : `${mv.pathNoise.toFixed(1)} m`],
        ["Time moving", dur(mv.minutes * 60)],
        ["Fixes/h overall", String(t.fixesPerHour ?? "–")],
        ["Standby quality", pct(t.standbyShare)],
      ]}
    />
  );
}

function Usage({ g }: { g: UsageGroup }) {
  const draw: [string, string][] = [
    ["Draw, GPS active", ma(g.current.active)],
    ["Draw, standby", ma(g.current.standby)],
    ["Draw, screen on", ma(g.current.screen)],
  ].filter((x): x is [string, string] => x[1] != null);
  return (
    <div className="py-3.5">
      <p className="mb-2 text-label text-text">{g.label}</p>
      <Figures
        main={[
          ["Per day", `≈ ${Math.round(g.perDay.mAh)} mAh`],
          ["Of the battery", `${g.perDay.percent.toFixed(1)} %`],
          ["Days", String(g.perDay.days)],
        ]}
        more={[
          ["GPS active / day", dur(g.perDay.activeS)],
          ["Standby / day", dur(g.perDay.standbyS)],
          ...draw,
          ...(g.dropS > 0
            ? ([["Charge counter", `−${Math.round(g.dropMah).toLocaleString("en-GB")} mAh / ${dur(g.dropS)}`]] as [string, string][])
            : []),
        ]}
      />
      <details className="group mt-2.5 text-caption text-muted">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-sm font-medium text-secondary hover:text-text [&::-webkit-details-marker]:hidden">
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="transition-transform group-open:rotate-90" />
          Per day
        </summary>
        <ul className="mt-1.5 space-y-0.5 pl-5 tabular-nums">
          {g.days.map((d) => (
            <li key={d.day}>
              <span className="text-secondary">{dayLabel(d.day)}</span>: ≈ {d.estimate.mAh.toFixed(0)} mAh (
              {d.estimate.percent.toFixed(2)} %) · GPS {dur(d.activeS)} · standby {dur(d.standbyS)} · {d.fixes} fixes
              {ma(d.current.active) && ` · draw GPS ${ma(d.current.active)}`}
              {ma(d.current.standby) && ` · standby ${ma(d.current.standby)}`}
              {d.dropS > 0 && ` · −${Math.round(d.dropMah)} mAh/${dur(d.dropS)}`}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function QualityCard({ data, tz }: { data: QualityInsight; tz: string }) {
  const periods = data.periods.filter((p) => p.total.fixes > 0);
  if (periods.length === 0 && data.usage.length === 0) return null;
  return (
    <Card as="section" className="mt-4">
      <CardHeader title="Recording quality" description="Phone app fixes while moving, by recording preset" />
      <div className="divide-y divide-border border-t border-border">
        {periods.map((p) => (
          <div key={`${p.label}${p.start}`} className="py-3.5">
            <p className="mb-2 flex flex-wrap items-baseline gap-x-2">
              <span className="text-label text-text">{p.label}</span>
              <span className="text-meta text-muted">{span(p, tz)}</span>
            </p>
            <Numbers t={p.total} />
          </div>
        ))}
      </div>

      <h3 className="mt-5 text-label font-semibold text-text">Matka&apos;s own battery use</h3>
      <p className="text-meta text-muted">Estimated per recording preset</p>
      {data.usage.length ? (
        <div className="mt-1 divide-y divide-border">
          {data.usage.map((g) => (
            <Usage key={g.preset} g={g} />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-meta text-muted">Appears once the phone app reports what the recorder did (newer app build).</p>
      )}

      <p className="mt-4 border-t border-border pt-3 text-caption text-muted">
        Quality counts only moving stretches (fixes ≤ 5 min apart at over 1 m/s, over 30 m a minute, or a moving
        activity); path noise is how far a fix sits from the line between its neighbours. Matka&apos;s use is
        modelled from GPS-active time, standby time and fixes, calibrated on a {data.model.device} on{" "}
        {data.model.calibrated} ({data.model.batteryMah.toLocaleString("en-GB")} mAh battery); the phone draw figures
        are whole-phone measurements. The whole phone&apos;s drain is in the Phone battery card.
      </p>
    </Card>
  );
}
