-- AI place picker (lib/aiPlaces.ts), opt-in per user and only when the server
-- has CLAUDE_ACCOUNTS_URL/TOKEN. Where Photon finds several plausible POIs
-- near a place, geocoding keeps them (geo_candidates, only for opted-in users)
-- and a small model picks one from the visit pattern. Its pick goes to ai_name;
-- the display name is custom_name, else ai_name, else geo_name
-- (PLACE_NAME_SQL in lib/places.ts), with ai_category going with ai_name
-- (PLACE_CATEGORY_SQL). custom_name and saved places are never
-- touched.
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_places boolean NOT NULL DEFAULT false;

ALTER TABLE places
  ADD COLUMN IF NOT EXISTS geo_candidates jsonb,
  ADD COLUMN IF NOT EXISTS ai_name text,
  -- OSM type of the POI picked (shown instead of category while ai_name is); NULL for an address.
  ADD COLUMN IF NOT EXISTS ai_category text,
  ADD COLUMN IF NOT EXISTS ai_confidence real,
  -- AI_PLACES_VERSION the check ran with; NULL = not checked (again) yet.
  ADD COLUMN IF NOT EXISTS ai_version smallint,
  ADD COLUMN IF NOT EXISTS ai_checked_at timestamptz,
  -- Visits when last checked: a place is asked about again once it has many more.
  ADD COLUMN IF NOT EXISTS ai_visits integer;

CREATE INDEX IF NOT EXISTS places_ai_pending_idx ON places (user_id)
  WHERE geo_candidates IS NOT NULL AND kind IS NULL AND custom_name IS NULL;

-- Requests per day, so the daily cap survives restarts.
CREATE TABLE IF NOT EXISTS ai_usage (
  day      date    PRIMARY KEY,
  requests integer NOT NULL DEFAULT 0,
  places   integer NOT NULL DEFAULT 0
);

-- Make AI names searchable too, when place search (014) is installed: the
-- search text gains ai_name and its index is rebuilt for the new expression.
DO $$
BEGIN
  IF to_regprocedure('matka_place_search_text(places)') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION matka_place_search_text(p places) RETURNS text
      LANGUAGE sql IMMUTABLE PARALLEL SAFE
      RETURN matka_fold(
        COALESCE(p.custom_name, '') || ' ' || COALESCE(p.ai_name, '') || ' ' || COALESCE(p.geo_name, '') || ' ' ||
        COALESCE(p.geodata->>'street', '') || ' ' || COALESCE(p.kind, '') || ' ' ||
        COALESCE(replace(p.category, '_', ' '), '') || ' ' ||
        COALESCE(p.city, '') || ' ' || COALESCE(p.country, ''));
    IF to_regclass('places_search_trgm_idx') IS NOT NULL THEN
      REINDEX INDEX places_search_trgm_idx;
    END IF;
  END IF;
END
$$;
