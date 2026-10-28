import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { EscapeBack } from "@/components/EscapeBack";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import {
  formatDateShort,
  formatDuration,
  formatLongDuration,
  formatMonth,
  formatRelativeInstant,
  formatTime,
  localDate,
} from "@/lib/format";
import { placeCategoryLine, placeTitle } from "@/components/places/category";
import {
  Button,
  Callout,
  CardList,
  EmptyState,
  Field,
  IconTile,
  Input,
  ListRow,
  Page,
  PageHeader,
  SectionHeader,
  placeIconFor,
} from "@/components/ui";
import { LazyGeoMap } from "@/components/map/LazyGeoMap";
import { PhotoGallery } from "@/components/places/PhotoGallery";
import { PlaceDialog } from "@/components/places/PlaceDialog";
import { KindPicker, SizePicker } from "@/components/places/SavedFields";
import { visitsLabel } from "@/components/places/PlaceList";
import { PLACE_CATEGORY_SQL } from "@/lib/places";
import { DEFAULT_RADIUS_M, KIND_META, type PlaceKind } from "@/lib/savedPlaces";
import { renamePlace, savePlace, unsavePlace } from "./actions";

export const dynamic = "force-dynamic";

/** Visits shown before "Show all". */
const FIRST_VISITS = 10;
// Long histories: show the most recent visits, but count them all.
const VISIT_LIMIT = 200;

type PlaceRow = {
  id: string;
  custom_name: string | null;
  geo_name: string | null;
  ai_name: string | null;
  city: string | null;
  country: string | null;
  category: string | null;
  kind: PlaceKind | null;
  radius_m: number | null;
  lat: number;
  lon: number;
  visit_count: string;
  total_time: number;
  last_visit: Date | null;
};

type VisitRow = {
  id: string;
  started_at: Date;
  ended_at: Date;
  duration: number;
};

export default async function PlaceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ all?: string }>;
}) {
  const user = await requireUser();
  const tz = user.timezone;
  const { id } = await params;
  const showAll = (await searchParams).all === "1";
  if (!/^\d+$/.test(id)) notFound();

  const [place] = await q<PlaceRow>(
    `SELECT p.id, p.custom_name, p.geo_name, p.ai_name, p.city, p.country, ${PLACE_CATEGORY_SQL} AS category, p.kind, p.radius_m,
            ST_Y(p.geom::geometry) AS lat, ST_X(p.geom::geometry) AS lon,
            (SELECT count(*) FROM visits v WHERE v.place_id = p.id) AS visit_count,
            (SELECT COALESCE(sum(extract(epoch FROM v.ended_at - v.started_at)), 0)::float8
               FROM visits v WHERE v.place_id = p.id) AS total_time,
            (SELECT max(v.started_at) FROM visits v WHERE v.place_id = p.id) AS last_visit
     FROM places p WHERE p.id = $1 AND p.user_id = $2`,
    [id, user.id],
  );
  if (!place) notFound();

  const visits = await q<VisitRow>(
    `SELECT id, started_at, ended_at, extract(epoch FROM ended_at - started_at)::int AS duration
     FROM visits WHERE place_id = $1 ORDER BY started_at DESC LIMIT $2`,
    [id, showAll ? VISIT_LIMIT : FIRST_VISITS],
  );

  const visitCount = Number(place.visit_count);
  const shown = place.custom_name ?? place.ai_name ?? place.geo_name;
  const name = placeTitle(shown, place.category);
  const what = placeCategoryLine(shown, place.category);
  const locale = [place.city, place.country].filter(Boolean).join(", ");
  const meta = [place.kind ? KIND_META[place.kind].label : null, what, locale].filter(Boolean).join(" · ");
  const last = place.last_visit ? formatRelativeInstant(place.last_visit, tz) : null;
  const radius = place.radius_m ?? DEFAULT_RADIUS_M;

  // Visits by month, newest first.
  const months = new Map<string, VisitRow[]>();
  for (const v of visits) {
    const m = localDate(v.started_at, tz).slice(0, 7);
    months.set(m, [...(months.get(m) ?? []), v]);
  }

  return (
    <Page>
      <EscapeBack fallback="/places" />
      <PageHeader
        back={{ href: "/places", label: "Places" }}
        leading={
          <IconTile icon={placeIconFor(place.kind, place.category)} size="lg" />
        }
        title={name}
        subtitle={
          <>
            {meta && <span className="block">{meta}</span>}
            <span className="block tabular-nums">
              {[
                visitsLabel(visitCount),
                `${formatLongDuration(place.total_time)} in total`,
                last ? `last visited ${last === "Today" || last === "Yesterday" ? last.toLowerCase() : last}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </>
        }
        actions={
          place.kind ? (
            <PlaceDialog label="Edit" icon="edit" title="Saved place" description="Visits within its size count as this place.">
              <SaveForm place={place} />
            </PlaceDialog>
          ) : (
            <>
              <PlaceDialog label="Rename" icon="edit" title="Rename" description="Leave it empty to use the looked-up name.">
                <RenameForm place={place} />
              </PlaceDialog>
              <PlaceDialog
                label="Save place"
                icon="save"
                title="Save this place"
                description="Label it Home, Family, School… so visits nearby count as this place, and trips know your homes."
              >
                <SaveForm place={place} />
              </PlaceDialog>
            </>
          )
        }
      />
      {!place.custom_name && place.ai_name && (
        <Callout className="-mt-2 mb-6">Picked by AI among the places nearby. Rename it if that&rsquo;s wrong.</Callout>
      )}

      <LazyGeoMap
        label={`Map of ${name}${place.kind ? `, with its ${radius} m size` : ""}`}
        circle={{ lon: place.lon, lat: place.lat, radius }}
        zoom={15}
        className="mb-8 h-60 md:h-80"
      />


      <section className="mb-8">
        <SectionHeader title="Photos" />
        <PhotoGallery placeId={Number(place.id)} />
      </section>

      <section>
        <SectionHeader
          title={
            <>
              Visits <span className="ml-1 font-normal tabular-nums text-muted">{visitCount.toLocaleString("en-GB")}</span>
            </>
          }
        />
        {visits.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No visits recorded yet" className="py-8" />
        ) : (
          <div className="flex flex-col gap-5">
            {[...months].map(([month, list]) => (
              <div key={month}>
                <h3 className="mb-2 text-meta font-medium text-muted">
                  {formatMonth(month)}
                </h3>
                <CardList>
                  {list.map((v) => (
                    <ListRow
                      key={v.id}
                      href={`/timeline?date=${localDate(v.started_at, tz)}`}
                      title={formatDateShort(v.started_at, tz)}
                      meta={
                        <span className="tabular-nums">
                          {formatTime(v.started_at, tz)} – {formatTime(v.ended_at, tz)}
                          <DaysLater from={v.started_at} to={v.ended_at} tz={tz} />
                        </span>
                      }
                      trailing={formatDuration(v.duration)}
                      className="min-h-14"
                    />
                  ))}
                </CardList>
              </div>
            ))}
          </div>
        )}
        {!showAll && visitCount > visits.length && (
          <Link
            href={`/places/${place.id}?all=1`}
            scroll={false}
            className="mt-3 inline-flex h-9 items-center rounded-control text-sm font-medium text-primary hover:underline"
          >
            Show all {visitsLabel(visitCount)}
          </Link>
        )}
        {showAll && visitCount > VISIT_LIMIT && (
          <p className="mt-3 text-meta text-muted">The latest {VISIT_LIMIT} of {visitsLabel(visitCount)} are shown.</p>
        )}
      </section>
    </Page>
  );
}

/** "+1" after an end time on a later day (an overnight stay). */
function DaysLater({ from, to, tz }: { from: Date; to: Date; tz: string }) {
  const days = Math.round((Date.parse(localDate(to, tz)) - Date.parse(localDate(from, tz))) / 86_400_000);
  if (days <= 0) return null;
  return (
    <sup className="ml-0.5 text-[0.6875rem] text-muted" title={days === 1 ? "the next day" : `${days} days later`}>
      +{days}
    </sup>
  );
}

function RenameForm({ place }: { place: PlaceRow }) {
  return (
    <form action={renamePlace} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={place.id} />
      <Field label="Name" htmlFor="rename-name">
        <Input
          id="rename-name"
          name="name"
          defaultValue={place.custom_name ?? ""}
          placeholder={place.ai_name ?? place.geo_name ?? "e.g. Mom's"}
          maxLength={120}
        />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="primary">
          Save name
        </Button>
      </div>
    </form>
  );
}

/** Save (or edit, or remove from saved) the place: its name, kind and size. */
function SaveForm({ place }: { place: PlaceRow }) {
  const saved = place.kind != null;
  return (
    <form action={savePlace} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={place.id} />
      <Field label="Name" htmlFor={`save-name-${saved ? "edit" : "new"}`}>
        <Input
          id={`save-name-${saved ? "edit" : "new"}`}
          name="name"
          defaultValue={place.custom_name ?? ""}
          placeholder={place.geo_name ?? "e.g. Mom's"}
          maxLength={120}
        />
      </Field>
      <KindPicker defaultValue={place.kind} />
      <SizePicker defaultValue={place.radius_m} />
      <p className="text-meta text-muted">A new size re-sorts your visits within a minute or so.</p>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        {saved && (
          <Button type="submit" variant="ghost" formAction={unsavePlace} formNoValidate className="mr-auto text-danger hover:text-danger">
            Remove from saved
          </Button>
        )}
        <Button type="submit" variant="primary">
          {saved ? "Save changes" : "Save place"}
        </Button>
      </div>
    </form>
  );
}
