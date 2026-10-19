import Link from "next/link";
import { InsightsHeader } from "@/components/insights/InsightsHeader";
import { ModeChips } from "@/components/insights/charts";
import { requireUser } from "@/lib/auth";
import { formatDateRange, formatKm } from "@/lib/format";
import { getAwayTrips } from "@/lib/insights/load";

export const dynamic = "force-dynamic";

export const metadata = { title: "Trips · Matka" };

export default async function TripsPage() {
  const user = await requireUser();
  const { home, trips } = await getAwayTrips(user);

  const years = new Map<string, typeof trips>();
  for (const t of trips) {
    const y = t.startDate.slice(0, 4);
    years.set(y, [...(years.get(y) ?? []), t]);
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-10">
      <InsightsHeader active="trips" subtitle="Nights spent more than 30 km from home, found automatically." />

      {home && (
        <p className="mb-5 text-sm text-muted">
          Home: <span className="text-text">{home.city ?? "your most frequent night spot"}</span>, where you spent{" "}
          {home.nights} nights.
        </p>
      )}

      {trips.length === 0 ? (
        <div className="mk-card px-6 py-14 text-center text-sm text-muted">
          No trips yet. A trip appears once you have spent a night away from home.
        </div>
      ) : (
        [...years].map(([year, list]) => (
          <section key={year} className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-muted">
              {year} · {list.length} {list.length === 1 ? "trip" : "trips"}
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {list.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/insights/trips/${t.id}`}
                    className="mk-card group flex h-full flex-col gap-3 p-4 transition-colors hover:border-primary/60"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-medium group-hover:text-primary">{t.name}</h3>
                        <p className="text-sm text-muted">
                          {formatDateRange(t.startDate, t.endDate)}
                          {t.arrival == null && " · ongoing"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold tabular-nums">{formatKm(t.distance)}</p>
                        <p className="text-xs text-muted">
                          {t.days} {t.days === 1 ? "day" : "days"} · {t.nights} {t.nights === 1 ? "night" : "nights"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                      <ModeChips modes={t.modes} max={3} />
                      {t.countries.length > 0 && <span className="text-xs text-muted">{t.countries.join(", ")}</span>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
