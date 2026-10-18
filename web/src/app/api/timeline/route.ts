import { NextResponse } from "next/server";
import { q, USER_ID } from "@/lib/db";
import { modeFromInt } from "@/lib/modes";
import type { TimelineDay, TimelineItem, Visit, TrackSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type VisitRow = {
  id: number;
  name: string | null;
  status: number;
  started_at: Date;
  ended_at: Date | null;
  duration: number | null;
  place_id: string | null;
  place_name: string | null;
  lat: string | null;
  lon: string | null;
  confidence: number | null;
};

type TrackRow = {
  id: number;
  start_at: Date;
  end_at: Date | null;
  distance: string | null;
  duration: number | null;
  avg_speed: number | null;
  dominant_mode: number | null;
};

function isUnknown(name: string | null): boolean {
  return !name || name.trim() === "" || name === "Unknown Location";
}

function toIso(d: Date | null): string {
  return d ? new Date(d).toISOString() : "";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");

  // All days that have any visit or track, so the UI can offer prev/next
  // navigation and disable empty days.
  const dateRows = await q<{ date: string }>(
    `
    SELECT to_char(d, 'YYYY-MM-DD') AS date FROM (
      SELECT DISTINCT started_at::date AS d
        FROM visits
       WHERE deleted_at IS NULL AND user_id = $1
      UNION
      SELECT DISTINCT start_at::date AS d
        FROM tracks
       WHERE user_id = $1
    ) s
    WHERE d IS NOT NULL
    ORDER BY d
    `,
    [USER_ID],
  );
  const dates = dateRows.map((r) => r.date);
  const minDate = dates[0] ?? null;
  const maxDate = dates.length ? dates[dates.length - 1] : null;

  // Default to the latest day that has data.
  const date = dateParam && DATE_RE.test(dateParam) ? dateParam : maxDate;

  if (!date) {
    const empty: TimelineDay = { date: dateParam ?? "", items: [] };
    return NextResponse.json({ day: empty, dates, minDate, maxDate });
  }

  const [visitRows, trackRows] = await Promise.all([
    q<VisitRow>(
      `
      SELECT
        v.id,
        v.name,
        v.status,
        v.started_at,
        v.ended_at,
        v.duration,
        v.place_id,
        COALESCE(p.name, v.name) AS place_name,
        ST_Y(p.lonlat::geometry) AS lat,
        ST_X(p.lonlat::geometry) AS lon,
        v.confidence
      FROM visits v
      LEFT JOIN places p ON p.id = v.place_id
      WHERE v.deleted_at IS NULL
        AND v.user_id = $1
        AND v.started_at::date = $2::date
      ORDER BY v.started_at
      `,
      [USER_ID, date],
    ),
    q<TrackRow>(
      `
      SELECT
        id,
        start_at,
        end_at,
        distance,
        duration,
        avg_speed,
        dominant_mode
      FROM tracks
      WHERE user_id = $1
        AND start_at::date = $2::date
      ORDER BY start_at
      `,
      [USER_ID, date],
    ),
  ]);

  const visitItems: { at: number; item: TimelineItem }[] = visitRows.map(
    (r) => {
      const visit: Visit = {
        id: r.id,
        name: r.name,
        status: r.status,
        startedAt: toIso(r.started_at),
        endedAt: toIso(r.ended_at),
        duration: r.duration,
        placeId: r.place_id != null ? Number(r.place_id) : null,
        placeName: isUnknown(r.place_name) ? null : r.place_name,
        lat: r.lat != null ? Number(r.lat) : null,
        lon: r.lon != null ? Number(r.lon) : null,
        confidence: r.confidence,
      };
      return {
        at: new Date(visit.startedAt).getTime(),
        item: { kind: "visit", visit },
      };
    },
  );

  const moveItems: { at: number; item: TimelineItem }[] = trackRows.map((r) => {
    const track: TrackSummary = {
      id: r.id,
      startedAt: toIso(r.start_at),
      endedAt: toIso(r.end_at),
      distance: r.distance != null ? Number(r.distance) : null,
      duration: r.duration,
      avgSpeed: r.avg_speed != null ? Number(r.avg_speed) : null,
      mode: modeFromInt(r.dominant_mode),
    };
    return {
      at: new Date(track.startedAt).getTime(),
      item: { kind: "move", track },
    };
  });

  const items = [...visitItems, ...moveItems]
    .sort((a, b) => a.at - b.at)
    .map((x) => x.item);

  const day: TimelineDay = { date, items };

  return NextResponse.json({ day, dates, minDate, maxDate });
}
