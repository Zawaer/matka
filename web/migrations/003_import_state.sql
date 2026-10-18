-- Progress of one-time history imports (currently only Dawarich). One row per
-- source; `cursor` is the last source row id copied, so an interrupted import
-- resumes where it stopped. finished_at set = never runs again.
CREATE TABLE import_state (
  source      text        PRIMARY KEY,
  user_id     bigint      NOT NULL REFERENCES users ON DELETE CASCADE,
  cursor      bigint      NOT NULL DEFAULT 0,
  total       bigint,
  seen        bigint      NOT NULL DEFAULT 0,
  inserted    bigint      NOT NULL DEFAULT 0,
  started_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  note        text
);
