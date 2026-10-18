-- Matka's own schema. Matka no longer reads Dawarich tables; history from a
-- Dawarich instance is copied in with scripts/import-dawarich.mjs.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE users (
  id             bigserial PRIMARY KEY,
  oidc_sub       text        NOT NULL UNIQUE,
  email          text,
  name           text,
  timezone       text        NOT NULL DEFAULT 'Europe/Helsinki',
  immich_url     text,
  -- AES-256-GCM ciphertext (see src/lib/crypto.ts), never the plain key.
  immich_api_key bytea,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz
);

-- Browser sessions. The cookie holds a random token; only its SHA-256 is stored.
CREATE TABLE sessions (
  id           bytea       PRIMARY KEY,
  user_id      bigint      NOT NULL REFERENCES users ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  user_agent   text
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- Paired mobile collectors (docs/API.md). Only a SHA-256 of each token is stored.
CREATE TABLE devices (
  id           bigserial PRIMARY KEY,
  user_id      bigint      NOT NULL REFERENCES users ON DELETE CASCADE,
  name         text        NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
  token_hash   bytea       NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at   timestamptz
);
CREATE INDEX devices_user_id_idx ON devices (user_id);

-- Raw fixes. One per user per second: that uniqueness is what makes uploads idempotent.
CREATE TABLE points (
  id         bigserial PRIMARY KEY,
  user_id    bigint      NOT NULL REFERENCES users ON DELETE CASCADE,
  device_id  bigint      REFERENCES devices ON DELETE SET NULL,
  ts         timestamptz NOT NULL,
  geom       geography(Point, 4326) NOT NULL,
  accuracy   real,
  altitude   real,
  speed      real,   -- m/s
  battery    smallint,
  source     text        NOT NULL DEFAULT 'device' CHECK (source IN ('device', 'import')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ts)
);

-- Everything below is derived from points by src/lib/processing and can be
-- rebuilt, except user edits to places (custom name).

CREATE TABLE places (
  id          bigserial PRIMARY KEY,
  user_id     bigint      NOT NULL REFERENCES users ON DELETE CASCADE,
  geom        geography(Point, 4326) NOT NULL,
  custom_name text,
  geo_name    text,
  category    text,   -- OSM value from Photon, e.g. "cafe"
  city        text,
  country     text,
  geodata     jsonb,
  geocoded_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX places_user_id_idx ON places (user_id);
CREATE INDEX places_geom_idx ON places USING gist (geom);

CREATE TABLE visits (
  id          bigserial PRIMARY KEY,
  user_id     bigint      NOT NULL REFERENCES users ON DELETE CASCADE,
  place_id    bigint      NOT NULL REFERENCES places ON DELETE CASCADE,
  started_at  timestamptz NOT NULL,
  ended_at    timestamptz NOT NULL,
  geom        geography(Point, 4326) NOT NULL,
  point_count integer     NOT NULL
);
CREATE INDEX visits_user_started_idx ON visits (user_id, started_at);
CREATE INDEX visits_place_id_idx ON visits (place_id);

CREATE TABLE trips (
  id          bigserial PRIMARY KEY,
  user_id     bigint      NOT NULL REFERENCES users ON DELETE CASCADE,
  started_at  timestamptz NOT NULL,
  ended_at    timestamptz NOT NULL,
  distance_m  real        NOT NULL,
  mode        text        NOT NULL,   -- ModeKey from src/lib/modes.ts
  path        geography(LineString, 4326),
  point_count integer     NOT NULL
);
CREATE INDEX trips_user_started_idx ON trips (user_id, started_at);

-- Incremental processing bookkeeping: everything from dirty_from onward needs
-- (re)processing. NULL = up to date.
CREATE TABLE processing_state (
  user_id      bigint PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  dirty_from   timestamptz,
  processed_at timestamptz
);
