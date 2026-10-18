import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { formatDateShort, formatDistance, formatDuration, formatTime } from "@/lib/format";
import { PLACE_NAME_SQL } from "@/lib/places";

export const dynamic = "force-dynamic";

type Totals = {
  points: string;
  visits: string;
  days: string;
  distance: number | null;
  first: Date | null;
  last: Date | null;
};

export default async function Overview() {
  const user = await requireUser();
  const tz = user.timezone;

  const [[totals], months, topPlaces, recent] = await Promise.all([
    q<Totals>(
      `SELECT
         (SELECT count(*) FROM points WHERE user_id = $1) AS points,
         (SELECT count(*) FROM visits WHERE user_id = $1) AS visits,
         (SELECT count(DISTINCT (ts AT TIME ZONE $2)::date) FROM points WHERE user_id = $1) AS days,
         (SELECT sum(distance_m)::float8 FROM trips WHERE user_id = $1) AS distance,
         (SELECT min(ts) FROM points WHERE user_id = $1) AS first,
         (SELECT max(ts) FROM points WHERE user_id = $1) AS last`,
      [user.id, tz],
    ),
    // Last 12 months of travelled distance.
    q<{ year: number; month: number; distance: number }>(
      `SELECT extract(year FROM m)::int AS year, extract(month FROM m)::int AS month,
              COALESCE(sum(t.distance_m), 0)::float8 AS distance
       FROM generate_series(date_trunc('month', now() AT TIME ZONE $2) - interval '11 months',
                            date_trunc('month', now() AT TIME ZONE $2), interval '1 month') AS m
       LEFT JOIN trips t ON t.user_id = $1
             AND date_trunc('month', t.started_at AT TIME ZONE $2) = m
       GROUP BY m ORDER BY m`,
      [user.id, tz],
    ),
    q<{ id: string; name: string | null; hours: number }>(
      `SELECT p.id, ${PLACE_NAME_SQL} AS name,
              sum(extract(epoch FROM v.ended_at - v.started_at))::float8 / 3600 AS hours
       FROM visits v JOIN places p ON p.id = v.place_id
       WHERE v.user_id = $1
       GROUP BY p.id ORDER BY hours DESC LIMIT 8`,
      [user.id],
    ),
    q<{ id: string; place_id: string; name: string | null; started_at: Date; duration: number }>(
      `SELECT v.id, v.place_id, ${PLACE_NAME_SQL} AS name, v.started_at,
              extract(epoch FROM v.ended_at - v.started_at)::int AS duration
       FROM visits v JOIN places p ON p.id = v.place_id
       WHERE v.user_id = $1
       ORDER BY v.started_at DESC LIMIT 8`,
      [user.id],
    ),
  ]);

  const totalKm = (totals?.distance ?? 0) / 1000;
  const maxMonth = Math.max(1, ...months.map((m) => m.distance));
  const fmtMonth = (y: number, m: number) =>
    new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

  const range =
    totals?.first && totals?.last
      ? `${formatDateShort(totals.first, tz)} – ${formatDateShort(totals.last, tz)}`
      : "No data yet — pair your phone under Devices to start.";

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-muted">{range}</p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Points" value={Number(totals?.points ?? 0).toLocaleString()} />
        <Stat label="Days tracked" value={Number(totals?.days ?? 0).toLocaleString()} />
        <Stat label="Visits" value={Number(totals?.visits ?? 0).toLocaleString()} />
        <Stat
          label="Total distance"
          value={`${Math.round(totalKm).toLocaleString()} km`}
          accent
        />
      </section>

      <section className="mt-6 grid gap-5 md:grid-cols-5">
        <div className="mk-card p-5 md:col-span-3">
          <h2 className="mb-4 text-sm font-semibold text-muted">
            Distance, last 12 months
          </h2>
          <div className="flex h-40 items-stretch gap-2">
            {months.map((m) => {
              const h = (m.distance / maxMonth) * 100;
              return (
                <div
                  key={`${m.year}-${m.month}`}
                  className="flex flex-1 flex-col items-center gap-2"
                >
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-md bg-primary/80 transition-all hover:bg-primary"
                      style={{ height: `${Math.max(3, h)}%` }}
                      title={formatDistance(m.distance)}
                    />
                  </div>
                  <span className="text-[10px] text-muted">
                    {fmtMonth(m.year, m.month)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mk-card p-5 md:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-muted">Most time spent</h2>
          {topPlaces.length === 0 ? (
            <p className="text-sm text-muted">Places appear after your first longer stays.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {topPlaces.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/places/${p.id}`}
                    className="block rounded-full border border-border bg-surface-2 px-3 py-1 text-sm hover:border-primary/60"
                  >
                    {p.name ?? "Unknown place"}{" "}
                    <span className="text-muted">{Math.round(p.hours)} h</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <QuickLink href="/map" title="Map & heatmap" desc="Where you've been" />
        <QuickLink href="/timeline" title="Timeline" desc="Day by day, with trips" />
        <QuickLink href="/places" title="Places" desc="Visits + photos" />
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-muted">Recent visits</h2>
        <ul className="mk-card divide-y divide-border">
          {recent.length === 0 && (
            <li className="px-5 py-3 text-sm text-muted">No visits yet.</li>
          )}
          {recent.map((v) => (
            <li key={v.id}>
              <Link
                href={`/places/${v.place_id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {v.name ?? <span className="text-muted">Unknown place</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDateShort(v.started_at, tz)} · {formatTime(v.started_at, tz)}
                  </p>
                </div>
                <span className="shrink-0 text-sm text-muted">{formatDuration(v.duration)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="mk-card p-4">
      <div
        className={`text-2xl font-semibold tracking-tight ${
          accent ? "text-primary" : ""
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}

function QuickLink({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="mk-card group flex flex-col gap-1 p-4 transition-colors hover:border-primary/60"
    >
      <span className="font-medium group-hover:text-primary">{title}</span>
      <span className="text-sm text-muted">{desc}</span>
    </Link>
  );
}
