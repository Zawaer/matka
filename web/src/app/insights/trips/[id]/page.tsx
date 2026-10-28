import Link from "next/link";
import { EscapeBack } from "@/components/EscapeBack";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ModeBars, ModeChips } from "@/components/insights/charts";
import {
  BackLink,
  Card,
  CardHeader,
  ListRow,
  Page,
  PageHeader,
  SectionHeader,
  StatStrip,
  cardClass,
  cx,
} from "@/components/ui";
import { CoverHeader, PhotoStrip } from "@/components/insights/Cover";
import { LazyGeoMap } from "@/components/map/LazyGeoMap";
import { requireUser } from "@/lib/auth";
import { getCovers } from "@/lib/covers";
import { q } from "@/lib/db";
import { formatDateRange, formatDay, formatKm, formatLongDuration, formatTime } from "@/lib/format";
import { tripCoverSpec } from "@/lib/insights/coverSpecs";
import { getAwayTrips } from "@/lib/insights/load";
import { loadOvernights, tripWindow } from "@/lib/insights/routeSketch";

export const dynamic = "force-dynamic";

export const metadata = { title: "Trip · Matka" };

/** Cities where every place visited in the window is an airport (a layover, not a destination). */
async function airportCities(userId: string, from: number, to: number): Promise<Set<string>> {
  const rows = await q<{ city: string; country: string | null }>(
    `SELECT p.city, p.country
     FROM visits v JOIN places p ON p.id = v.place_id
     WHERE v.user_id = $1 AND v.ended_at > to_timestamp($2 / 1000.0) AND v.started_at < to_timestamp($3 / 1000.0)
       AND p.city IS NOT NULL
     GROUP BY p.city, p.country
     HAVING bool_and(COALESCE(p.category, '') IN ('aerodrome', 'airport', 'terminal', 'apron'))`,
    [userId, from, to],
  );
  return new Set(rows.map((r) => `${r.city}\u0000${r.country ?? ""}`));
}

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const tz = user.timezone;
  const { id } = await params;
  const trip = (await getAwayTrips(user)).trips.find((t) => t.id === id);
  if (!trip) notFound();

  const [from, to] = tripWindow(trip, tz);
  const spec = tripCoverSpec(trip, tz);
  const [covers, nights, airports] = await Promise.all([
    getCovers(user.id, [spec], { budgetMs: 4000 }),
    loadOvernights(user.id, [[from, to]], tz).catch(() => [[]]),
    airportCities(user.id, from, to).catch(() => new Set<string>()),
  ]);
  const cover = covers.get(spec.key);
  // A short stop at an airport isn't a city you visited.
  const away = trip.cities
    .filter((c) => c.away && !(c.duration < 4 * 3600 && airports.has(`${c.city}\u0000${c.country ?? ""}`)))
    .sort((a, b) => b.duration - a.duration);

  const leftHome =
    `${trip.days} ${trip.days === 1 ? "day" : "days"}, ${trip.nights} ${trip.nights === 1 ? "night" : "nights"} away. ` +
    `Left home ${formatTime(new Date(trip.departure), tz)} on ${formatDay(trip.startDate)}` +
    (trip.arrival != null ? `, back ${formatTime(new Date(trip.arrival), tz)} on ${formatDay(trip.endDate)}.` : ", still away.");
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

      <LazyGeoMap
        label={`Map of the routes of the trip to ${trip.name}`}
        window={{ from: from / 1000, to: to / 1000 }}
        points={nights[0].map((n, i) => ({ lat: n.lat, lon: n.lon, num: i + 1, label: n.name ?? undefined }))}
        className="mb-4 h-64 md:h-[420px]"
      />

      <StatStrip
        items={[
          { label: "Distance", value: formatKm(trip.distance) },
          { label: "Time on the move", value: formatLongDuration(trip.duration) },
        ]}
      />

      <section className="mt-4 grid items-start gap-4 md:grid-cols-5">
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
              {away.map((c) => (
                <ListRow
                  key={`${c.city}/${c.country ?? ""}`}
                  href={`/insights/world/city?name=${encodeURIComponent(c.city)}${c.country ? `&country=${encodeURIComponent(c.country)}` : ""}`}
                  title={c.city}
                  meta={c.country ?? undefined}
                  trailing={formatLongDuration(c.duration)}
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
                className="group flex items-start gap-4 px-4 py-3.5 transition-colors hover:bg-surface-2/60 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="text-label text-text">
                      Day <span className="tabular-nums">{i + 1}</span>
                      <span className="font-normal text-muted"> · </span>
                      {formatDay(d.date)}
                    </span>
                    <span className="shrink-0 text-label font-semibold tabular-nums text-text md:hidden">
                      {formatKm(d.distance)}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate text-meta text-muted">{d.cities.length ? d.cities.join(" · ") : "No named places"}</p>
                  <div className="mt-2 md:hidden">
                    <ModeChips modes={d.modes} max={3} />
                  </div>
                </div>
                <div className="hidden shrink-0 items-center gap-4 md:flex">
                  <ModeChips modes={d.modes} max={3} />
                  <span className="w-20 text-right text-label font-semibold tabular-nums text-text">{formatKm(d.distance)}</span>
                </div>
                <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="-mr-1 mt-0.5 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </Page>
  );
}
