-- Sanity check after reprocessing: visits and trips must never overlap in time
-- (touching ends are fine) nor run backwards. Every count but the totals must be 0.
--   psql "$DATABASE_URL" -f scripts/check-timeline.sql
SELECT
 (SELECT count(*) FROM visits a JOIN visits b ON a.user_id=b.user_id AND a.id<b.id
   AND a.started_at < b.ended_at AND b.started_at < a.ended_at) AS visit_visit,
 (SELECT count(*) FROM trips t JOIN visits v ON t.user_id=v.user_id
   AND t.started_at < v.ended_at AND v.started_at < t.ended_at) AS trip_visit,
 (SELECT count(*) FROM trips a JOIN trips b ON a.user_id=b.user_id AND a.id<b.id
   AND a.started_at < b.ended_at AND b.started_at < a.ended_at) AS trip_trip,
 (SELECT count(*) FROM visits WHERE ended_at < started_at) + (SELECT count(*) FROM trips WHERE ended_at < started_at) AS inverted,
 (SELECT count(*) FROM visits) AS visits, (SELECT count(*) FROM trips) AS trips;
