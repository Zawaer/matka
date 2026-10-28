import Link from "next/link";
import { Luggage } from "lucide-react";
import { EmptyState, SectionHeader, Page } from "@/components/ui";
import { InsightsHeader } from "@/components/insights/InsightsHeader";
import { TripCard } from "@/components/insights/TripCard";
import { requireUser } from "@/lib/auth";
import { getCovers } from "@/lib/covers";
import { joinNames } from "@/lib/insights/awayTrips";
import { tripCoverSpec } from "@/lib/insights/coverSpecs";
import { getAwayTrips } from "@/lib/insights/load";
import { getRouteSketches } from "@/lib/insights/routeSketch";

export const dynamic = "force-dynamic";

export const metadata = { title: "Trips · Matka" };

export default async function TripsPage() {
  const user = await requireUser();
  const { home, trips } = await getAwayTrips(user);
  const [covers, sketches] = await Promise.all([
    getCovers(
      user.id,
      trips.map((t) => tripCoverSpec(t, user.timezone)),
    ),
    getRouteSketches(user, trips).catch((err) => {
      console.error("[trips] route sketches failed:", err);
      return new Map();
    }),
  ]);

  const years = new Map<string, typeof trips>();
  for (const t of trips) {
    const y = t.startDate.slice(0, 4);
    years.set(y, [...(years.get(y) ?? []), t]);
  }

  return (
    <Page width="wide">
      <InsightsHeader active="trips" subtitle="Nights spent more than 30 km from home, found automatically." />

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
                <span className="text-meta text-muted">
                  <span className="tabular-nums">{list.length}</span> {list.length === 1 ? "trip" : "trips"}
                </span>
              }
            />
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((t) => (
                <li key={t.id}>
                  <TripCard trip={t} cover={covers.get(`trip:${t.id}`)} sketch={sketches.get(t.id)} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {home && trips.length > 0 && (
        <p className="text-meta text-muted">
          Home is{" "}
          {home.saved.length > 0 ? (
            joinNames(home.saved)
          ) : (
            <>
              {home.city ?? "where you spend most nights"} (
              <Link href="/places" className="font-medium text-primary hover:underline">
                save your homes
              </Link>{" "}
              to set it yourself)
            </>
          )}
          , where you spent <span className="tabular-nums">{home.nights}</span> nights.
        </p>
      )}
    </Page>
  );
}
