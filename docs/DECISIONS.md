# Matka — Decisions & Context

_Last updated: 2026-10-18. Captured from the kickoff conversation so any session/subagent can act without re-asking._

## What Matka is
A self-hosted **location-history web app** — a rebranded, lightweight alternative built **on top of Dawarich's engine**. Named **Matka** (Finnish: "journey/trip").

## Architecture (decided)
- **New lightweight web app on Dawarich's DB** (NOT a fork of Dawarich's Rails codebase).
- Dawarich stays as the **engine**: ingestion, PostGIS point store, visit/track detection, reverse geocoding (Photon), mobile ingestion endpoints.
- Matka = a fresh **Next.js (App Router, TS)** app that reads Dawarich's Postgres directly and renders the UI/visualizations.
- Local dev runs against a **snapshot** of the homelab Dawarich DB loaded into a local PostGIS container.

## Stack
- Next.js + React + TypeScript (API routes = backend; keeps it one lightweight app).
- Map: **MapLibre GL JS** (open, no API key).
- Charts/timeline: lightweight (visx/d3 or hand-rolled SVG).
- DB access: `pg` (node-postgres) with PostGIS queries.

## Feature priorities (all four requested for first build)
1. **Rebrand + visual theme** — Matka name, color system, logo, clean UI.
2. **Immich per-place photo galleries** — photos taken at each visited place (Reitti-style). Immich already connected in Dawarich (`http://immich_server:2283`).
3. **Reitti-style timeline** — interactive timeline: visit durations + transport mode (walk/bike/drive).
4. **Map/heatmap upgrades** — nicer map styling, route rendering, heatmaps.

## Mobile collection (requirement)
- User has **Android** now; **iPhone compatibility is a must** eventually (both platforms needed).
- Decision: **do NOT build a native collector now.** Collection is handled cross-platform by **OwnTracks** (Android + iOS, open-source) → Dawarich ingestion → Matka reads the DB. This sidesteps native-app dev and already satisfies Android+iOS.
- Keep an iOS-parity path open. Future option: a **PWA collector** in Matka using the browser Geolocation API (works Android + iOS in foreground; note iOS Safari background tracking is limited, so native OwnTracks remains the reliable always-on option).

## Homelab facts (source engine)
- Dawarich **1.13.0**, Postgres DB `dawarich_development` (user `postgres`), container `dawarich_db`.
- Several months of points, single user, data entirely in **Finland**.
- Reverse geocoding: self-hosted **Photon** (Finland index) added 2026-10-18; `PHOTON_API_HOST=photon:2322`.
- Immich on same box (`immich_server:2283`), already linked in Dawarich settings.
- Key tables: `points` (PostGIS `lonlat` geography, epoch `timestamp`), `visits`, `places`, `place_visits`, `tracks`, `track_segments`, `areas`, `countries`, `stats`, `users`.

## Reference apps to borrow from
- **Reitti**: interactive timeline, transport-mode classification, per-place Immich galleries.
- **Dawarich**: the engine + import pipeline (reference; being superseded — see independence goal).

## Update 2026-10-18 (later) — independence + own mobile app
- **Goal: Matka becomes fully standalone, independent of Dawarich.** Not using Dawarich's
  endpoints or runtime. Dawarich's DB was used once to **seed** historical data; from here,
  Matka owns ingestion, storage, and (eventually) processing.
- **Own ingestion:** `POST /api/ingest` inserts points straight into `matka_db` (Matka's own DB).
  `GET /api/ingest` = health/count. No Dawarich involvement.
- **Own mobile app (Expo / React Native), one app for everything** — like the Dawarich app does
  collection today, Matka's app will collect in the background AND be the viewer. Scaffold in
  `mobile/`. Needs a **development build** (not Expo Go) for background location.
  - Background location: `expo-location` + `expo-task-manager` (`startLocationUpdatesAsync`,
    Android foreground service, iOS `Always` + `UIBackgroundModes: location`).
  - Collector POSTs batches to Matka `/api/ingest`. For on-device dev testing, the phone reaches
    the Mac dev server via `adb reverse tcp:3000 tcp:3000` → `http://localhost:3000/api/ingest`.
  - First milestone = **background-location feasibility spike** on the user's real Android
    (USB debugging on): prove Expo collects in the background and points land
    in Matka's DB. If solid, Expo is the path and OwnTracks is dropped.
- **Still TODO for true independence (future):** reimplement the processing Dawarich does today —
  visit detection, track/segment generation, transport-mode classification, reverse geocoding
  (point Matka's own geocoder at the self-hosted Photon already running on the homelab).

## Update 2026-10-18 (hardening) — production readiness
Decided with the owner: Authentik OIDC (no VPN), feature branch + PR, Matka computes visits/trips
itself, phones pair with a token, ship a standalone Docker image (k3s + nginx ingress later).

- **Own schema** (`web/migrations/`, applied by `web/scripts/migrate.mjs` on every container start).
  Matka no longer reads Dawarich tables at runtime; history is copied once with
  `web/scripts/import-dawarich.mjs`. See `docs/SCHEMA.md`.
- **Users come from OIDC**: created on first login, keyed by `sub`. Every query is scoped to the
  signed-in user (several people can share an instance).
- **Allowlist is mandatory** (`MATKA_ALLOWED_USERS`: `sub`s or emails, `*` = trust Authentik's
  policy bindings; empty = nobody). Authentik admits any of its users to an app without bindings,
  and users can edit their own email by default, so prefer `sub`.
- **Sessions are server-side**: random cookie token, SHA-256 stored in `sessions`, sliding 30 days,
  revocable (sign out / sign out everywhere else). `src/proxy.ts` checks the session for every
  page and `/api/*` route; pages, routes and server actions resolve the user again themselves.
- **One server secret** `MATKA_SECRET`: signs the 10-minute OIDC login-state cookie and encrypts
  stored Immich API keys (AES-256-GCM, HKDF-separated keys). Rotating it invalidates stored
  Immich keys (re-enter them), nothing else.
- **Devices authenticate with bearer tokens**: `mtk_` + 32 random bytes, SHA-256 stored. Contract
  in `docs/API.md`. Dedupe = `UNIQUE (user_id, ts)` at one-second resolution.
- **Processing** (`web/src/lib/processing/`): a streaming stay-point detector (100 m radius,
  5 min minimum, tolerant of silent distance-filtered phones and single GPS blips), trips between
  stays with mode from 80th-percentile speed (walk/cycle/drive/fly — bus/train are reported as
  driving), incremental rebuild from `processing_state.dirty_from`. Runs in-process every 30 s
  from `instrumentation.ts`; a Postgres advisory lock makes only one replica work at a time.
- **Places persist** across rebuilds (they hold renames); unnamed places with no visits are pruned.
  Reverse geocoding via self-hosted Photon (`PHOTON_URL`), optional.
- **Immich per user**, configured in Settings (verified before saving).
- **Timezone per user** (default `MATKA_DEFAULT_TIMEZONE`, else Europe/Helsinki) decides day
  boundaries on the timeline and server-rendered times.
- Dev without an IdP: `MATKA_AUTH_DISABLED=1` (ignored when `NODE_ENV=production`).
