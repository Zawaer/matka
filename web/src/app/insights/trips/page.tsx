import Link from "next/link";
import { House, Luggage } from "lucide-react";
import { EmptyState, Page, SectionHeader, cardClass, cx } from "@/components/ui";
import { InsightsHeader } from "@/components/insights/InsightsHeader";
import { ModeChips } from "@/components/insights/charts";
import { COVER_BACKDROP, CoverPhoto, CoverScrim } from "@/components/insights/Cover";
import { requireUser } from "@/lib/auth";
import { type Cover, getCovers } from "@/lib/covers";
import { formatDateRange, formatKm } from "@/lib/format";
import { type AwayTrip, joinNames } from "@/lib/insights/awayTrips";
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
    <Page width="wide">
      <InsightsHeader active="trips" subtitle="Nights spent more than 30 km from home, found automatically." />

      {home && home.saved.length > 0 ? (
        <p className="mb-6 flex items-start gap-2 text-meta text-muted">
          <House size={16} strokeWidth={1.75} aria-hidden className="mt-px shrink-0" />
          <span>
            Home: <span className="text-text">{joinNames(home.saved)}</span> (saved places), where you spent{" "}
            {home.nights} nights.
          </span>
        </p>
      ) : home ? (
        <p className="mb-6 flex items-start gap-2 text-meta text-muted">
          <House size={16} strokeWidth={1.75} aria-hidden className="mt-px shrink-0" />
          <span>
            Home: <span className="text-text">{home.city ?? "your most frequent night spot"}</span>, where you spent{" "}
            {home.nights} nights.{" "}
            <Link href="/places" className="font-medium text-primary hover:underline">
              Save your homes
            </Link>{" "}
            to set it yourself.
          </span>
        </p>
      ) : null}

      {trips.length === 0 ? (
        <EmptyState
          icon={Luggage}
          title="No trips yet"
          description="A trip appears once you have spent a night more than 30 km from home."
        />
      ) : (
        [...years].map(([year, list]) => (
          <section key={year} className="mb-8">
            <SectionHeader
              title={year}
              action={
                <span className="text-meta tabular-nums text-muted">
                  {list.length} {list.length === 1 ? "trip" : "trips"}
                </span>
              }
            />
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
    </Page>
  );
}

function Distance({ trip: t, onPhoto }: { trip: AwayTrip; onPhoto?: boolean }) {
  return (
    <div className="shrink-0 text-right">
      <p className={`text-label font-semibold tabular-nums ${onPhoto ? "" : "text-text"}`}>{formatKm(t.distance)}</p>
      <p className={`text-meta tabular-nums ${onPhoto ? "text-white/80" : "text-muted"}`}>
        {t.days} {t.days === 1 ? "day" : "days"} · {t.nights} {t.nights === 1 ? "night" : "nights"}
      </p>
    </div>
  );
}

function Dates({ trip: t, className }: { trip: AwayTrip; className: string }) {
  return (
    <p className={`text-meta ${className}`}>
      {formatDateRange(t.startDate, t.endDate)}
      {t.arrival == null && " · ongoing"}
    </p>
  );
}

function PlainCard({ trip: t }: { trip: AwayTrip }) {
  return (
    <Link
      href={`/insights/trips/${t.id}`}
      className={cx(cardClass({ interactive: true, padding: "sm" }), "group flex h-full flex-col gap-3 px-4 py-3.5")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-label text-text group-hover:text-primary">{t.name}</h3>
          <Dates trip={t} className="text-muted" />
        </div>
        <Distance trip={t} />
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <ModeChips modes={t.modes} max={3} />
        {t.countries.length > 0 && <span className="text-meta text-muted">{t.countries.join(", ")}</span>}
      </div>
    </Link>
  );
}

/** Google Trips style: the cover fills the top, title and dates over its scrim. */
function PhotoCard({ trip: t, cover }: { trip: AwayTrip; cover: Cover | undefined }) {
  return (
    <Link
      href={`/insights/trips/${t.id}`}
      className={cx(cardClass({ interactive: true, padding: "none" }), "group flex h-full flex-col overflow-hidden")}
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
            <h3 className="text-heading leading-snug">{t.name}</h3>
            <Dates trip={t} className="text-white/85" />
          </div>
          <Distance trip={t} onPhoto />
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <ModeChips modes={t.modes} max={3} />
        {t.countries.length > 0 && <span className="text-meta text-muted">{t.countries.join(", ")}</span>}
      </div>
    </Link>
  );
}
