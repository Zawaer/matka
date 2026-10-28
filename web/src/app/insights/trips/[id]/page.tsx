import Link from "next/link";
import { EscapeBack } from "@/components/EscapeBack";
import { notFound } from "next/navigation";
import { Building2, ChevronRight } from "lucide-react";
import { ModeBars, ModeChips } from "@/components/insights/charts";
import {
  BackLink,
  Card,
  CardHeader,
  IconTile,
  ListRow,
  Page,
  PageHeader,
  SectionHeader,
  Stat,
  cardClass,
  cx,
} from "@/components/ui";
import { CoverHeader, PhotoStrip } from "@/components/insights/Cover";
import { requireUser } from "@/lib/auth";
import { getCovers } from "@/lib/covers";
import { formatDateRange, formatDay, formatDuration, formatKm, formatTime } from "@/lib/format";
import { tripCoverSpec } from "@/lib/insights/coverSpecs";
import { getAwayTrips } from "@/lib/insights/load";

export const dynamic = "force-dynamic";

export const metadata = { title: "Trip · Matka" };

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const tz = user.timezone;
  const { id } = await params;
  const trip = (await getAwayTrips(user)).trips.find((t) => t.id === id);
  if (!trip) notFound();

  const away = trip.cities.filter((c) => c.away);
  const spec = tripCoverSpec(trip, tz);
  const cover = (await getCovers(user.id, [spec], { budgetMs: 4000 })).get(spec.key);
  const leftHome = (
    <>
      Left home {formatTime(new Date(trip.departure), tz)} on {formatDay(trip.startDate)}
      {trip.arrival != null
        ? `, back ${formatTime(new Date(trip.arrival), tz)} on ${formatDay(trip.endDate)}.`
        : ", still away."}
    </>
  );
  const dates = `${formatDateRange(trip.startDate, trip.endDate)}${trip.countries.length > 0 ? ` · ${trip.countries.join(", ")}` : ""}`;

  return (
    <Page width="wide">
      <EscapeBack fallback="/insights/trips" />

      {cover ? (
        <>
          <BackLink href="/insights/trips">Trips</BackLink>
          <CoverHeader assetId={cover.assetId}>
            <h1 className="text-title md:text-[2rem] md:leading-10">{trip.name}</h1>
            <p className="mt-1 text-sm text-white/90">{dates}</p>
            <p className="mt-1 hidden text-meta text-white/80 sm:block">{leftHome}</p>
          </CoverHeader>
          <p className="-mt-3 mb-4 text-meta text-muted sm:hidden">{leftHome}</p>
          <PhotoStrip ids={cover.more} />
        </>
      ) : (
        <PageHeader
          back={{ href: "/insights/trips", label: "Trips" }}
          title={trip.name}
          subtitle={
            <>
              {dates}
              <span className="mt-0.5 block text-meta">{leftHome}</span>
            </>
          }
        />
      )}

      <section aria-label="Trip totals" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Days" value={String(trip.days)} />
        <Stat label="Nights away" value={String(trip.nights)} />
        <Stat label="Distance" value={formatKm(trip.distance)} />
        <Stat label="Time on the move" value={formatDuration(trip.duration)} />
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-5">
        <Card className="md:col-span-3">
          <CardHeader title="How you travelled" />
          {trip.modes.length ? <ModeBars modes={trip.modes} /> : <p className="text-meta text-muted">No moves recorded.</p>}
        </Card>
        <Card className="md:col-span-2" padding="none">
          <div className="px-4 pt-4 sm:px-5 sm:pt-5">
            <CardHeader title="Cities visited" className="mb-2" />
          </div>
          {away.length === 0 ? (
            <p className="px-4 pb-4 text-meta text-muted sm:px-5 sm:pb-5">No named places yet.</p>
          ) : (
            <ul className="divide-y divide-border pb-1">
              {[...away]
                .sort((a, b) => b.duration - a.duration)
                .map((c) => (
                  <ListRow
                    key={c.city}
                    href={`/insights/world/city?name=${encodeURIComponent(c.city)}${c.country ? `&country=${encodeURIComponent(c.country)}` : ""}`}
                    leading={<IconTile icon={Building2} size="sm" />}
                    title={c.city}
                    meta={c.country ?? undefined}
                    trailing={formatDuration(c.duration)}
                    className="min-h-12"
                  />
                ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="mt-8">
        <SectionHeader title="Day by day" />
        <ol className={cx(cardClass({ padding: "none" }), "divide-y divide-border overflow-hidden")}>
          {trip.dayList.map((d, i) => (
            <li key={d.date}>
              <Link
                href={`/timeline?date=${d.date}`}
                className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-2/60 sm:px-5"
              >
                <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-control bg-surface-2 text-secondary">
                  <span className="text-caption font-medium uppercase leading-none tracking-wide text-muted">Day</span>
                  <span className="text-label font-semibold leading-tight tabular-nums">{i + 1}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="text-label text-text">{formatDay(d.date)}</span>
                    <span className="shrink-0 text-label font-semibold tabular-nums text-text md:hidden">
                      {formatKm(d.distance)}
                    </span>
                  </p>
                  <p className="truncate text-meta text-muted">{d.cities.length ? d.cities.join(" · ") : "—"}</p>
                  <div className="mt-2 md:hidden">
                    <ModeChips modes={d.modes} max={3} />
                  </div>
                </div>
                <div className="hidden shrink-0 items-center gap-4 md:flex">
                  <ModeChips modes={d.modes} max={3} />
                  <span className="w-20 text-right text-label font-semibold tabular-nums text-text">{formatKm(d.distance)}</span>
                </div>
                <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="-mr-1 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </Page>
  );
}
