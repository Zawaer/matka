import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { formatDateShort, formatDuration, formatTime } from "@/lib/format";
import { categoryIcon, placeCategoryLine, placeTitle } from "@/components/places/category";
import { PhotoGallery } from "@/components/places/PhotoGallery";
import { KindBadge, KindPicker, SizePicker } from "@/components/places/SavedFields";
import { PLACE_CATEGORY_SQL } from "@/lib/places";
import { KIND_META, type PlaceKind } from "@/lib/savedPlaces";
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

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-10">
      <Link
        href="/places"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-text"
      >
        ← Places
      </Link>

      <header className="mb-8 flex items-start gap-4">
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-2xl"
          aria-hidden
        >
          {place.kind ? KIND_META[place.kind].icon : categoryIcon(place.category)}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{name}</h1>
          {!place.custom_name && place.ai_name && (
            <p className="mt-1 text-xs text-muted">Picked by AI among the places nearby. Rename it if that&rsquo;s wrong.</p>
          )}
          {place.kind && (
            <p className="mt-1.5">
              <KindBadge kind={place.kind} radius={place.radius_m} />
            </p>
          )}
          {(what || locale) && (
            <p className="mt-1 text-muted">{[what, locale].filter(Boolean).join(" · ")}</p>
          )}
          <p className="mt-2 text-sm text-muted">
            <span className="font-medium text-text">{visitCount}</span>{" "}
            {visitCount === 1 ? "visit" : "visits"} · {formatDuration(place.total_time)} total
          </p>
          {!place.kind && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted hover:text-text">Rename</summary>
            <form action={renamePlace} className="mt-2 flex max-w-md gap-2">
              <input type="hidden" name="id" value={place.id} />
              <input
                name="name"
                defaultValue={place.custom_name ?? ""}
                placeholder={place.ai_name ?? place.geo_name ?? "e.g. Home"}
                maxLength={120}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 outline-none focus:border-primary"
              />
              <button
                type="submit"
                className="rounded-lg bg-primary px-3 py-1.5 font-medium text-white"
              >
                Save
              </button>
            </form>
            <p className="mt-1 text-xs text-muted">Leave empty to use the looked-up name.</p>
          </details>
          )}
        </div>
      </header>

      <SavePanel place={place} />

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold text-muted">Photos</h2>
        <PhotoGallery placeId={Number(place.id)} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">
          Visits{visitCount > VISIT_LIMIT ? ` (latest ${VISIT_LIMIT})` : ""}
        </h2>
        {visits.length === 0 ? (
          <p className="text-sm text-muted">No visits recorded yet.</p>
        ) : (
          <ul className="mk-card divide-y divide-border">
            {visits.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{formatDateShort(v.started_at, tz)}</p>
                  <p className="text-xs text-muted">
                    {formatTime(v.started_at, tz)} – {formatTime(v.ended_at, tz)}
                  </p>
                </div>
                <span className="shrink-0 text-sm text-muted">{formatDuration(v.duration)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Save (or edit, or unsave) the place: its name, kind and size. */
function SavePanel({ place }: { place: PlaceRow }) {
  const saved = place.kind != null;
  return (
    <section className="mk-card mb-10 p-5" aria-labelledby="save-place">
      <div className="mb-4">
        <h2 id="save-place" className="font-semibold">
          {saved ? "Saved place" : "Save this place"}
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          {saved
            ? "Visits within its size snap here, even across buildings."
            : "Label it Home, Family, School… so visits nearby snap to it and trips know your homes."}
        </p>
      </div>
      <form action={savePlace} className="flex max-w-xl flex-col gap-4">
        <input type="hidden" name="id" value={place.id} />
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Name</span>
          <input
            name="name"
            defaultValue={place.custom_name ?? ""}
            placeholder={place.geo_name ?? "e.g. Mom's"}
            maxLength={120}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        <KindPicker defaultValue={place.kind} />
        <SizePicker defaultValue={place.radius_m} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="rounded-lg bg-primary px-4 py-2 font-medium text-white">
            {saved ? "Save changes" : "Save place"}
          </button>
          {saved && (
            <button
              type="submit"
              formAction={unsavePlace}
              formNoValidate
              className="rounded-lg border border-border px-4 py-2 font-medium text-muted hover:text-text"
            >
              Unsave
            </button>
          )}
          <span className="text-xs text-muted">Changing the size re-sorts your visits in a minute or so.</span>
        </div>
      </form>
    </section>
  );
}
