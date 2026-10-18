-- Paired mobile collectors. Only a SHA-256 of each token is stored; see docs/API.md.
CREATE TABLE IF NOT EXISTS matka_devices (
  id           bigserial PRIMARY KEY,
  user_id      bigint      NOT NULL,
  name         text        NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
  token_hash   bytea       NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at   timestamptz
);

CREATE INDEX IF NOT EXISTS index_matka_devices_on_user_id ON matka_devices (user_id);

-- /api/ingest dedupes on (user_id, timestamp); keep that lookup indexed.
CREATE INDEX IF NOT EXISTS index_points_on_user_id_and_timestamp ON points (user_id, timestamp);
