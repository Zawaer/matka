import { InsightsHeader } from "@/components/insights/InsightsHeader";
import { MonthPicker } from "@/components/insights/MonthPicker";
import { ModeHistory, ModeIcon, ShareBar, Stat, modeMeta } from "@/components/insights/charts";
import { requireUser } from "@/lib/auth";
import { formatDuration, formatKm, formatMonth } from "@/lib/format";
import { getMonthModes } from "@/lib/insights/load";
import { addMonths, isMonth } from "@/lib/insights/time";

export const dynamic = "force-dynamic";

export const metadata = { title: "Insights · Matka" };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const { month: raw } = await searchParams;
  const data = await getMonthModes(user, raw && isMonth(raw) ? raw : undefined);

  // Every month from the first with travel to now (or the picked month).
  const months: string[] = [];
  if (data.firstMonth) {
    const last = [data.lastMonth ?? data.month, data.month].sort()[1];
    for (let m = [data.firstMonth, data.month].sort()[0]; m <= last; m = addMonths(m, 1)) months.push(m);
  }
  const used = data.modes.filter((m) => m.distance > 0 || m.duration > 0);
  // Modes unused this month but used earlier in the window; unclassified moves only when present.
  const quiet = data.modes.filter((m) => m.distance === 0 && m.duration === 0 && m.mode !== "unknown");
  const trips = used.reduce((a, m) => a + m.count, 0);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-10">
      <InsightsHeader active="travel" subtitle="How you got around, month by month." />

      <section className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold tracking-tight">{formatMonth(data.month)}</h2>
        {months.length > 0 && <MonthPicker month={data.month} months={months} />}
      </section>

      {data.modes.length === 0 ? (
        <div className="mk-card px-6 py-14 text-center text-sm text-muted">
          No travel recorded yet. Trips appear here once your phone has logged a few moves.
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label="Distance" value={formatKm(data.distance)} accent />
            <Stat label="Time on the move" value={formatDuration(data.duration)} />
            <div className="col-span-2 md:col-span-1">
              <Stat label="Journeys" value={trips.toLocaleString("en-GB")} />
            </div>
          </section>

          {used.length > 0 && (
            <section className="mk-card mt-5 p-5">
              <h3 className="mb-3 text-sm font-semibold text-muted">Distance by mode</h3>
              <ShareBar modes={[...used].sort((a, b) => b.distance - a.distance)} />
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                {[...used]
                  .sort((a, b) => b.distance - a.distance)
                  .map((m) => (
                    <li key={m.mode} className="flex items-center gap-1.5">
                      <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: modeMeta(m.mode).color }} />
                      {modeMeta(m.mode).label}
                      <span className="text-muted tabular-nums">
                        {data.distance > 0 ? Math.round((m.distance / data.distance) * 100) : 0}%
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          <section className="mt-5 grid gap-3 md:grid-cols-2">
            {[...used, ...quiet].map((m) => (
              <article key={m.mode} className={`mk-card p-4 ${m.distance === 0 && m.duration === 0 ? "opacity-70" : ""}`}>
                <div className="flex items-center gap-3">
                  <ModeIcon mode={m.mode} />
                  <div className="min-w-0">
                    <h3 className="font-medium">{modeMeta(m.mode).label}</h3>
                    <p className="text-xs text-muted">
                      {m.count === 0 ? "None this month" : `${m.count} ${m.count === 1 ? "journey" : "journeys"}`}
                    </p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="font-semibold tabular-nums">{formatKm(m.distance)}</p>
                    <p className="text-xs text-muted tabular-nums">{formatDuration(m.duration)}</p>
                  </div>
                </div>
                <ModeHistory mode={m.mode} history={m.history} selected={data.month} />
              </article>
            ))}
          </section>
          <p className="mt-4 text-xs text-muted">
            Months follow your time zone ({user.timezone}); a journey across a month boundary is split by time. Tap a
            bar to open that month.{user.transitLines ? " Trips matched to public transport lines count as that kind." : ""}
          </p>
        </>
      )}
    </div>
  );
}
