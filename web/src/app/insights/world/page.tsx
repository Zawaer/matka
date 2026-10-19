import Link from "next/link";
import { InsightsHeader } from "@/components/insights/InsightsHeader";
import { Stat } from "@/components/insights/charts";
import { COVER_BACKDROP, CoverPhoto } from "@/components/insights/Cover";
import { requireUser } from "@/lib/auth";
import { getCovers } from "@/lib/covers";
import { formatDateShort, formatLongDuration } from "@/lib/format";
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

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-10">
      <InsightsHeader active="world" subtitle="The cities and countries your places are in." />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Countries" value={String(world.countries.length)} accent />
        <Stat label="Cities" value={String(world.cities.length)} />
        <div className="col-span-2 md:col-span-1">
          <Stat label="Places" value={world.cities.reduce((a, c) => a + c.places, 0).toLocaleString("en-GB")} />
        </div>
      </section>

      <section className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="mk-card flex gap-1 self-start p-1">
          {(["countries", "cities"] as const).map((v) => (
            <Link
              key={v}
              href={href({ view: v === "cities" ? "cities" : undefined, sort: sort === "visits" ? undefined : sort })}
              aria-current={v === view ? "page" : undefined}
              className={`rounded-[14px] px-4 py-1.5 text-sm font-medium capitalize ${
                v === view ? "bg-surface-2 text-primary" : "text-muted hover:text-text"
              }`}
            >
              {v}
            </Link>
          ))}
        </div>
        <div className="-mx-5 flex items-center gap-1.5 overflow-x-auto px-5 text-sm sm:mx-0 sm:px-0">
          <span className="mr-1 shrink-0 text-xs text-muted">Sort</span>
          {(Object.keys(SORT_LABEL) as WorldSort[]).map((s) => (
            <Link
              key={s}
              href={href({ view: view === "cities" && !country ? "cities" : undefined, country, sort: s === "visits" ? undefined : s })}
              aria-current={s === sort ? "true" : undefined}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs ${
                s === sort ? "border-primary/60 bg-surface-2 text-text" : "border-border text-muted hover:text-text"
              }`}
            >
              {SORT_LABEL[s]}
            </Link>
          ))}
        </div>
      </section>

      {country && (
        <p className="mt-4 text-sm">
          <Link href={href({ sort: sort === "visits" ? undefined : sort })} className="text-muted hover:text-text">
            ← All countries
          </Link>
          <span className="ml-2 font-medium">Cities in {country}</span>
        </p>
      )}

      {list.length === 0 ? (
        <div className="mk-card mt-4 px-6 py-14 text-center text-sm text-muted">
          No cities yet. They appear as places get their addresses from the geocoder.
        </div>
      ) : (
        <ul className="mk-card mt-4 divide-y divide-border">
          {list.map((e) => (
            <li key={`${e.name}/${e.country ?? ""}`}>
              <Row
                entry={e}
                tz={tz}
                href={
                  view === "cities"
                    ? `/insights/world/city?name=${encodeURIComponent(e.name)}${e.country ? `&country=${encodeURIComponent(e.country)}` : ""}`
                    : href({ country: e.name, sort: sort === "visits" ? undefined : sort })
                }
                showCountry={view === "cities" && !country}
                thumb={covers.size > 0 ? (covers.get(cityKey(e.name, e.country))?.assetId ?? null) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
      {world.unplaced > 0 && (
        <p className="mt-3 text-xs text-muted">
          {world.unplaced} {world.unplaced === 1 ? "place has" : "places have"} no address yet.
        </p>
      )}
    </div>
  );
}

function Row({
  entry: e,
  tz,
  href,
  showCountry,
  thumb,
}: {
  entry: WorldEntry;
  tz: string;
  href: string;
  showCountry: boolean;
  /** Cover asset id; null for an empty slot, undefined for no slot. */
  thumb?: string | null;
}) {
  const counts = [
    e.cities != null ? `${e.cities} ${e.cities === 1 ? "city" : "cities"}` : null,
    `${e.places} ${e.places === 1 ? "place" : "places"}`,
    `${e.visits.toLocaleString("en-GB")} ${e.visits === 1 ? "visit" : "visits"}`,
  ].filter(Boolean);
  return (
    <Link href={href} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-surface-2">
      {thumb !== undefined && (
        <div
          aria-hidden
          className={`relative -my-1 size-12 shrink-0 overflow-hidden rounded-xl ${thumb ? COVER_BACKDROP : "bg-surface-2"}`}
        >
          {thumb ? (
            <CoverPhoto assetId={thumb} size="thumbnail" />
          ) : (
            <svg viewBox="0 0 24 24" className="absolute inset-0 m-auto size-5 fill-muted/50">
              <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
            </svg>
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {e.name}
          {showCountry && e.country && <span className="font-normal text-muted"> · {e.country}</span>}
        </p>
        <p className="truncate text-xs text-muted">{counts.join(" · ")}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm tabular-nums">{formatLongDuration(e.duration)}</p>
        <p className="text-xs text-muted">Last {formatDateShort(e.lastVisit, tz)}</p>
      </div>
    </Link>
  );
}
