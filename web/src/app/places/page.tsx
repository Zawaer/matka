import { requireUser } from "@/lib/auth";
import Link from "next/link";
import { MapPin, MapPinPlus, Smartphone } from "lucide-react";
import { ButtonLink, Callout, EmptyState, Page, PageHeader, SectionHeader } from "@/components/ui";
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
    <Page width="wide">
      <PageHeader
        title="Places"
        subtitle="Where you spend your time, with photos from each visit."
        actions={
          <ButtonLink href="/map?save=1" icon={MapPinPlus}>
            Save a place on the map
          </ButtonLink>
        }
      />

      {failed ? (
        <Callout tone="danger" title="Couldn't load places" role="alert">
          Something went wrong talking to the database. Please try again.
        </Callout>
      ) : places.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No places yet"
          description="Places appear once Matka has spotted somewhere you stayed for a while. Pair your phone under Devices, or import your history in Settings."
          action={
            <ButtonLink href="/devices" variant="primary" icon={Smartphone}>
              Pair a device
            </ButtonLink>
          }
        />
      ) : (
        <PlaceSearch initialQuery={initialQuery}>
          {saved.length > 0 ? (
            <PlaceSection title="Saved" count={saved.length} places={saved} />
          ) : (
            <Callout className="mb-6">
              Open a place and save it as Home, Family, School or Work, or{" "}
              <Link href="/map?save=1" className="font-medium text-primary hover:underline">
                save one on the map
              </Link>
              .
            </Callout>
          )}
          <PlaceSection title={saved.length ? "Everywhere else" : null} count={rest.length} places={rest} />
        </PlaceSearch>
      )}
    </Page>
  );
}

function PlaceSection({ title, count, places }: { title: string | null; count: number; places: PlaceListItem[] }) {
  if (places.length === 0) return null;
  return (
    <section className="mb-8">
      {title && (
        <SectionHeader
          title={
            <>
              {title} <span className="ml-1 font-normal tabular-nums text-muted">{count}</span>
            </>
          }
        />
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {places.map((p) => (
          <PlaceCard key={p.id} place={p} />
        ))}
      </div>
    </section>
  );
}
