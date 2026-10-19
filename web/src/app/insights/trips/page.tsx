import Link from "next/link";
import { InsightsHeader } from "@/components/insights/InsightsHeader";
import { ModeChips } from "@/components/insights/charts";
import { COVER_BACKDROP, CoverPhoto, CoverScrim } from "@/components/insights/Cover";
import { requireUser } from "@/lib/auth";
import { type Cover, getCovers } from "@/lib/covers";
import { formatDateRange, formatKm } from "@/lib/format";
import type { AwayTrip } from "@/lib/insights/awayTrips";
import { tripCoverSpec } from "@/lib/insights/coverSpecs";
import { getAwayTrips } from "@/lib/insights/load";

export const dynamic = "force-dynamic";

export const metadata = { title: "Trips · Matka" };

export default async function TripsPage() {
  const user = await requireUser();
  const { home, trips } = await getAwayTrips(user);
  const covers = await getCovers(
    user.id,
    trips.map((t) => tripCoverSpec(t, user.timezone)),
  );
  // Photo cards once any trip has a photo; otherwise the plain cards.
  const photoCards = covers.size > 0;

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
                  {photoCards ? (
                    <PhotoCard trip={t} cover={covers.get(`trip:${t.id}`)} />
                  ) : (
                    <PlainCard trip={t} />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function Distance({ trip: t, onPhoto }: { trip: AwayTrip; onPhoto?: boolean }) {
  return (
    <div className="shrink-0 text-right">
      <p className="font-semibold tabular-nums">{formatKm(t.distance)}</p>
      <p className={`text-xs ${onPhoto ? "text-white/80" : "text-muted"}`}>
        {t.days} {t.days === 1 ? "day" : "days"} · {t.nights} {t.nights === 1 ? "night" : "nights"}
      </p>
    </div>
  );
}

function Dates({ trip: t, className }: { trip: AwayTrip; className: string }) {
  return (
    <p className={`text-sm ${className}`}>
      {formatDateRange(t.startDate, t.endDate)}
      {t.arrival == null && " · ongoing"}
    </p>
  );
}

function PlainCard({ trip: t }: { trip: AwayTrip }) {
  return (
    <Link
      href={`/insights/trips/${t.id}`}
      className="mk-card group flex h-full flex-col gap-3 p-4 transition-colors hover:border-primary/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium group-hover:text-primary">{t.name}</h3>
          <Dates trip={t} className="text-muted" />
        </div>
        <Distance trip={t} />
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <ModeChips modes={t.modes} max={3} />
        {t.countries.length > 0 && <span className="text-xs text-muted">{t.countries.join(", ")}</span>}
      </div>
    </Link>
  );
}

/** Google Trips style: the cover fills the top, title and dates over its scrim. */
function PhotoCard({ trip: t, cover }: { trip: AwayTrip; cover: Cover | undefined }) {
  return (
    <Link
      href={`/insights/trips/${t.id}`}
      className="mk-card group flex h-full flex-col overflow-hidden transition-colors hover:border-primary/60"
    >
      <div className={`relative aspect-[16/9] overflow-hidden ${COVER_BACKDROP}`}>
        {cover && (
          <CoverPhoto
            assetId={cover.assetId}
            className="transition-transform duration-300 group-hover:scale-[1.03]"
          />
        )}
        <CoverScrim />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white [text-shadow:0_1px_6px_rgb(0_0_0/0.5)]">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold leading-snug">{t.name}</h3>
            <Dates trip={t} className="text-white/85" />
          </div>
          <Distance trip={t} onPhoto />
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 p-3 px-4">
        <ModeChips modes={t.modes} max={3} />
        {t.countries.length > 0 && <span className="text-xs text-muted">{t.countries.join(", ")}</span>}
      </div>
    </Link>
  );
}
