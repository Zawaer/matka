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

## Update 2026-10-18 (hardening) — auth
- **Web login = Authentik via OIDC** (`openid-client`, auth-code + PKCE). No user table: the
  session is a signed HS256 cookie (`SESSION_SECRET`, 30 days). `src/proxy.ts` gates every page
  and `/api/*` route; server actions re-check with `requireSession()`.
- **Allowlist is mandatory** (`MATKA_ALLOWED_USERS`, OIDC `sub`s or emails; empty = nobody).
  Authentik admits any of its users to an app without policy bindings, and users can edit their
  own email by default, so prefer `sub` entries.
- **Devices authenticate with bearer tokens**, not the session: `mtk_` + 32 random bytes, only the
  SHA-256 stored in `matka_devices` (migration `db/migrations/001_devices.sql`, applied with
  `scripts/migrate.sh`). Paired/revoked from the **Devices** page. Contract: `docs/API.md`.
- **Ingest dedupe** is on `(user_id, timestamp)` with a per-user advisory lock instead of a unique
  index, because the seeded Dawarich points may already contain same-second duplicates.
- Public, unauthenticated: `/api/ingest` (own token check), `/api/health`, `/auth/*`.
- Dev without an IdP: `MATKA_AUTH_DISABLED=1` (ignored when `NODE_ENV=production`).
