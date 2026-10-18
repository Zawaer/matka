import Link from "next/link";
import { notFound } from "next/navigation";
import { q, USER_ID } from "@/lib/db";
import { formatDuration } from "@/lib/format";
import { categoryIcon, categoryLabel } from "@/components/places/category";
import { PhotoGallery } from "@/components/places/PhotoGallery";

export const dynamic = "force-dynamic";

type PlaceRow = {
  id: string;
  name: string | null;
  city: string | null;
  country: string | null;
  category: string | null;
};

type VisitRow = {
  id: string;
  started_at: Date | null;
  ended_at: Date | null;
  duration: number | null;
};

export default async function PlaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const placeId = Number(id);
  if (!Number.isFinite(placeId)) notFound();

  const [place] = await q<PlaceRow>(
    `SELECT id, name, city, country,
            geodata->'properties'->>'osm_value' AS category
     FROM places WHERE id = $1 AND user_id = $2`,
    [placeId, USER_ID],
  );
  if (!place) notFound();

  const visits = await q<VisitRow>(
    `WITH links AS (
       SELECT id AS visit_id FROM visits
       WHERE deleted_at IS NULL AND place_id = $1
       UNION
       SELECT pv.visit_id FROM place_visits pv
       JOIN visits v ON v.id = pv.visit_id AND v.deleted_at IS NULL
       WHERE pv.place_id = $1
     )
     SELECT v.id, v.started_at, v.ended_at, v.duration
     FROM visits v
     JOIN links l ON l.visit_id = v.id
     ORDER BY v.started_at DESC`,
    [placeId],
  );

  const totalTime = visits.reduce((s, v) => s + Number(v.duration ?? 0), 0);
  const name =
    place.name && place.name !== "Unknown Location"
      ? place.name
      : categoryLabel(place.category);
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
          {categoryIcon(place.category)}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {name}
          </h1>
          <p className="mt-1 text-muted">
            {categoryLabel(place.category)}
            {locale ? ` · ${locale}` : ""}
          </p>
          <p className="mt-2 text-sm text-muted">
            <span className="font-medium text-text">{visits.length}</span>{" "}
            {visits.length === 1 ? "visit" : "visits"} ·{" "}
            {formatDuration(totalTime)} total
          </p>
        </div>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold text-muted">Photos</h2>
        <PhotoGallery placeId={placeId} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">Visits</h2>
        {visits.length === 0 ? (
          <p className="text-sm text-muted">No visits recorded yet.</p>
        ) : (
          <ul className="mk-card divide-y divide-border">
            {visits.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {v.started_at
                      ? new Date(v.started_at).toLocaleDateString([], {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "Unknown date"}
                  </p>
                  <p className="text-xs text-muted">
                    {v.started_at
                      ? new Date(v.started_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                    {v.ended_at
                      ? ` – ${new Date(v.ended_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm text-muted">
                  {formatDuration(v.duration)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
