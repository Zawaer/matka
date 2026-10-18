import Link from "next/link";
import { q } from "@/lib/db";
import { formatDistance, formatDuration } from "@/lib/format";

export const dynamic = "force-dynamic";

type Totals = {
  points: string;
  visits: string;
  tracks: string;
  days: string;
  first: Date | null;
  last: Date | null;
};

export default async function Overview() {
  const [totals] = await q<Totals>(`
    SELECT
      (SELECT count(*) FROM points) AS points,
      (SELECT count(*) FROM visits WHERE deleted_at IS NULL) AS visits,
      (SELECT count(*) FROM tracks) AS tracks,
      (SELECT count(DISTINCT date(to_timestamp(timestamp))) FROM points) AS days,
      (SELECT to_timestamp(min(timestamp)) FROM points) AS first,
      (SELECT to_timestamp(max(timestamp)) FROM points) AS last
  `);

  const months = await q<{ year: number; month: number; distance: string }>(
    `SELECT year, month, distance FROM stats ORDER BY year, month`,
  );
  const cities = await q<{ city: string; n: string }>(
    `SELECT city, count(*) n FROM points WHERE city IS NOT NULL
     GROUP BY city ORDER BY n DESC LIMIT 8`,
  );
  const recent = await q<{
    id: number;
    name: string | null;
    started_at: Date;
    duration: number | null;
  }>(`
    SELECT v.id, COALESCE(p.name, v.name) AS name, v.started_at, EXTRACT(EPOCH FROM (v.ended_at - v.started_at))::int AS duration
    FROM visits v LEFT JOIN places p ON p.id = v.place_id
    WHERE v.deleted_at IS NULL
    ORDER BY v.started_at DESC LIMIT 8
  `);

  const totalKm =
    months.reduce((s, m) => s + Number(m.distance || 0), 0) / 1000;
  const maxMonth = Math.max(1, ...months.map((m) => Number(m.distance || 0)));
  const fmtMonth = (y: number, m: number) =>
    new Date(y, m - 1, 1).toLocaleDateString([], { month: "short" });

  const range =
    totals?.first && totals?.last
      ? `${new Date(totals.first).toLocaleDateString()} – ${new Date(
          totals.last,
        ).toLocaleDateString()}`
      : "—";

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
            Distance by month
          </h2>
          <div className="flex h-40 items-stretch gap-2">
            {months.map((m) => {
              const h = (Number(m.distance || 0) / maxMonth) * 100;
              return (
                <div
                  key={`${m.year}-${m.month}`}
                  className="flex flex-1 flex-col items-center gap-2"
                >
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-md bg-primary/80 transition-all hover:bg-primary"
                      style={{ height: `${Math.max(3, h)}%` }}
                      title={`${formatDistance(Number(m.distance))}`}
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
          <h2 className="mb-4 text-sm font-semibold text-muted">Top places</h2>
          {cities.length === 0 ? (
            <p className="text-sm text-muted">
              Reverse geocoding is still filling in city names…
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {cities.map((c) => (
                <li
                  key={c.city}
                  className="rounded-full border border-border bg-surface-2 px-3 py-1 text-sm"
                >
                  {c.city}{" "}
                  <span className="text-muted">
                    {Number(c.n).toLocaleString()}
                  </span>
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
          {recent.map((v) => (
            <li key={v.id} className="flex items-center justify-between px-5 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {v.name && v.name !== "Unknown Location" ? (
                    v.name
                  ) : (
                    <span className="text-muted">Unknown location</span>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {new Date(v.started_at).toLocaleString()}
                </p>
              </div>
              <span className="shrink-0 text-sm text-muted">
                {formatDuration(v.duration)}
              </span>
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
