# Matka schema

Defined by `web/migrations/*.sql`, applied in order by `web/scripts/migrate.mjs` (tracked in
`schema_migrations`). Never edit an applied migration; add a new file.

| Table | What | Notes |
| --- | --- | --- |
| `users` | One per OIDC identity (`oidc_sub`) | `timezone`, Immich URL + encrypted key |
| `sessions` | Browser sessions | `id` = SHA-256 of the cookie token |
| `devices` | Paired collectors | `token_hash` = SHA-256 of the bearer token; `revoked_at`; `heartbeat_at` + `status` jsonb from `POST /api/devices/heartbeat` (`lib/heartbeat.ts`) |
| `points` | Raw fixes | `UNIQUE (user_id, ts)`; `geom geography(Point)`; `source` device/import |
| `places` | Somewhere the user stays | Name: `custom_name` (user), else `ai_name` (opt-in AI picker, from `geo_candidates`), else `geo_name` (Photon): `PLACE_NAME_SQL`/`PLACE_CATEGORY_SQL` in `lib/places.ts`; `category` = OSM value |
| `visits` | A stay at a place | `started_at`/`ended_at`; derived |
| `trips` | Movement between visits | `distance_m`, `mode` (`ModeKey`), `path geography(LineString)`; derived |
| `processing_state` | Per user: rebuild from `dirty_from` | NULL = up to date |

Derived tables (`visits`, `trips`, unnamed `places`) can be rebuilt any time:

```sql
UPDATE processing_state SET dirty_from = '-infinity' WHERE user_id = …;
```

Coordinates: `ST_Y(geom::geometry)` = lat, `ST_X(geom::geometry)` = lon.

Shared code: `src/lib/db.ts` (`q`, `tx`), `src/lib/auth.ts` (`requireUser`, `apiUser`),
`src/lib/points.ts` (`insertPoints`), `src/lib/modes.ts`, `src/lib/format.ts`.
