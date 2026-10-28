-- Timeline extras: "Visited X?" place confirmations, user-added trips
-- ("Missing travel" → "Add travel"), and photos per timeline day.

-- "Visited X?": the user said yes to the shown name (confirmed_at), or picked
-- one of the nearby candidates (custom_name + confirmed_at, with the
-- candidate's OSM type in custom_category; '' = an address, no type). A
-- confirmed place is never asked about again. Renaming a place by hand clears
-- custom_category (src/app/places/[id]/actions.ts).
ALTER TABLE places
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS custom_category text;

-- Nearby candidates are now kept for every place, not only for users with the
-- AI picker on (lib/processing/geocode.ts nearbyCandidates); GEOCODER_VERSION 3
-- looks every place up again in the background to fill them in.

-- A trip the user added where none was recorded: a trip_corrections row with
-- added = true, the straight line from where they were before to where they
-- were after (from/to), and its length. While no detected trip takes it over
-- (CORRECTION_OVERLAP), it is shown as a trip of its own (lib/corrections.ts).
ALTER TABLE trip_corrections
  ADD COLUMN added      boolean NOT NULL DEFAULT false,
  ADD COLUMN from_lat   double precision,
  ADD COLUMN from_lon   double precision,
  ADD COLUMN to_lat     double precision,
  ADD COLUMN to_lon     double precision,
  ADD COLUMN distance_m real,
  ADD CONSTRAINT trip_corrections_added_ends CHECK (
    NOT added OR (from_lat IS NOT NULL AND from_lon IS NOT NULL AND to_lat IS NOT NULL AND to_lon IS NOT NULL));

-- The Immich web address the user opens photos at (e.g. https://immich.lan),
-- when it differs from immich_url (often a container address the browser can't reach).
ALTER TABLE users ADD COLUMN IF NOT EXISTS immich_link_url text;

-- Photos of a timeline day, grouped by visit and trip (lib/dayPhotos.ts);
-- cached like covers: input_hash covers the day's items, so a changed day
-- recomputes at once.
CREATE TABLE IF NOT EXISTS day_photos (
  user_id     bigint      NOT NULL REFERENCES users ON DELETE CASCADE,
  date        date        NOT NULL,
  input_hash  text        NOT NULL,
  data        jsonb       NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);
