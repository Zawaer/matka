import { q } from "../db";
import {
  AI_BATCH,
  AI_PLACES_VERSION,
  SYSTEM_PROMPT,
  buildPrompt,
  isCandidates,
  parsePicks,
  pickedName,
  type AiPlaceInput,
} from "../aiPlaces";
import { askClaude, claudeConfigured } from "../claude";

// Worker step after geocoding: for users who turned on the AI place picker
// (Settings), places where Photon found several plausible POIs are sent in
// batches to a small model, which picks one from the visit pattern (see
// lib/aiPlaces.ts for exactly what is sent). Confident picks become ai_name.
// Saved and renamed places are skipped. Bounded: one request per tick, a
// daily cap, a timeout, and a pause after rate limits or failures.

const TIMEOUT_MS = Number(process.env.MATKA_AI_TIMEOUT_MS ?? 60_000);
const PER_TICK = Number(process.env.MATKA_AI_REQUESTS_PER_TICK ?? 1);
const PER_DAY = Number(process.env.MATKA_AI_REQUESTS_PER_DAY ?? 40);

const state = globalThis as unknown as { _matkaAiPausedUntil?: number };

type Row = {
  id: string;
  geo_candidates: unknown;
  visits: string;
  start_hour: number;
  minutes: number;
  weekend: number;
  night: number;
};

/** Up to AI_BATCH of a user's places waiting for a (re)check, most visited first. */
async function pendingFor(userId: string): Promise<Row[]> {
  return q<Row>(
    `WITH v AS (
       SELECT v.place_id, v.started_at AT TIME ZONE u.timezone AS local_start,
              extract(epoch FROM v.ended_at - v.started_at) / 60 AS minutes
       FROM visits v JOIN users u ON u.id = v.user_id
       WHERE v.user_id = $1)
     SELECT p.id, p.geo_candidates, count(*) AS visits,
            percentile_disc(0.5) WITHIN GROUP (ORDER BY extract(hour FROM v.local_start))::int AS start_hour,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY v.minutes)::float8 AS minutes,
            avg((extract(isodow FROM v.local_start) >= 6)::int)::float8 AS weekend,
            avg((extract(hour FROM v.local_start) >= 22 OR extract(hour FROM v.local_start) < 6)::int)::float8 AS night
     FROM places p JOIN v ON v.place_id = p.id
     WHERE p.user_id = $1 AND p.geo_candidates IS NOT NULL AND p.kind IS NULL AND p.custom_name IS NULL
     GROUP BY p.id
     -- Not checked with this version, or visited much more since.
     HAVING p.ai_version IS DISTINCT FROM $2 OR count(*) >= greatest(2 * p.ai_visits, p.ai_visits + 3)
     ORDER BY count(*) DESC, p.id
     LIMIT $3`,
    [userId, AI_PLACES_VERSION, AI_BATCH],
  );
}

async function requestsToday(): Promise<number> {
  const [r] = await q<{ requests: number }>(`SELECT requests FROM ai_usage WHERE day = current_date`);
  return r?.requests ?? 0;
}

/**
 * One worker pass: at most PER_TICK requests. Returns how many places were
 * checked. Never throws for model or service trouble; it pauses instead.
 */
export async function pickPlaceNamesWithAi(): Promise<number> {
  if (!claudeConfigured()) return 0;
  if ((state._matkaAiPausedUntil ?? 0) > Date.now()) return 0;
  const users = await q<{ id: string }>(`SELECT id FROM users WHERE ai_places ORDER BY id`);
  let checked = 0;
  let requests = 0;
  for (const { id: userId } of users) {
    while (requests < PER_TICK) {
      if ((await requestsToday()) >= PER_DAY) return checked;
      const rows = (await pendingFor(userId)).filter((r) => isCandidates(r.geo_candidates));
      if (rows.length === 0) break;
      const places: AiPlaceInput[] = rows.map((r) => ({
        candidates: r.geo_candidates as AiPlaceInput["candidates"],
        stats: {
          visits: Number(r.visits),
          startHour: r.start_hour,
          minutes: r.minutes,
          weekendShare: r.weekend,
          nightShare: r.night,
        },
      }));
      requests++;
      const res = await askClaude({ system: SYSTEM_PROMPT, prompt: buildPrompt(places), timeoutMs: TIMEOUT_MS });
      if (res.ok || res.called) {
        await q(
          `INSERT INTO ai_usage (day, requests, places) VALUES (current_date, 1, $1)
           ON CONFLICT (day) DO UPDATE SET requests = ai_usage.requests + 1, places = ai_usage.places + $1`,
          [places.length],
        );
      }
      if (!res.ok) {
        // Rate limits, timeouts, no free account: try again later, places stay pending.
        state._matkaAiPausedUntil = res.retryAt ?? Date.now() + 10 * 60_000;
        console.warn(
          `[ai-places] paused until ${new Date(state._matkaAiPausedUntil).toISOString()}: ${res.reason}`,
        );
        return checked;
      }
      const picks = parsePicks(res.structured ?? res.text, places);
      if (!picks) console.warn("[ai-places] reply wasn't the JSON asked for; these places keep their names");
      const byIndex = new Map((picks ?? []).map((p) => [p.index, p]));
      // Every place in the batch is marked checked, picked or not, so a reply
      // the model can't get right isn't asked for again and again.
      for (const [i, r] of rows.entries()) {
        const pick = byIndex.get(i);
        const name = pick ? pickedName(pick, places[i].candidates) : null;
        await q(
          `UPDATE places SET ai_name = $2, ai_category = $3, ai_confidence = $4, ai_version = $5,
                  ai_checked_at = now(), ai_visits = $6
           WHERE id = $1 AND custom_name IS NULL AND kind IS NULL`,
          [
            r.id,
            name,
            name && pick!.choice.kind === "poi" ? pick!.choice.poi.kind : null,
            name ? pick!.confidence : null,
            AI_PLACES_VERSION,
            places[i].stats.visits,
          ],
        );
      }
      checked += rows.length;
      console.log(`[ai-places] user ${userId}: checked ${rows.length} places, named ${byIndex.size}`);
    }
    if (requests >= PER_TICK) break;
  }
  return checked;
}
