import Link from "next/link";
import { notFound } from "next/navigation";
import { ModeBars, ModeChips, Stat } from "@/components/insights/charts";
import { requireUser } from "@/lib/auth";
import { formatDateRange, formatDay, formatDuration, formatKm, formatTime } from "@/lib/format";
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

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-10">
      <Link
        href="/insights/trips"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-text"
      >
        ← Trips
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{trip.name}</h1>
        <p className="mt-1 text-muted">
          {formatDateRange(trip.startDate, trip.endDate)}
          {trip.countries.length > 0 && ` · ${trip.countries.join(", ")}`}
        </p>
        <p className="mt-1 text-sm text-muted">
          Left home {formatTime(new Date(trip.departure), tz)} on {formatDay(trip.startDate)}
          {trip.arrival != null
            ? `, back ${formatTime(new Date(trip.arrival), tz)} on ${formatDay(trip.endDate)}.`
            : ", still away."}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Days" value={String(trip.days)} />
        <Stat label="Nights away" value={String(trip.nights)} />
        <Stat label="Distance" value={formatKm(trip.distance)} accent />
        <Stat label="Time on the move" value={formatDuration(trip.duration)} />
      </section>

      <section className="mt-5 grid gap-5 md:grid-cols-5">
        <div className="mk-card p-5 md:col-span-3">
          <h2 className="mb-4 text-sm font-semibold text-muted">How you travelled</h2>
          {trip.modes.length ? <ModeBars modes={trip.modes} /> : <p className="text-sm text-muted">No moves recorded.</p>}
        </div>
        <div className="mk-card p-5 md:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-muted">Cities visited</h2>
          {away.length === 0 ? (
            <p className="text-sm text-muted">No named places yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {[...away]
                .sort((a, b) => b.duration - a.duration)
                .map((c) => (
                  <li key={c.city}>
                    <Link
                      href={`/insights/world/city?name=${encodeURIComponent(c.city)}${c.country ? `&country=${encodeURIComponent(c.country)}` : ""}`}
                      className="block rounded-full border border-border bg-surface-2 px-3 py-1 text-sm hover:border-primary/60"
                    >
                      {c.city} <span className="text-muted">{formatDuration(c.duration)}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">Day by day</h2>
        <ol className="mk-card divide-y divide-border">
          {trip.dayList.map((d, i) => (
            <li key={d.date}>
              <Link
                href={`/timeline?date=${d.date}`}
                className="flex flex-col gap-2 px-5 py-4 hover:bg-surface-2 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex items-baseline justify-between gap-3 font-medium">
                    <span>
                      <span className="text-muted">Day {i + 1} · </span>
                      {formatDay(d.date)}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums md:hidden">{formatKm(d.distance)}</span>
                  </p>
                  <p className="truncate text-sm text-muted">{d.cities.length ? d.cities.join(" · ") : "—"}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3 md:justify-end">
                  <ModeChips modes={d.modes} max={3} />
                  <span className="hidden w-20 text-right text-sm font-semibold tabular-nums md:inline">
                    {formatKm(d.distance)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
