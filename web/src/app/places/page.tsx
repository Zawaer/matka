import { requireUser } from "@/lib/auth";
import Link from "next/link";
import { ChevronRight, MapPin, MapPinPlus, Smartphone } from "lucide-react";
import { ButtonLink, Callout, EmptyState, Page, PageHeader, Segmented } from "@/components/ui";
import { type PlaceListItem, getPlaces } from "@/lib/places";
import { PlaceList, PlaceRow, isUnnamed } from "@/components/places/PlaceList";
import { PlaceSearch } from "@/components/places/PlaceSearch";
import { placeTitle } from "@/components/places/category";
import { formatCount } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Places — Matka",
};

const SORTS = {
  time: "Most time",
  visits: "Visits",
  recent: "Recent",
  name: "A–Z",
} as const;
type Sort = keyof typeof SORTS;
const isSort = (s: unknown): s is Sort => typeof s === "string" && s in SORTS;

function sortPlaces(list: PlaceListItem[], sort: Sort): PlaceListItem[] {
  const name = (p: PlaceListItem) => placeTitle(p.name, p.category);
  const by: Record<Sort, (a: PlaceListItem, b: PlaceListItem) => number> = {
    time: (a, b) => b.totalTime - a.totalTime,
    visits: (a, b) => b.visitCount - a.visitCount || b.totalTime - a.totalTime,
    recent: (a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""),
    name: (a, b) => name(a).localeCompare(name(b), "en"),
  };
  return [...list].sort(by[sort]);
}

export default async function PlacesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; sort?: string | string[] }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const initialQuery = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "";
  const rawSort = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort;
  const sort: Sort = isSort(rawSort) ? rawSort : "time";
  let places = [] as Awaited<ReturnType<typeof getPlaces>>;
  let failed = false;
  try {
    places = await getPlaces(user.id);
  } catch (err) {
    console.error("[places] load failed:", err);
    failed = true;
  }

  const sorted = sortPlaces(places, sort);
  const saved = sorted.filter((p) => p.kind);
  const unnamed = sorted.filter((p) => isUnnamed(p));
  const rest = sorted.filter((p) => !p.kind && !isUnnamed(p));

  return (
    <Page width="wide">
      <PageHeader
        title="Places"
        subtitle="Everywhere you have stayed for a while, and how much time you spent there."
        actions={
          places.length > 0 && (
            <ButtonLink href="/map?save=1" icon={MapPinPlus}>
              Save a place on the map
            </ButtonLink>
          )
        }
      />

      {failed ? (
        <Callout
          tone="danger"
          title="Couldn't load places"
          role="alert"
          action={
            <ButtonLink href="/places" size="sm">
              Retry
            </ButtonLink>
          }
        >
          Something went wrong on the server. Try again in a moment.
        </Callout>
      ) : places.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No places yet"
          description="Places appear once Matka has spotted somewhere you stayed for a while."
          action={
            <ButtonLink href="/devices" variant="primary" icon={Smartphone}>
              Pair your phone
            </ButtonLink>
          }
          secondary={<ButtonLink href="/settings#import">Import from Google Timeline</ButtonLink>}
        />
      ) : (
        <PlaceSearch initialQuery={initialQuery}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-meta text-muted">
              <span className="tabular-nums">{formatCount(places.length)}</span> places
            </p>
            <Segmented
              label="Sort places"
              size="sm"
              value={sort}
              items={(Object.keys(SORTS) as Sort[]).map((s) => ({
                key: s,
                label: SORTS[s],
                href: s === "time" ? "/places" : `/places?sort=${s}`,
              }))}
            />
          </div>

          {saved.length > 0 ? (
            <Group title="Saved" count={saved.length}>
              <PlaceList>
                {saved.map((p) => (
                  <PlaceRow key={p.id} place={p} />
                ))}
              </PlaceList>
            </Group>
          ) : (
            <Callout className="mb-6">
              Open a place and save it as Home, Family, School or Work, or{" "}
              <Link href="/map?save=1" className="font-medium text-primary hover:underline">
                save one on the map
              </Link>
              .
            </Callout>
          )}

          {rest.length > 0 && (
            <Group title={saved.length ? "Everywhere else" : null} count={rest.length}>
              <PlaceList>
                {rest.map((p) => (
                  <PlaceRow key={p.id} place={p} />
                ))}
              </PlaceList>
            </Group>
          )}

          {unnamed.length > 0 && (
            <details className="group mb-8">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-control py-1 text-heading text-text [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden
                  className="shrink-0 text-muted transition-transform group-open:rotate-90"
                />
                <span>
                  Unnamed places <span className="ml-1 font-normal tabular-nums text-muted">{unnamed.length}</span>
                </span>
              </summary>
              <p className="mb-3 mt-1 pl-6 text-meta text-muted">
                No name or address was found for these yet. Open one to name it.
              </p>
              <PlaceList>
                {unnamed.map((p) => (
                  <PlaceRow key={p.id} place={p} />
                ))}
              </PlaceList>
            </details>
          )}
        </PlaceSearch>
      )}
    </Page>
  );
}

function Group({ title, count, children }: { title: string | null; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      {title && (
        <h2 className="mb-3 text-heading text-text">
          {title} <span className="ml-1 font-normal tabular-nums text-muted">{count}</span>
        </h2>
      )}
      {children}
    </section>
  );
}
