import Link from "next/link";
import { InsightsHeader } from "@/components/insights/InsightsHeader";
import { Building2, ChevronRight, Earth, Flag } from "lucide-react";
import { BackLink, EmptyState, IconTile, Page, Segmented, Stat, cardClass, cx } from "@/components/ui";
import { COVER_BACKDROP, CoverPhoto } from "@/components/insights/Cover";
import { requireUser } from "@/lib/auth";
import { getCovers } from "@/lib/covers";
import { formatDateCompact, formatLongDuration } from "@/lib/format";
import { cityCoverSpecs, cityKey } from "@/lib/insights/coverSpecs";
import { getWorld } from "@/lib/insights/load";
import { type WorldEntry, type WorldSort, isWorldSort } from "@/lib/insights/world";

export const dynamic = "force-dynamic";

export const metadata = { title: "World · Matka" };

const SORT_LABEL: Record<WorldSort, string> = {
  visits: "Visits",
  places: "Places",
  time: "Time",
  recent: "Recent",
  name: "A–Z",
};

const COVER_ROWS = 60;

type Params = { view?: string; sort?: string; country?: string };

function href(p: Params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) sp.set(k, v);
  const s = sp.toString();
  return `/insights/world${s ? `?${s}` : ""}`;
}

export default async function WorldPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const tz = user.timezone;
  const sp = await searchParams;
  const sort: WorldSort = isWorldSort(sp.sort) ? sp.sort : "visits";
  const country = sp.country || undefined;
  const view = country || sp.view === "cities" ? "cities" : "countries";
  const world = await getWorld(user, sort);

  const cities = country ? world.cities.filter((c) => c.country === country) : world.cities;
  const list = view === "cities" ? cities : world.countries;

  // City thumbnails for the first rows (the rest of a long list goes without).
  const coverCities = view === "cities" ? cities.slice(0, COVER_ROWS) : [];
  const covers = coverCities.length
    ? await cityCoverSpecs(user.id, coverCities)
        .then((specs) => getCovers(user.id, [...specs.values()]))
        .catch(() => new Map())
    : new Map();

  const sortParam = (s: WorldSort) => (s === "visits" ? undefined : s);

  return (
    <Page width="wide">
      <InsightsHeader active="world" subtitle="The cities and countries your places are in." />

      <section aria-label="World totals" className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Countries" value={String(world.countries.length)} />
        <Stat label="Cities" value={String(world.cities.length)} />
        <Stat
          className="col-span-2 md:col-span-1"
          label="Places"
          value={world.cities.reduce((a, c) => a + c.places, 0).toLocaleString("en-GB")}
        />
      </section>

      <section className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          label="Show"
          value={view}
          className="self-start"
          items={(["countries", "cities"] as const).map((v) => ({
            key: v,
            label: v === "cities" ? "Cities" : "Countries",
            href: href({ view: v === "cities" ? "cities" : undefined, sort: sortParam(sort) }),
          }))}
        />
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <span className="shrink-0 text-meta text-muted">Sort by</span>
          <Segmented
            label="Sort by"
            size="sm"
            value={sort}
            items={(Object.keys(SORT_LABEL) as WorldSort[]).map((s) => ({
              key: s,
              label: SORT_LABEL[s],
              href: href({ view: view === "cities" && !country ? "cities" : undefined, country, sort: sortParam(s) }),
            }))}
          />
        </div>
      </section>

      {country && (
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <BackLink href={href({ sort: sortParam(sort) })} className="mb-0">
            All countries
          </BackLink>
          <h2 className="text-heading text-text">Cities in {country}</h2>
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState
          className="mt-4"
          icon={Earth}
          title="No cities yet"
          description="They appear as places get their addresses from the geocoder."
        />
      ) : (
        <ul className={cx(cardClass({ padding: "none" }), "mt-4 divide-y divide-border overflow-hidden")}>
          {list.map((e) => (
            <li key={`${e.name}/${e.country ?? ""}`}>
              <Row
                entry={e}
                tz={tz}
                href={
                  view === "cities"
                    ? `/insights/world/city?name=${encodeURIComponent(e.name)}${e.country ? `&country=${encodeURIComponent(e.country)}` : ""}`
                    : href({ country: e.name, sort: sortParam(sort) })
                }
                isCity={view === "cities"}
                showCountry={view === "cities" && !country}
                thumb={covers.size > 0 ? (covers.get(cityKey(e.name, e.country))?.assetId ?? null) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
      {world.unplaced > 0 && (
        <p className="mt-3 text-caption text-muted">
          {world.unplaced} {world.unplaced === 1 ? "place has" : "places have"} no address yet.
        </p>
      )}
    </Page>
  );
}

function Row({
  entry: e,
  tz,
  href,
  isCity,
  showCountry,
  thumb,
}: {
  entry: WorldEntry;
  tz: string;
  href: string;
  isCity: boolean;
  showCountry: boolean;
  /** Cover asset id; null or undefined for none. */
  thumb?: string | null;
}) {
  const counts = [
    e.cities != null ? `${e.cities} ${e.cities === 1 ? "city" : "cities"}` : null,
    `${e.places} ${e.places === 1 ? "place" : "places"}`,
    `${e.visits.toLocaleString("en-GB")} ${e.visits === 1 ? "visit" : "visits"}`,
  ].filter(Boolean);
  return (
    <Link href={href} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60 sm:px-5">
      {thumb ? (
        <div aria-hidden className={`relative size-9 shrink-0 overflow-hidden rounded-control ${COVER_BACKDROP}`}>
          <CoverPhoto assetId={thumb} size="thumbnail" />
        </div>
      ) : (
        <IconTile icon={isCity ? Building2 : Flag} />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-label text-text">
          {e.name}
          {showCountry && e.country && <span className="font-normal text-muted"> · {e.country}</span>}
        </p>
        <p className="truncate text-meta text-muted">{counts.join(" · ")}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-label tabular-nums text-text">{formatLongDuration(e.duration)}</p>
        <p className="text-meta text-muted">Last {formatDateCompact(e.lastVisit, tz)}</p>
      </div>
      <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="-mr-1 hidden shrink-0 text-muted sm:block" />
    </Link>
  );
}
