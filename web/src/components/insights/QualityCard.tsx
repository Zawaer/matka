// "Recording quality" card for Insights: how good the phone app's fixes are
// while moving, per recording-preset period, and Matka's own estimated battery
// use per preset with the phone's measured draw. Text only, in text tokens;
// numbers tabular; per-day rows behind a <details> (no client JS).

import type { CurrentAgg, UsageGroup } from "@/lib/insights/matkaPower";
import type { QualityInsight } from "@/lib/insights/load";
import type { QualityStats } from "@/lib/insights/quality";

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

function Numbers({ t }: { t: QualityStats }) {
  const mv = t.moving;
  if (!mv) {
    return (
      <p className="text-sm text-muted tabular-nums">
        No movement recorded · {t.fixes.toLocaleString("en-GB")} fixes
      </p>
    );
  }
  return (
    <>
      <p className="text-sm tabular-nums">
        Median accuracy <span className="font-semibold">{m(mv.accuracyMedian)}</span>, 1 fix /{" "}
        <span className="font-semibold">{s(mv.secondsPerFix)}</span> while moving,{" "}
        <span className="font-semibold">{pct(mv.over50)}</span> &gt; 50 m
      </p>
      <p className="text-xs text-muted tabular-nums">
        p90 accuracy {m(mv.accuracyP90)} · interval median {s(mv.intervalMedianS)}, p90 {s(mv.intervalP90S)} · ≤ 10 m{" "}
        {pct(mv.within10)} · path noise {mv.pathNoise == null ? "–" : `${mv.pathNoise.toFixed(1)} m`} ·{" "}
        {dur(mv.minutes * 60)} moving · {t.fixesPerHour ?? "–"} fixes/h overall · standby-quality {pct(t.standbyShare)}
      </p>
    </>
  );
}

function Usage({ g }: { g: UsageGroup }) {
  const draw = [ma(g.current.active) && `GPS active ${ma(g.current.active)}`, ma(g.current.standby) && `standby ${ma(g.current.standby)}`, ma(g.current.screen) && `screen on ${ma(g.current.screen)}`].filter(Boolean);
  return (
    <div className="py-2">
      <p className="text-sm tabular-nums">
        <span className="font-semibold">{g.label}</span>
        <span className="text-muted"> · </span>≈ {Math.round(g.perDay.mAh)} mAh/day ({g.perDay.percent.toFixed(1)} %)
        <span className="text-muted">
          {" "}
          · GPS active {dur(g.perDay.activeS)}, standby {dur(g.perDay.standbyS)} a day · {g.perDay.days}{" "}
          {g.perDay.days === 1 ? "day" : "days"}
        </span>
      </p>
      {(draw.length > 0 || g.dropS > 0) && (
        <p className="text-xs text-muted tabular-nums">
          Whole phone, unplugged: {draw.join(" · ")}
          {g.dropS > 0 && `${draw.length ? " · " : ""}charge counter −${Math.round(g.dropMah).toLocaleString("en-GB")} mAh over ${dur(g.dropS)}`}
        </p>
      )}
      <details className="mt-1 text-xs text-muted">
        <summary className="cursor-pointer">Per day</summary>
        <ul className="mt-1 space-y-0.5 tabular-nums">
          {g.days.map((d) => (
            <li key={d.day}>
              {dayLabel(d.day)}: ≈ {d.estimate.mAh.toFixed(0)} mAh ({d.estimate.percent.toFixed(2)} %) · GPS {dur(d.activeS)} · standby{" "}
              {dur(d.standbyS)} · {d.fixes} fixes
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
    <section className="mk-card mt-5 p-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-muted">Recording quality</h3>
        <span className="text-xs text-muted">Phone app fixes, by recording preset</span>
      </div>
      <div className="divide-y divide-border">
        {periods.map((p) => (
          <div key={`${p.label}${p.start}`} className="py-2.5">
            <p className="mb-0.5 text-sm">
              <span className="font-semibold">{p.label}</span>
              <span className="text-muted"> · {span(p, tz)}</span>
            </p>
            <Numbers t={p.total} />
          </div>
        ))}
      </div>

      <h4 className="mt-4 text-sm font-semibold text-muted">Matka&apos;s own battery use (estimate)</h4>
      {data.usage.length ? (
        <div className="divide-y divide-border">
          {data.usage.map((g) => (
            <Usage key={g.preset} g={g} />
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted">Appears once the phone app reports what the recorder did (newer app build).</p>
      )}

      <p className="mt-3 text-xs text-muted">
        Quality counts only moving stretches (fixes ≤ 5 min apart at over 1 m/s, over 30 m a minute, or a moving
        activity); path noise is how far a fix sits from the line between its neighbours. Matka&apos;s use is
        modelled from GPS-active time, standby time and fixes, calibrated on a {data.model.device} on{" "}
        {data.model.calibrated} ({data.model.batteryMah.toLocaleString("en-GB")} mAh battery); the phone draw figures
        are whole-phone measurements. The whole phone&apos;s drain is in the Phone battery card.
      </p>
    </section>
  );
}
