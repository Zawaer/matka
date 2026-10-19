import Link from "next/link";
import { notFound } from "next/navigation";
import { Stat } from "@/components/insights/charts";
import { PlaceCard } from "@/components/places/PlaceCard";
import { requireUser } from "@/lib/auth";
import { formatDateShort, formatLongDuration } from "@/lib/format";
import { getCity } from "@/lib/insights/load";

export const dynamic = "force-dynamic";

export const metadata = { title: "City · Matka" };

export default async function CityPage({ searchParams }: { searchParams: Promise<{ name?: string; country?: string }> }) {
  const user = await requireUser();
  const { name, country } = await searchParams;
  if (!name) notFound();
  const places = await getCity(user, name, country || null);
  if (places.length === 0) notFound();

  const visits = places.reduce((a, p) => a + p.visitCount, 0);
  const time = places.reduce((a, p) => a + p.totalTime, 0);
  const last = places.map((p) => p.lastVisit).filter(Boolean).sort().at(-1) ?? null;
  const backHref = country ? `/insights/world?country=${encodeURIComponent(country)}` : "/insights/world?view=cities";

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-10">
      <Link href={backHref} className="mb-6 inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-text">
        ← {country ? `Cities in ${country}` : "Cities"}
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{name}</h1>
        <p className="mt-1 text-muted">
          {country ? `${country} · ` : ""}last visited {formatDateShort(last, user.timezone)}
        </p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Places" value={String(places.length)} />
        <Stat label="Visits" value={visits.toLocaleString("en-GB")} accent />
        <div className="col-span-2 md:col-span-1">
          <Stat label="Time spent" value={formatLongDuration(time)} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {places.map((p) => (
          <PlaceCard key={p.id} place={p} />
        ))}
      </section>
    </div>
  );
}
