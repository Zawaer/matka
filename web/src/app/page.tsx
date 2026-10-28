import Link from "next/link";
import { MapPin, Plus, Smartphone } from "lucide-react";
import {
  ButtonLink,
  Card,
  CardHeader,
  CardList,
  EmptyState,
  IconTile,
  ListRow,
  NAV_ICONS,
  Page,
  PageHeader,
  SectionHeader,
  Stat,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateShort, formatDistance, formatDuration, formatTime } from "@/lib/format";
import { getOverview } from "@/lib/overview";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const user = await requireUser();
  const tz = user.timezone;
  const { totals, months, topPlaces, recent } = await getOverview(user.id, tz);

  const totalKm = totals.distance / 1000;
  const maxMonth = Math.max(1, ...months.map((m) => m.distance));
  const fmtMonth = (y: number, m: number) =>
    new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }).slice(0, 3);

  const empty = totals.points === 0;
  const range =
    totals.first && totals.last
      ? `${formatDateShort(totals.first, tz)} – ${formatDateShort(totals.last, tz)}`
      : "No location history yet";
  const maxHours = Math.max(1, ...topPlaces.map((p) => p.hours));

  return (
    <Page>
      <PageHeader
        title="Overview"
        subtitle={range}
        actions={
          !empty && (
            <ButtonLink href="/timeline" icon={NAV_ICONS.timeline}>
              Open timeline
            </ButtonLink>
          )
        }
      />

      {empty ? (
        <EmptyState
          icon={Smartphone}
          title="No location history yet"
          description="Pair your phone and Matka starts recording. Visits, trips and places show up here after the first day."
          action={
            <ButtonLink href="/devices" variant="primary" icon={Plus}>
              Pair a device
            </ButtonLink>
          }
        />
      ) : (
        <>
          <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Distance travelled" value={`${Math.round(totalKm).toLocaleString("en-GB")} km`} />
            <Stat label="Days tracked" value={totals.days.toLocaleString("en-GB")} />
            <Stat label="Visits" value={totals.visits.toLocaleString("en-GB")} />
            <Stat label="Location points" value={totals.points.toLocaleString("en-GB")} />
          </section>

          <section className="mt-4 grid gap-4 md:grid-cols-5">
            <Card className="md:col-span-3">
              <CardHeader title="Distance by month" description="Last 12 months" />
              <div className="flex h-44 items-stretch gap-1.5 sm:gap-2" role="list" aria-label="Distance by month">
                {months.map((m) => {
                  const h = (m.distance / maxMonth) * 100;
                  const label = `${fmtMonth(m.year, m.month)}: ${formatDistance(m.distance)}`;
                  return (
                    <div key={`${m.year}-${m.month}`} role="listitem" aria-label={label} className="group flex flex-1 flex-col items-center gap-2">
                      <div className="flex w-full flex-1 items-end">
                        {m.distance > 0 ? (
                          <div
                            className="w-full rounded-t-[3px] bg-primary/75 transition-colors group-hover:bg-primary"
                            style={{ height: `${Math.max(2, h)}%` }}
                            title={label}
                          />
                        ) : (
                          <div className="h-px w-full bg-border" />
                        )}
                      </div>
                      <span className="text-caption leading-none text-muted">{fmtMonth(m.year, m.month)}</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader
                title="Most time spent"
                action={
                  <Link href="/places" className="font-medium text-primary hover:underline">
                    All places
                  </Link>
                }
              />
              {topPlaces.length === 0 ? (
                <p className="text-meta text-muted">Places appear after your first longer stays.</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {topPlaces.slice(0, 6).map((p) => (
                    <li key={p.id}>
                      <Link href={`/places/${p.id}`} className="group block rounded-sm">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-sm text-text group-hover:text-primary">
                            {p.name ?? "Unknown place"}
                          </span>
                          <span className="shrink-0 text-meta tabular-nums text-muted">
                            {Math.round(p.hours).toLocaleString("en-GB")} h
                          </span>
                        </div>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full bg-primary/60" style={{ width: `${(p.hours / maxHours) * 100}%` }} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </section>

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
              <EmptyState icon={MapPin} title="No visits yet" description="Stays of a few minutes or more show up here." />
            ) : (
              <CardList>
                {recent.map((v) => (
                  <ListRow
                    key={v.id}
                    href={`/places/${v.placeId}`}
                    leading={<IconTile icon={MapPin} size="sm" />}
                    title={v.name ?? <span className="text-muted">Unknown place</span>}
                    meta={`${formatDateShort(v.startedAt, tz)} · ${formatTime(v.startedAt, tz)}`}
                    trailing={formatDuration(v.duration)}
                  />
                ))}
              </CardList>
            )}
          </section>
        </>
      )}
    </Page>
  );
}
