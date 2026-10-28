import Link from "next/link";
import { Import, Smartphone } from "lucide-react";
import {
  ButtonLink,
  Card,
  CardList,
  EmptyState,
  IconTile,
  ListRow,
  Page,
  PageHeader,
  SectionHeader,
  StatStrip,
  placeIconFor,
} from "@/components/ui";
import { TripCard } from "@/components/insights/TripCard";
import { requireUser } from "@/lib/auth";
import { getCovers } from "@/lib/covers";
import {
  MONTH_NAMES,
  MONTH_NAMES_SHORT,
  formatCount,
  formatDayHeading,
  formatDuration,
  formatKm,
  formatLongDuration,
  formatTime,
  localDate,
} from "@/lib/format";
import { tripCoverSpec } from "@/lib/insights/coverSpecs";
import { getAwayTrips } from "@/lib/insights/load";
import { getRouteSketches } from "@/lib/insights/routeSketch";
import { getOverview } from "@/lib/overview";

export const dynamic = "force-dynamic";

/** Months shown in the chart: from the first with travel, but at least six. */
const MIN_MONTHS = 6;

export default async function Overview() {
  const user = await requireUser();
  const tz = user.timezone;
  const { totals, months: allMonths, topPlaces, recent } = await getOverview(user.id, tz);
  const empty = totals.points === 0;

  // The latest trips, as covers (Immich photo or a sketch of the routes).
  const away = empty
    ? { trips: [] }
    : await getAwayTrips(user).catch((err) => {
        console.error("[overview] trips failed:", err);
        return { trips: [] };
      });
  const latest = [...away.trips].sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, 3);
  const [covers, sketches] = latest.length
    ? await Promise.all([
        getCovers(user.id, latest.map((t) => tripCoverSpec(t, tz)), { budgetMs: 3000 }).catch(() => new Map()),
        getRouteSketches(user, latest).catch(() => new Map()),
      ])
    : [new Map(), new Map()];

  const firstData = allMonths.findIndex((m) => m.distance > 0);
  const months = allMonths.slice(Math.max(0, Math.min(firstData < 0 ? 0 : firstData, allMonths.length - MIN_MONTHS)));
  const maxMonth = Math.max(1, ...months.map((m) => m.distance));
  const maxHours = Math.max(1, ...topPlaces.map((p) => p.hours));

  const today = localDate(new Date(), tz);
  const since = totals.first ? localDate(totals.first, tz) : null;
  const subtitle = since
    ? `Since ${Number(since.slice(8))} ${MONTH_NAMES[Number(since.slice(5, 7)) - 1]} ${since.slice(0, 4)} · ${formatCount(totals.days)} ${
        totals.days === 1 ? "day" : "days"
      }`
    : "Your location history at a glance.";

  // Recent visits, grouped by day.
  const days = new Map<string, typeof recent>();
  for (const v of recent) {
    const d = localDate(v.startedAt, tz);
    days.set(d, [...(days.get(d) ?? []), v]);
  }

  return (
    <Page>
      <PageHeader title="Overview" subtitle={subtitle} />

      {empty ? (
        <EmptyState
          icon={Smartphone}
          title="No location history yet"
          description="Pair your phone and Matka starts recording, or bring in your past years from Google. Visits, trips and places show up here after the first day."
          action={
            <ButtonLink href="/devices" variant="primary" icon={Smartphone}>
              Pair your phone
            </ButtonLink>
          }
          secondary={
            <ButtonLink href="/settings#import" icon={Import}>
              Import from Google Timeline
            </ButtonLink>
          }
        />
      ) : (
        <>
          <StatStrip
            items={[
              { label: "Distance travelled", value: formatKm(totals.distance) },
              { label: "Days tracked", value: formatCount(totals.days) },
              { label: "Visits", value: formatCount(totals.visits) },
              { label: "Location points", value: formatCount(totals.points) },
            ]}
          />

          <section className="mt-8 grid items-start gap-x-4 gap-y-8 md:grid-cols-5">
            <div className="md:col-span-3">
              <SectionHeader title="Distance by month" />
              <Card>
                <ol className="flex h-48 items-stretch gap-1.5 sm:gap-2" aria-label="Distance by month">
                  {months.map((m, i) => {
                    const h = (m.distance / maxMonth) * 100;
                    const name = MONTH_NAMES_SHORT[m.month - 1];
                    const value = formatKm(m.distance);
                    const current = i === months.length - 1;
                    return (
                      <li
                        key={`${m.year}-${m.month}`}
                        aria-label={`${MONTH_NAMES[m.month - 1]} ${m.year}: ${value}`}
                        tabIndex={0}
                        className="group relative flex flex-1 flex-col items-center gap-2 outline-none"
                      >
                        <div className="relative flex w-full flex-1 flex-col justify-end">
                          {/* The current month's value always shows; the others on hover or focus. */}
                          <span
                            className={`pointer-events-none mb-1 self-center whitespace-nowrap text-caption tabular-nums ${
                              current
                                ? "text-secondary"
                                : "invisible rounded border border-border bg-surface px-1.5 text-text shadow-pop group-hover:visible group-focus-visible:visible"
                            }`}
                          >
                            {m.distance > 0 ? value : "0 km"}
                          </span>
                          {m.distance > 0 ? (
                            <div
                              className={`w-full rounded-t-[4px] transition-colors ${
                                current ? "bg-primary" : "bg-primary/45 group-hover:bg-primary/70"
                              }`}
                              style={{ height: `${Math.max(2, h * 0.82)}%` }}
                            />
                          ) : (
                            <div className="h-px w-full bg-border" />
                          )}
                        </div>
                        <span className={`text-caption leading-none ${current ? "font-medium text-text" : "text-muted"}`}>
                          {name}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </Card>
            </div>

            <div className="md:col-span-2">
              <SectionHeader
                title="Most time spent"
                action={
                  <Link href="/places" className="text-meta font-medium text-primary hover:underline">
                    All places
                  </Link>
                }
              />
              {topPlaces.length === 0 ? (
                <p className="text-meta text-muted">Places appear after your first longer stays.</p>
              ) : (
                <Card>
                  <ol className="flex flex-col gap-3">
                    {topPlaces.slice(0, 6).map((p, i) => (
                      <li key={p.id}>
                        <Link href={`/places/${p.id}`} className="group block rounded-sm">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-sm text-text group-hover:text-primary">{p.name ?? "Unknown place"}</span>
                            <span className="shrink-0 text-meta tabular-nums text-muted">{formatLongDuration(p.hours * 3600)}</span>
                          </div>
                          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
                            <div
                              className={`h-full rounded-full ${i === 0 ? "bg-secondary" : "bg-muted/40"}`}
                              style={{ width: `${(p.hours / maxHours) * 100}%` }}
                            />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </Card>
              )}
            </div>
          </section>

          {latest.length > 0 && (
            <section className="mt-8">
              <SectionHeader
                title="Recent trips"
                action={
                  <Link href="/insights/trips" className="text-meta font-medium text-primary hover:underline">
                    All trips
                  </Link>
                }
              />
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {latest.map((t) => (
                  <li key={t.id}>
                    <TripCard trip={t} cover={covers.get(`trip:${t.id}`)} sketch={sketches.get(t.id)} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-8">
            <SectionHeader
              title="Recent visits"
              action={
                <Link href="/timeline" className="text-meta font-medium text-primary hover:underline">
                  Timeline
                </Link>
              }
            />
            {recent.length === 0 ? (
              <p className="text-meta text-muted">Stays of a few minutes or more show up here.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {[...days].map(([day, visits]) => (
                  <div key={day}>
                    <h3 className="mb-1.5 px-1 text-meta font-medium text-muted">{formatDayHeading(day, today)}</h3>
                    <CardList>
                      {visits.map((v) => (
                        <ListRow
                          key={v.id}
                          href={`/places/${v.placeId}`}
                          leading={<IconTile icon={placeIconFor(v.kind, v.category)} size="sm" />}
                          title={v.name ?? <span className="text-muted">Unknown place</span>}
                          meta={<span className="tabular-nums">{formatTime(v.startedAt, tz)}</span>}
                          trailing={formatDuration(v.duration)}
                        />
                      ))}
                    </CardList>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </Page>
  );
}
