import { requireUser } from "@/lib/auth";
import { getPlaces } from "@/lib/places";
import { PlaceCard } from "@/components/places/PlaceCard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Places — Matka",
};

export default async function PlacesPage() {
  const user = await requireUser();
  let places = [] as Awaited<ReturnType<typeof getPlaces>>;
  let failed = false;
  try {
    places = await getPlaces(user.id);
  } catch (err) {
    console.error("[places] load failed:", err);
    failed = true;
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Places</h1>
        <p className="mt-1 text-muted">
          Where you spend your time — with photos from each visit.
        </p>
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
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {places.map((p) => (
            <PlaceCard key={p.id} place={p} />
          ))}
        </section>
      )}
    </div>
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
