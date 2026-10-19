import { requireUser } from "@/lib/auth";
import Link from "next/link";
import { type PlaceListItem, getPlaces } from "@/lib/places";
import { PlaceCard } from "@/components/places/PlaceCard";
import { PlaceSearch } from "@/components/places/PlaceSearch";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Places — Matka",
};

export default async function PlacesPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const user = await requireUser();
  const { q } = await searchParams;
  const initialQuery = (Array.isArray(q) ? q[0] : q) ?? "";
  let places = [] as Awaited<ReturnType<typeof getPlaces>>;
  let failed = false;
  try {
    places = await getPlaces(user.id);
  } catch (err) {
    console.error("[places] load failed:", err);
    failed = true;
  }

  // getPlaces lists saved places first.
  const saved = places.filter((p) => p.kind);
  const rest = places.filter((p) => !p.kind);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
        <h1 className="text-3xl font-semibold tracking-tight">Places</h1>
        <p className="mt-1 text-muted">
          Where you spend your time — with photos from each visit.
        </p>
        </div>
        <Link
          href="/map?save=1"
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:border-primary/60 hover:text-text"
        >
          + Save a place on the map
        </Link>
      </header>

      {failed ? (
        <div className="mk-card p-8 text-center">
          <p className="text-muted">
            Couldn&apos;t load places right now. Please try again.
          </p>
        </div>
      ) : places.length === 0 ? (
        <EmptyState />
      ) : (
        <PlaceSearch initialQuery={initialQuery}>
          {saved.length > 0 ? (
            <PlaceSection title="Saved" count={saved.length} places={saved} />
          ) : (
            <p className="mb-6 text-sm text-muted">
              Tip: open a place and save it as Home, Family, School or Work — or{" "}
              <Link href="/map?save=1" className="text-primary hover:underline">
                save one on the map
              </Link>
              .
            </p>
          )}
          <PlaceSection title={saved.length ? "Everywhere else" : null} count={rest.length} places={rest} />
        </PlaceSearch>
      )}
    </div>
  );
}

function PlaceSection({ title, count, places }: { title: string | null; count: number; places: PlaceListItem[] }) {
  if (places.length === 0) return null;
  return (
    <section className="mb-8">
      {title && (
        <h2 className="mb-3 text-sm font-semibold text-muted">
          {title} · {count}
        </h2>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {places.map((p) => (
          <PlaceCard key={p.id} place={p} />
        ))}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="mk-card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="text-4xl" aria-hidden>
        🗺️
      </span>
      <h2 className="text-lg font-medium">No places yet</h2>
      <p className="max-w-md text-sm text-muted">
        Places appear once Matka has spotted somewhere you stayed for a while —
        pair your phone under Devices, or import your Dawarich history.
      </p>
    </div>
  );
}
