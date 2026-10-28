import { CalendarDays, Pencil } from "lucide-react";
import { EscapeBack } from "@/components/EscapeBack";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { formatDateShort, formatDuration, formatTime } from "@/lib/format";
import { placeCategoryLine, placeTitle } from "@/components/places/category";
import {
  Button,
  Callout,
  Card,
  CardList,
  EmptyState,
  Field,
  IconTile,
  Input,
  ListRow,
  Page,
  PageHeader,
  SectionHeader,
  Stat,
  placeIconFor,
} from "@/components/ui";
import { PhotoGallery } from "@/components/places/PhotoGallery";
import { KindBadge, KindPicker, SizePicker } from "@/components/places/SavedFields";
import { PLACE_CATEGORY_SQL } from "@/lib/places";
import type { PlaceKind } from "@/lib/savedPlaces";
import { renamePlace, savePlace, unsavePlace } from "./actions";

export const dynamic = "force-dynamic";

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
  visit_count: string;
  total_time: number;
};

type VisitRow = {
  id: string;
  started_at: Date;
  ended_at: Date;
  duration: number;
};

export default async function PlaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const tz = user.timezone;
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const [place] = await q<PlaceRow>(
    `SELECT p.id, p.custom_name, p.geo_name, p.ai_name, p.city, p.country, ${PLACE_CATEGORY_SQL} AS category, p.kind, p.radius_m,
            (SELECT count(*) FROM visits v WHERE v.place_id = p.id) AS visit_count,
            (SELECT COALESCE(sum(extract(epoch FROM v.ended_at - v.started_at)), 0)::float8
               FROM visits v WHERE v.place_id = p.id) AS total_time
     FROM places p WHERE p.id = $1 AND p.user_id = $2`,
    [id, user.id],
  );
  if (!place) notFound();

  const visits = await q<VisitRow>(
    `SELECT id, started_at, ended_at, extract(epoch FROM ended_at - started_at)::int AS duration
     FROM visits WHERE place_id = $1 ORDER BY started_at DESC LIMIT $2`,
    [id, VISIT_LIMIT],
  );

  const visitCount = Number(place.visit_count);
  const shown = place.custom_name ?? place.ai_name ?? place.geo_name;
  const name = placeTitle(shown, place.category);
  const what = placeCategoryLine(shown, place.category);
  const locale = [place.city, place.country].filter(Boolean).join(", ");

  const dayOf = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const lastVisit = visits[0]?.started_at ?? null;

  return (
    <Page>
      <EscapeBack fallback="/places" />
      <PageHeader
        back={{ href: "/places", label: "Places" }}
        leading={
          <IconTile icon={placeIconFor(place.kind, place.category)} size="lg" tone={place.kind ? "primary" : "neutral"} />
        }
        title={name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {place.kind && <KindBadge kind={place.kind} radius={place.radius_m} />}
            {(what || locale) && <span>{[what, locale].filter(Boolean).join(" · ")}</span>}
          </span>
        }
      />
      {!place.custom_name && place.ai_name && (
        <Callout className="-mt-2 mb-6">Picked by AI among the places nearby. Rename it if that&rsquo;s wrong.</Callout>
      )}

      <section aria-label="Totals" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Visits" value={visitCount.toLocaleString("en-GB")} />
        <Stat label="Time spent" value={formatDuration(place.total_time)} />
        <Stat label="Last visit" value={lastVisit ? formatDateShort(lastVisit, tz) : "—"} className="col-span-2 sm:col-span-1" />
      </section>

      {!place.kind && (
        <details className="group mb-6">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-control text-meta font-medium text-secondary hover:text-text [&::-webkit-details-marker]:hidden">
            <Pencil size={16} strokeWidth={1.75} aria-hidden />
            Rename
          </summary>
          <form action={renamePlace} className="mt-2 flex max-w-md gap-2">
            <input type="hidden" name="id" value={place.id} />
            <Input
              name="name"
              aria-label="Name"
              defaultValue={place.custom_name ?? ""}
              placeholder={place.ai_name ?? place.geo_name ?? "e.g. Home"}
              maxLength={120}
              className="flex-1"
            />
            <Button type="submit" variant="primary">
              Save
            </Button>
          </form>
          <p className="mt-1.5 text-meta text-muted">Leave empty to use the looked-up name.</p>
        </details>
      )}

      <SavePanel place={place} />

      <section className="mb-8">
        <SectionHeader title="Photos" />
        <PhotoGallery placeId={Number(place.id)} />
      </section>

      <section>
        <SectionHeader
          title={
            <>
              Visits{" "}
              <span className="ml-1 font-normal tabular-nums text-muted">
                {visitCount > VISIT_LIMIT ? `latest ${VISIT_LIMIT} of ${visitCount}` : visitCount}
              </span>
            </>
          }
        />
        {visits.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No visits recorded yet" />
        ) : (
          <CardList>
            {visits.map((v) => (
              <ListRow
                key={v.id}
                href={`/timeline?date=${dayOf.format(v.started_at)}`}
                title={formatDateShort(v.started_at, tz)}
                meta={`${formatTime(v.started_at, tz)} – ${formatTime(v.ended_at, tz)}`}
                trailing={formatDuration(v.duration)}
              />
            ))}
          </CardList>
        )}
      </section>
    </Page>
  );
}

/** Save (or edit, or unsave) the place: its name, kind and size. */
function SavePanel({ place }: { place: PlaceRow }) {
  const saved = place.kind != null;
  return (
    <Card as="section" className="mb-8" aria-labelledby="save-place">
      <div className="mb-4">
        <h2 id="save-place" className="text-heading text-text">
          {saved ? "Saved place" : "Save this place"}
        </h2>
        <p className="mt-0.5 text-meta text-muted">
          {saved
            ? "Visits within its size snap here, even across buildings."
            : "Label it Home, Family, School… so visits nearby snap to it and trips know your homes."}
        </p>
      </div>
      <form action={savePlace} className="flex max-w-xl flex-col gap-4">
        <input type="hidden" name="id" value={place.id} />
        <Field label="Name" htmlFor="save-name">
          <Input
            id="save-name"
            name="name"
            defaultValue={place.custom_name ?? ""}
            placeholder={place.geo_name ?? "e.g. Mom's"}
            maxLength={120}
          />
        </Field>
        <KindPicker defaultValue={place.kind} />
        <SizePicker defaultValue={place.radius_m} />
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Button type="submit" variant="primary">
            {saved ? "Save changes" : "Save place"}
          </Button>
          {saved && (
            <Button type="submit" formAction={unsavePlace} formNoValidate>
              Unsave
            </Button>
          )}
          <span className="text-meta text-muted">Changing the size re-sorts your visits in a minute or so.</span>
        </div>
      </form>
    </Card>
  );
}
