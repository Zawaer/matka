-- Cover photos picked from the user's Immich library (lib/covers.ts), cached
-- per trip / city. asset_id NULL means "looked, found nothing". input_hash is
-- the hash of the time windows and locations the pick was made from, so a
-- changed trip or city is recomputed straight away.
CREATE TABLE IF NOT EXISTS covers (
  user_id     bigint      NOT NULL REFERENCES users ON DELETE CASCADE,
  key         text        NOT NULL,
  input_hash  text        NOT NULL,
  asset_id    text,
  -- More photos from the same windows, best first (trip page strip).
  more        text[]      NOT NULL DEFAULT '{}',
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
