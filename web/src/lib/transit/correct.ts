// "Fix this trip": stores the user's correction with diagnostics of what the
// points and the matcher showed for the trip, and logs them as one line.

import type { User } from "../auth";
import { type Correction, type CorrectionInput, metresBetween, saveCorrection } from "../corrections";
import { q } from "../db";
import { diagnoseTrip, diagnosticsLine } from "./diagnose";
import { configuredFeeds } from "./feed";
import { displayMode, legsByTrip, loadIndex } from "./run";

export async function correctTrip(user: User, input: CorrectionInput): Promise<Correction> {
  // The trip the correction was made on: the one it overlaps most (none for
  // a trip the user added where nothing was recorded).
  const [trip] = input.added ? [] : await q<{ id: string; started_at: Date; ended_at: Date; distance_m: number; mode: string }>(
    `SELECT id, started_at, ended_at, distance_m, mode FROM trips
     WHERE user_id = $1 AND started_at <= to_timestamp($3) AND ended_at >= to_timestamp($2)
     ORDER BY LEAST(ended_at, to_timestamp($3)) - GREATEST(started_at, to_timestamp($2)) DESC LIMIT 1`,
    [user.id, input.startedAt, input.endedAt],
  );
  const matched = trip && user.transitLines ? ((await legsByTrip([trip.id])).get(String(trip.id)) ?? []) : [];
  const points = await q<{ ts: number; lat: number; lon: number; accuracy: number | null; source: string; activity: string | null }>(
    `SELECT extract(epoch FROM ts)::float8 AS ts, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon,
            accuracy, source, activity
     FROM points WHERE user_id = $1 AND ts BETWEEN to_timestamp($2) AND to_timestamp($3) ORDER BY ts`,
    [user.id, input.startedAt, input.endedAt],
  );
  const index = configuredFeeds().length ? await loadIndex().catch(() => null) : null;
  const { diagnostics, legs } = diagnoseTrip(
    index,
    points,
    {
      start: input.startedAt,
      end: input.endedAt,
      distanceM: trip?.distance_m ?? (input.added ? metresBetween(input.added.from, input.added.to) : 0),
      detectorMode: trip?.mode ?? "unknown",
      shownMode: trip ? displayMode(trip.mode, trip.distance_m, matched) : "unknown",
    },
    input.legs,
  );
  const saved = await saveCorrection(user.id, input, legs, diagnostics);
  console.log(diagnosticsLine(diagnostics, { correctionId: saved.id, mode: input.mode, claimed: input.legs }));
  return saved;
}
