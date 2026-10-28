-- The recording preset each phone reported, as a change log: a row is added by
-- POST /api/devices/heartbeat only when the preset differs from the device's
-- latest row (lib/devices.ts recordHeartbeat). Recording-quality insights split
-- their numbers at these changes (lib/insights/quality.ts).
-- preset: {preset: low|balanced|precise|max|custom, custom?: {accuracy, distance, time},
--          smartTracking: bool|null}
CREATE TABLE device_preset_log (
  device_id bigint      NOT NULL REFERENCES devices ON DELETE CASCADE,
  preset    jsonb       NOT NULL,
  since     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, since)
);

-- What each phone's recorder did per local day (the phone's time zone) and
-- preset, as the app counted it; upserted from heartbeats (today and yesterday,
-- running totals). Feeds the estimate of Matka's own battery use
-- (lib/insights/powerModel.ts) and, from the phone's BatteryManager, whole-phone
-- measurements while unplugged: current draw by state (screen off with GPS
-- active / in standby, screen on) and the charge-counter drop.
CREATE TABLE device_daily_usage (
  device_id             bigint  NOT NULL REFERENCES devices ON DELETE CASCADE,
  day                   date    NOT NULL,
  preset                text    NOT NULL,
  active_s              integer NOT NULL DEFAULT 0,  -- recording with GPS (the preset's own options)
  standby_s             integer NOT NULL DEFAULT 0,  -- Smart Tracking standby (Wi-Fi/cell)
  off_s                 integer NOT NULL DEFAULT 0,  -- recording turned off
  fixes                 integer NOT NULL DEFAULT 0,
  moving_s              integer NOT NULL DEFAULT 0,  -- from the motion sensor
  still_s               integer NOT NULL DEFAULT 0,
  cur_active_n          integer NOT NULL DEFAULT 0,  -- current samples (mA, discharge positive)
  cur_active_mean_ma    real,
  cur_active_median_ma  real,
  cur_standby_n         integer NOT NULL DEFAULT 0,
  cur_standby_mean_ma   real,
  cur_standby_median_ma real,
  cur_screen_n          integer NOT NULL DEFAULT 0,
  cur_screen_mean_ma    real,
  cur_screen_median_ma  real,
  drop_mah              real    NOT NULL DEFAULT 0,  -- charge counter fall while unplugged
  drop_s                integer NOT NULL DEFAULT 0,  -- …over this much time
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, day, preset)
);
