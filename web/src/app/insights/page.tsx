import { BatteryCard } from "@/components/insights/BatteryCard";
import { QualityCard } from "@/components/insights/QualityCard";
import { InsightsHeader } from "@/components/insights/InsightsHeader";
import { MonthPicker } from "@/components/insights/MonthPicker";
import { ModeHistory, ModeIcon, ShareBar, modeMeta } from "@/components/insights/charts";
import { ChevronRight, Route } from "lucide-react";
import { Card, CardHeader, EmptyState, IconTile, KIND_ICONS, Page, SectionHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDuration, formatKm, formatMonth } from "@/lib/format";
import Link from "next/link";
import { getBatteryInsight, getMonthModes, getQualityInsight, getSavedPlacesMonth } from "@/lib/insights/load";
import type { SavedPlaceMonth } from "@/lib/insights/savedTime";
import { KIND_META, isHomeKind } from "@/lib/savedPlaces";
import { addMonths, isMonth } from "@/lib/insights/time";

export const dynamic = "force-dynamic";

export const metadata = { title: "Insights · Matka" };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const { month: raw } = await searchParams;
  const data = await getMonthModes(user, raw && isMonth(raw) ? raw : undefined);
  const [saved, battery, quality] = await Promise.all([
    getSavedPlacesMonth(user, data.month),
    getBatteryInsight(user, 60).catch((err) => {
      console.error("[insights] battery failed:", err);
      return null;
    }),
    getQualityInsight(user, 30).catch((err) => {
      console.error("[insights] quality failed:", err);
      return null;
    }),
  ]);

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

  const byDistance = [...used].sort((a, b) => b.distance - a.distance);

  return (
    <Page width="wide">
      <InsightsHeader active="travel" subtitle="How you got around, month by month." />

      <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-heading text-text">{formatMonth(data.month)}</h2>
        {months.length > 0 && <MonthPicker month={data.month} months={months} />}
      </section>

      {data.modes.length === 0 ? (
        <EmptyState
          icon={Route}
          title="No travel recorded yet"
          description="Journeys appear here once your phone has logged a few moves."
        />
      ) : (
        <>
          <section aria-label="Month totals" className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label="Distance" value={formatKm(data.distance)} />
            <Stat label="Time on the move" value={formatDuration(data.duration)} />
            <Stat className="col-span-2 md:col-span-1" label="Journeys" value={trips.toLocaleString("en-GB")} />
          </section>

          {used.length > 0 && (
            <Card as="section" className="mt-4">
              <CardHeader title="Distance by mode" />
              <ShareBar modes={byDistance} />
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-meta">
                {byDistance.map((m) => (
                  <li key={m.mode} className="flex items-center gap-1.5 text-secondary">
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: modeMeta(m.mode).color }} />
                    {modeMeta(m.mode).label}
                    <span className="tabular-nums text-muted">
                      {data.distance > 0 ? Math.round((m.distance / data.distance) * 100) : 0}%
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <SavedPlacesCard saved={saved.saved} rows={saved.rows} />

          <SectionHeader title="By mode" className="mt-8" />
          <section className="grid gap-3 md:grid-cols-2">
            {[...used, ...quiet].map((m) => {
              const none = m.distance === 0 && m.duration === 0;
              return (
                <Card as="article" key={m.mode}>
                  <div className="flex items-center gap-3">
                    <ModeIcon mode={m.mode} />
                    <div className="min-w-0">
                      <h3 className={`text-label ${none ? "text-muted" : "text-text"}`}>{modeMeta(m.mode).label}</h3>
                      <p className="text-meta text-muted">
                        {m.count === 0 ? "None this month" : `${m.count} ${m.count === 1 ? "journey" : "journeys"}`}
                      </p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className={`text-label font-semibold tabular-nums ${none ? "text-muted" : "text-text"}`}>
                        {formatKm(m.distance)}
                      </p>
                      <p className="text-meta tabular-nums text-muted">{formatDuration(m.duration)}</p>
                    </div>
                  </div>
                  <ModeHistory mode={m.mode} history={m.history} selected={data.month} />
                </Card>
              );
            })}
          </section>
          <p className="mt-3 max-w-3xl text-caption text-muted">
            Months follow your time zone ({user.timezone}); a journey across a month boundary is split by time. Tap a
            bar to open that month.{user.transitLines ? " Trips matched to public transport lines count as that kind." : ""}
          </p>
        </>
      )}

      {(battery || quality) && <SectionHeader title="Phone and recording" className="mt-10" />}
      {battery && <BatteryCard days={battery.days} annotations={battery.annotations} tz={user.timezone} />}
      {quality && <QualityCard data={quality} tz={user.timezone} />}
    </Page>
  );
}

const hours = (s: number) => `${s >= 36_000 ? Math.round(s / 3600) : Math.round(s / 360) / 10} h`;
const nights = (n: number) => `${n} ${n === 1 ? "night" : "nights"}`;

/** "School 62 h · Mom's 9 nights · Dad's 12 nights" for the month. */
function SavedPlacesCard({ saved, rows }: { saved: number; rows: SavedPlaceMonth[] }) {
  return (
    <Card as="section" className="mt-4">
      <CardHeader
        title="Saved places"
        description="Time at your homes, school and work this month"
        action={
          <Link href="/places" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
            {saved ? "Manage" : "Save places"}
            <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
          </Link>
        }
      />
      {saved === 0 ? (
        <p className="text-meta text-muted">
          Save your homes, school or work on the Places page to see how much time you spend at each.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-meta text-muted">No time at your saved places this month.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows.map((r) => {
            const home = isHomeKind(r.kind);
            const label = KIND_META[r.kind].label;
            return (
              <li key={r.placeId}>
                <Link
                  href={`/places/${r.placeId}`}
                  className="flex items-center gap-3 rounded-control border border-border px-3 py-2.5 transition-colors hover:border-strong hover:bg-surface-2/60"
                >
                  <IconTile icon={KIND_ICONS[r.kind]} tone="primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label text-text">{r.name ?? label}</span>
                    {r.name && r.name !== label && <span className="block text-meta text-muted">{label}</span>}
                  </span>
                  <span className="text-right">
                    <span className="block text-label font-semibold tabular-nums text-text">
                      {home && r.nights > 0 ? nights(r.nights) : hours(r.seconds)}
                    </span>
                    <span className="block text-meta tabular-nums text-muted">
                      {home && r.nights > 0 ? hours(r.seconds) : r.nights > 0 ? nights(r.nights) : "\u00a0"}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
