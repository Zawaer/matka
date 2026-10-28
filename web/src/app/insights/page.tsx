import { InsightsHeader } from "@/components/insights/InsightsHeader";
import { MonthPicker } from "@/components/insights/MonthPicker";
import { ModeHistory, ModeIcon, ShareBar, modeMeta } from "@/components/insights/charts";
import { Route } from "lucide-react";
import { Card, CardHeader, CardList, EmptyState, IconTile, KIND_ICONS, ListRow, Page, SectionHeader, StatStrip } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatCount, formatDuration, formatKm, formatLongDuration } from "@/lib/format";
import Link from "next/link";
import { getMonthModes, getSavedPlacesMonth } from "@/lib/insights/load";
import type { SavedPlaceMonth } from "@/lib/insights/savedTime";
import { KIND_META, isHomeKind } from "@/lib/savedPlaces";
import { addMonths, isMonth } from "@/lib/insights/time";

export const dynamic = "force-dynamic";

export const metadata = { title: "Insights · Matka" };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const { month: raw } = await searchParams;
  const data = await getMonthModes(user, raw && isMonth(raw) ? raw : undefined);
  const saved = await getSavedPlacesMonth(user, data.month);

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
  // Small multiples start at the first month with travel: no empty pre-history bars.
  const since = <T extends { month: string }>(h: T[]): T[] => (data.firstMonth ? h.filter((x) => x.month >= data.firstMonth!) : h);

  return (
    <Page width="wide">
      <InsightsHeader active="travel" subtitle="How you got around, month by month." />

      {data.modes.length === 0 ? (
        <EmptyState
          icon={Route}
          title="No travel recorded yet"
          description="Journeys appear here once your phone has logged a few moves."
        />
      ) : (
        <>
          {months.length > 0 && (
            <div className="mb-4">
              <MonthPicker month={data.month} months={months} />
            </div>
          )}

          <StatStrip
            items={[
              { label: "Distance", value: formatKm(data.distance) },
              { label: "Time on the move", value: formatLongDuration(data.duration) },
              { label: "Journeys", value: formatCount(trips) },
            ]}
          />

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

          <SavedPlaces saved={saved.saved} rows={saved.rows} />

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
                        {m.count === 0 ? (
                          "None this month"
                        ) : (
                          <>
                            <span className="tabular-nums">{m.count}</span> {m.count === 1 ? "journey" : "journeys"}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className={`text-label font-semibold tabular-nums ${none ? "text-muted" : "text-text"}`}>
                        {formatKm(m.distance)}
                      </p>
                      <p className="text-meta tabular-nums text-muted">{formatDuration(m.duration)}</p>
                    </div>
                  </div>
                  <ModeHistory mode={m.mode} history={since(m.history)} selected={data.month} />
                </Card>
              );
            })}
          </section>
          <p className="mt-3 max-w-3xl text-caption text-muted">
            Months follow your time zone ({user.timezone}); select a bar to open that month.
          </p>
        </>
      )}
    </Page>
  );
}

const hours = (s: number) => `${formatCount(s >= 36_000 ? Math.round(s / 3600) : Math.round(s / 360) / 10)} h`;
const nights = (n: number) => `${n} ${n === 1 ? "night" : "nights"}`;

/** Time at saved places this month: nights for homes, hours elsewhere. */
function SavedPlaces({ saved, rows }: { saved: number; rows: SavedPlaceMonth[] }) {
  return (
    <section className="mt-8">
      <SectionHeader
        title="Saved places"
        description="Nights at your homes, hours at school and work, this month"
        action={
          <Link href="/places" className="text-meta font-medium text-primary hover:underline">
            {saved ? "Manage" : "Save places"}
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
        <CardList>
          {rows.map((r) => {
            const label = KIND_META[r.kind].label;
            const home = isHomeKind(r.kind) && r.nights > 0;
            return (
              <ListRow
                key={r.placeId}
                href={`/places/${r.placeId}`}
                leading={<IconTile icon={KIND_ICONS[r.kind]} size="sm" />}
                title={r.name ?? label}
                meta={r.name && r.name !== label ? label : undefined}
                trailing={<span className="text-label font-medium text-text">{home ? nights(r.nights) : hours(r.seconds)}</span>}
              />
            );
          })}
        </CardList>
      )}
    </section>
  );
}
