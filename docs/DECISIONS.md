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
- **Dawarich**: the engine + import pipeline (keep).
