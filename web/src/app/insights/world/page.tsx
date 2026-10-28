import Link from "next/link";
import { InsightsHeader } from "@/components/insights/InsightsHeader";
import { SortMenu } from "@/components/insights/SortMenu";
import { ChevronRight, Earth } from "lucide-react";
import { BackLink, EmptyState, Page, Segmented, StatStrip, cardClass, cx } from "@/components/ui";
import { COVER_BACKDROP, CoverPhoto } from "@/components/insights/Cover";
import { LazyGeoMap } from "@/components/map/LazyGeoMap";
import { requireUser } from "@/lib/auth";
import { getCovers } from "@/lib/covers";
import { formatCount, formatLongDuration, formatRelativeInstant } from "@/lib/format";
import { cityCoverSpecs, cityKey } from "@/lib/insights/coverSpecs";
import { getWorld } from "@/lib/insights/load";
import { type WorldEntry, type WorldSort, countryCode, isWorldSort } from "@/lib/insights/world";

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

const cityHref = (e: Pick<WorldEntry, "name" | "country">) =>
  `/insights/world/city?name=${encodeURIComponent(e.name)}${e.country ? `&country=${encodeURIComponent(e.country)}` : ""}`;

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
  const empty = world.countries.length === 0 && world.cities.length === 0;
  const maxCity = Math.max(1, ...world.cities.map((c) => c.duration));

  return (
    <Page width="wide">
      <InsightsHeader active="world" subtitle="The cities and countries your places are in." />

      {empty ? (
        <EmptyState
          icon={Earth}
          title="No cities yet"
          description="Cities and countries appear once your places have addresses, a few minutes after they are first visited."
        />
      ) : (
        <>
          <LazyGeoMap
            label={`Map of the ${world.countries.length} countries you have visited`}
            countries={world.countries.map((c) => c.name)}
            points={world.cities.map((c) => ({
              lat: c.lat,
              lon: c.lon,
              weight: Math.sqrt(c.duration / maxCity),
              label: `${c.name} · ${formatLongDuration(c.duration)}`,
              href: cityHref(c),
            }))}
            padding={32}
            className="h-64 md:h-96"
          />

          <StatStrip
            className="mt-4"
            items={[
              { label: "Countries", value: formatCount(world.countries.length) },
              { label: "Cities", value: formatCount(world.cities.length) },
              { label: "Places", value: formatCount(world.cities.reduce((a, c) => a + c.places, 0)) },
            ]}
          />

          <div className="mt-8 flex items-center justify-between gap-3">
            <Segmented
              label="Show"
              value={view}
              size="sm"
              items={(["countries", "cities"] as const).map((v) => ({
                key: v,
                label: v === "cities" ? "Cities" : "Countries",
                href: href({ view: v === "cities" ? "cities" : undefined, sort: sortParam(sort) }),
              }))}
            />
            <SortMenu
              value={sort}
              options={(Object.keys(SORT_LABEL) as WorldSort[]).map((s) => ({
                key: s,
                label: SORT_LABEL[s],
                href: href({ view: view === "cities" && !country ? "cities" : undefined, country, sort: sortParam(s) }),
              }))}
            />
          </div>

          {country && (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
              <BackLink href={href({ sort: sortParam(sort) })} className="mb-0">
                All countries
              </BackLink>
              <h2 className="text-heading text-text">Cities in {country}</h2>
            </div>
          )}

          <ul className={cx(cardClass({ padding: "none" }), "mt-3 divide-y divide-border overflow-hidden")}>
            {list.map((e) => (
              <li key={`${e.name}/${e.country ?? ""}`}>
                <Row
                  entry={e}
                  tz={tz}
                  href={view === "cities" ? cityHref(e) : href({ country: e.name, sort: sortParam(sort) })}
                  isCity={view === "cities"}
                  showCountry={view === "cities" && !country}
                  thumb={covers.get(cityKey(e.name, e.country))?.assetId ?? null}
                />
              </li>
            ))}
          </ul>
        </>
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
  /** City cover asset id, or null. */
  thumb: string | null;
}) {
  const counts = [
    e.cities != null ? `${e.cities} ${e.cities === 1 ? "city" : "cities"}` : null,
    `${e.places} ${e.places === 1 ? "place" : "places"}`,
    `${formatCount(e.visits)} ${e.visits === 1 ? "visit" : "visits"}`,
  ].filter(Boolean);
  const code = isCity ? null : (countryCode(e.name) ?? e.name.slice(0, 2).toUpperCase());
  return (
    <Link href={href} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60 sm:px-5">
      {code ? (
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-control bg-surface-2 text-meta font-semibold tracking-wide text-secondary"
        >
          {code}
        </span>
      ) : thumb ? (
        <div aria-hidden className={`relative size-9 shrink-0 overflow-hidden rounded-control ${COVER_BACKDROP}`}>
          <CoverPhoto assetId={thumb} size="thumbnail" />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-label text-text">
          {e.name}
          {showCountry && e.country && <span className="font-normal text-muted"> · {e.country}</span>}
        </p>
        <p className="truncate text-meta text-muted">{counts.join(" · ")}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-label tabular-nums text-text">{formatLongDuration(e.duration)}</p>
        {e.lastVisit && (
          <p className="text-meta text-muted">
            <span className="sr-only">Last visit </span>
            {formatRelativeInstant(e.lastVisit, tz)}
          </p>
        )}
      </div>
      <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="-mr-1 hidden shrink-0 text-muted sm:block" />
    </Link>
  );
}
