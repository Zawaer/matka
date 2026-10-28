import { EscapeBack } from "@/components/EscapeBack";
import { notFound } from "next/navigation";
import { BackLink, Page, PageHeader, SectionHeader, StatStrip } from "@/components/ui";
import { PlaceList, PlaceRow } from "@/components/places/PlaceList";
import { placeTitle } from "@/components/places/category";
import { LazyGeoMap } from "@/components/map/LazyGeoMap";
import { CoverHeader } from "@/components/insights/Cover";
import { requireUser } from "@/lib/auth";
import { getCovers } from "@/lib/covers";
import { formatLongDuration, formatRelativeInstant } from "@/lib/format";
import { cityCoverSpecs, cityKey } from "@/lib/insights/coverSpecs";
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
  // Without a country in the link, the city's places decide which one it is.
  const coverCountry = country || places[0].country;
  const spec = (await cityCoverSpecs(user.id, [{ name, country: coverCountry }]).catch(() => null))?.get(
    cityKey(name, coverCountry),
  );
  const cover = spec ? (await getCovers(user.id, [spec], { budgetMs: 4000 })).get(spec.key) : undefined;
  const lastText = last ? formatRelativeInstant(last, user.timezone) : null;
  const subtitle = [
    country,
    lastText ? `last visited ${lastText === "Today" || lastText === "Yesterday" ? lastText.toLowerCase() : lastText}` : null,
  ]
    .filter(Boolean)
    .join(" · ")
    .replace(/^./, (c) => c.toUpperCase());
  const maxTime = Math.max(1, ...places.map((p) => p.totalTime));
  const sorted = [...places].sort((a, b) => b.totalTime - a.totalTime);
  const backHref = country ? `/insights/world?country=${encodeURIComponent(country)}` : "/insights/world?view=cities";

  return (
    <Page width="wide">
      <EscapeBack fallback={backHref} />
      {cover ? (
        <>
          <BackLink href={backHref}>{country ? `Cities in ${country}` : "Cities"}</BackLink>
          <CoverHeader assetId={cover.assetId}>
            <h1 className="text-title md:text-[2rem] md:leading-10">{name}</h1>
            <p className="mt-1 text-sm text-white/90">{subtitle}</p>
          </CoverHeader>
        </>
      ) : (
        <PageHeader
          back={{ href: backHref, label: country ? `Cities in ${country}` : "Cities" }}
          title={name}
          subtitle={subtitle}
        />
      )}

      <StatStrip
        items={[
          { label: "Places", value: String(places.length) },
          { label: "Visits", value: visits.toLocaleString("en-GB") },
          { label: "Time spent", value: formatLongDuration(time) },
        ]}
      />

      <LazyGeoMap
        label={`Map of your places in ${name}`}
        points={sorted.map((p) => ({
          lon: p.lon,
          lat: p.lat,
          label: placeTitle(p.name, p.category),
          weight: Math.sqrt(p.totalTime / maxTime),
          href: `/places/${p.id}`,
        }))}
        className="mt-4 h-60 md:h-96"
      />

      <SectionHeader title="Places" className="mt-8" />
      <PlaceList>
        {sorted.map((p) => (
          <PlaceRow key={p.id} place={p} showCity={false} />
        ))}
      </PlaceList>
    </Page>
  );
}
