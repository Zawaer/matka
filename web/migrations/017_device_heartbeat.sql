-- Recording health per device (POST /api/devices/heartbeat, lib/heartbeat.ts).
-- heartbeat_at: last time the phone checked in (a heartbeat or an upload);
-- status: what it said last ({recording, mode, lastFixAt, queued, appVersion,
-- recoveries, problem}). NULL for apps from before heartbeats.
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS status jsonb;
