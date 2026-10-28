import { EscapeBack } from "@/components/EscapeBack";
import { notFound } from "next/navigation";
import { Building2 } from "lucide-react";
import { BackLink, IconTile, Page, PageHeader, SectionHeader, Stat } from "@/components/ui";
import { PlaceCard } from "@/components/places/PlaceCard";
import { CoverHeader } from "@/components/insights/Cover";
import { requireUser } from "@/lib/auth";
import { getCovers } from "@/lib/covers";
import { formatDateShort, formatLongDuration } from "@/lib/format";
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
  const subtitle = `${country ? `${country} · ` : ""}last visited ${formatDateShort(last, user.timezone)}`;
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
          leading={<IconTile icon={Building2} size="lg" />}
          title={name}
          subtitle={subtitle}
        />
      )}

      <section aria-label="City totals" className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Places" value={String(places.length)} />
        <Stat label="Visits" value={visits.toLocaleString("en-GB")} />
        <Stat className="col-span-2 md:col-span-1" label="Time spent" value={formatLongDuration(time)} />
      </section>

      <SectionHeader title="Places" className="mt-8" />
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {places.map((p) => (
          <PlaceCard key={p.id} place={p} />
        ))}
      </section>
    </Page>
  );
}
