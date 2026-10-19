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
- **Sessions are server-side**: random cookie token (`__Host-` prefixed in production), SHA-256
  stored in `sessions`, sliding 30 days with a 90-day absolute cap, revocable (sign out / sign out
  everywhere else). The allowlist is re-checked on every request, so removing someone from
  `MATKA_ALLOWED_USERS` cuts off their sessions and devices immediately. Email entries only match
  emails the provider marks `email_verified`. `src/proxy.ts` checks the session for every
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
- **Immich per user**, configured in Settings (verified before saving). The stored URL is
  normalised (no query/fragment/credentials), redirects are never followed, and the thumbnail
  proxy only relays `image/*` with a sandbox CSP, so the setting can't be turned into a proxy
  into the cluster or into script on Matka's origin.
- **Phone viewer** reads with the device token (`readUser`, GET routes only). Its map WebView
  trades the token for a one-minute ticket and a 12 h map-only cookie, so the token never appears
  in a URL; revoking the device ends both.
- **Timezone per user** (default `MATKA_DEFAULT_TIMEZONE`, else Europe/Helsinki) decides day
  boundaries on the timeline and server-rendered times.
- Dev without an IdP: `MATKA_AUTH_DISABLED=1` (ignored when `NODE_ENV=production`).

## Update 2026-10-19: two deployments, own Photon, tuned travel modes
Merged `hardening` into `main`. Decided with the owner:

- **Two supported deployments, same image**: the homelab (`compose.yml`, Caddy with a private
  CA, Tailscale only, no identity provider) and a k3s cluster (`deploy/k8s/`,
  Authentik, public TLS). See the table at the top of `docs/DEPLOY.md`.
- **`MATKA_AUTH=key`** for instances without an identity provider: one owner (`oidc_sub =
  key:owner`), a 32+ character `MATKA_LOGIN_KEY` entered once per browser, compared in
  constant time, 10 wrong tries per address per 15 minutes. Same server-side sessions and
  token-paired devices as OIDC. OIDC stays the default.
- **Own Photon** in both setups (Finland JSONL dump, reverse-only, 1 GB heap); Matka no
  longer uses Dawarich's network for place names.
- **Automatic Dawarich import** (`DAWARICH_IMPORT_URL`), resumable through `import_state`,
  read-only on the Dawarich side, run by the worker under its lock so one replica does it.
- **Travel modes tuned on the owner's own history.** Fix-to-fix speeds are mostly GPS
  jitter (a 30 m wobble in 2 s reads as 54 km/h), which turned bike rides into driving and
  trains into flights. Speeds now come from the phone's own readings when present, else
  from chords of at least a minute; the decision leans on the average speed and uses the
  85th percentile only with 5+ samples. Trains: a sustained average above 115 km/h over
  more than 50 km (no car keeps that on 120 km/h roads). Running is its own mode; buses
  still read as driving. On the owner's data this turned most
  "flying" back into trains, doubled cycling and found the runs; before: no trains or runs.
- **Private CA in release builds, pinned**: kept the rule that release builds don't trust
  user-installed CAs (an MDM profile or "VPN" app could otherwise read the device token).
  Instead any CA certificate committed to `mobile/certs/` is bundled and trusted next to the
  system store. The homelab commits Caddy's local root there; the cluster's builds have
  none and stay system-only.
- **Transit legs: one vehicle, one line** (matcher v2). Changing vehicles needs a stop, so
  legs with no dwell between them (90 s+ never further away than 9 km/h allows, looked for up
  to 5 min either side of the junction) are one vehicle: if one line explains them all (on
  every leg, sandwiched between its legs, or 80% of the leg's points within 150 m of it, going
  forward) they merge into one leg of that line, measured along its shape; otherwise a run of
  buses/trams changing line without stopping is a car and is dropped. Metro and train are
  exempt (underground stations hide the walk and wait from GPS) and absorb bus legs that
  follow their track. Tuned on a day of the owner's ground truth (a night bus with a bogus extra leg,
  another ride split by GPS noise, two car trips matched as bus chains); about 6% of trips
  change displayed mode, mostly bus → driving/cycling.

## Update 2026-10-19: transfers, recording gaps, place names
From a day of the owner's own data (a night bus, a wait at a hub named after a pub, an
afternoon with recording off shown as one 10-hour visit):

- **Transfers aren't visits.** A stay of at most 20 min whose centre is within 50 m of a
  GTFS stop (`transit_stops`), with a move on both sides, is folded into one trip; the wait
  is kept on the trip (`trips.waits`, migration 007) and shown as "Waited at Kamppi · 9 min"
  between the rides. 50 m because you wait at the platform (a typical wait: 27 m; a parking lot
  85 m from a stop stays a visit); 20 min because longer is more than a change.
  No feed loaded = no stops = every stay stays a visit. On the owner's data about one
  visit in eight was folded, almost all at metro and bus hubs.
- **Recording gaps.** A silent phone is still assumed still, except when the silence is
  over 2 h *and* the next fix is 750 m or more away: then recording was off, the stay ends
  5 min after its last fix and no trip is drawn across the hole (moves are split at any
  2 h silence). Leaving home after a quiet night gave first fixes 300-500 m out; the
  recording-off cases were 1 km or more. The timeline shows "No location recorded" for
  holes of 30 min or more. Dropped: 3 fabricated trips (e.g. "cycling 229 km in 12 h").
- **Jitter.** Stay centres are weighted by 1/accuracy²; fixes up to 400 m out while the phone
  reports `still` twice in a row are jitter and don't end the stay. Points without an
  activity behave as before.
- **Place names.** Photon is asked for 10 candidates. Roads, bridges, rail, stops, land use
  and areas are never a name. A POI only wins when it is about as near as the nearest
  address (so a home above a supermarket stays "Street 5"): any POI within 15 m, a big
  venue (mall, campus, museum, stadium...) within 60 m. Bars, pubs, nightclubs, adult and
  gambling venues, clinics and places of worship are never asserted, whatever the time or
  duration: an address is never wrong. Else "Street 2 B", else the district.
  `places.geocoder_version` (migration 006) re-geocodes every place when
  `GEOCODER_VERSION` is bumped; custom names are untouched.
