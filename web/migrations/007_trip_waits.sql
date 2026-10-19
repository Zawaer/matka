-- Transfers folded into a trip: a short stay at a public transport stop between
-- two moves is a wait for the next ride, not a visit (src/lib/processing/detect.ts).
-- JSON array of {startedAt, endedAt, stop}, NULL when the trip has none.
ALTER TABLE trips ADD COLUMN waits jsonb;
