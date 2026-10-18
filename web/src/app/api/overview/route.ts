import { NextResponse } from "next/server";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

// JSON overview for the mobile app (mirrors the web Overview page).
export async function GET() {
  try {
    const [totals] = await q<{
      points: string;
      visits: string;
      tracks: string;
      days: string;
      first: Date | null;
      last: Date | null;
    }>(`
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
      SELECT v.id, COALESCE(p.name, v.name) AS name, v.started_at, v.duration
      FROM visits v LEFT JOIN places p ON p.id = v.place_id
      WHERE v.deleted_at IS NULL
      ORDER BY v.started_at DESC LIMIT 8
    `);

    const totalKm =
      months.reduce((s, m) => s + Number(m.distance || 0), 0) / 1000;

    return NextResponse.json({
      totals: {
        points: Number(totals?.points ?? 0),
        visits: Number(totals?.visits ?? 0),
        tracks: Number(totals?.tracks ?? 0),
        days: Number(totals?.days ?? 0),
        totalKm: Math.round(totalKm),
        first: totals?.first ?? null,
        last: totals?.last ?? null,
      },
      months: months.map((m) => ({
        year: m.year,
        month: m.month,
        distance: Number(m.distance || 0),
      })),
      cities: cities.map((c) => ({ city: c.city, count: Number(c.n) })),
      recent: recent.map((r) => ({
        id: r.id,
        name: r.name,
        startedAt: r.started_at,
        duration: r.duration,
      })),
    });
  } catch (err) {
    console.error("[/api/overview] failed:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
