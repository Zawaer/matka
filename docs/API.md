# Matka device API

The contract between the Matka server and the mobile collector. Everything else
on the server sits behind Authentik (OIDC) login; these endpoints authenticate
with a **device token** instead, so a background collector never needs an
interactive login.

## Pairing

1. Log in to the web app → **Devices** → **Pair a device** → give it a name.
2. The server shows a one-time view of the token, as a QR code and as text.
   Only a hash is stored, so it cannot be shown again; revoke and re-pair if lost.
3. QR / pairing link payload, an https link to the server's public `/pair` page
   with server and token in the fragment (never sent to the server, so never logged):

   ```
   <base URL>/pair#server=<url-encoded base URL>&token=<token>
   ```

   e.g. `https://matka.example.com/pair#server=https%3A%2F%2Fmatka.example.com&token=mtk_…`

   A phone's system camera opens it in the browser; the page offers **Open in Matka**,
   which is the app's deep link:

   ```
   matka://pair?server=<url-encoded base URL>&token=<token>
   ```

   The app accepts both forms (scanned, deep-linked or pasted). For the https form it
   requires an https link whose scheme, host, port and path prefix equal the `server`
   parameter's.

Tokens look like `mtk_` followed by 43 base64url characters. Revoking a device
in the web UI makes every request with its token fail with `401` immediately.

The server base URL must be `https://` (plain `http://` is only acceptable for
`localhost`/`127.0.0.1`/`10.0.2.2` during development).

## Authentication

Every device request sends:

```
Authorization: Bearer <token>
```

Missing, malformed, unknown or revoked token → `401 {"error":"unauthorized"}`.
The collector should stop uploading, keep its queue, and show "pairing lost".

## `POST /api/ingest`

Upload a batch of fixes.

```jsonc
{
  "points": [
    {
      "lat": 60.1699,        // required, -90..90
      "lon": 24.9384,        // required, -180..180
      "ts": 1760781600,      // required: epoch seconds, epoch ms, or ISO-8601 string
      "accuracy": 12.5,      // optional, metres (horizontal)
      "altitude": 14.2,      // optional, metres
      "speed": 1.3,          // optional, m/s (negative = unknown, ignored)
      "battery": 87,         // optional, 0..100
      "activity": "on_bicycle" // optional: still | walking | running | on_bicycle | in_vehicle
    }
  ]
}
```

`activity` is the phone's own motion classification when the fix was taken (Android
Activity Recognition, iOS Core Motion): send it only when the OS is reasonably confident
and the reading is fresh (the Matka app: confidence ≥ 50%, under 3 minutes old). Unknown
values are ignored like other invalid optional fields. It decides between modes that
speed can't tell apart, e.g. a bike and a city bus.

Limits: at most **1000 points** and **1 MB** per request.

Responses:

| Status | Body | Meaning / collector action |
| --- | --- | --- |
| 200 | `{"received":n,"inserted":i,"duplicates":d,"rejected":r}` | Batch accepted. A 200 **always** carries this receipt; treat a 200 without it (e.g. a captive portal) as a retryable failure. **Delete the whole batch from the local queue**, even if some were duplicates (already stored) or rejected (invalid, will never succeed). |
| 400 | `{"error":"…"}` | Body is not valid JSON / wrong shape. Drop the batch (it will never succeed). |
| 401 | `{"error":"unauthorized"}` | Token invalid or revoked. Keep queue, stop, prompt re-pair. |
| 413 | `{"error":"too large"}` | Split the batch and retry. |
| 5xx / network error | — | Keep queue, retry later with backoff. |
| anything else (3xx, 403, 404, 429, …) | — | Not sent by Matka itself (a proxy in between). Keep queue, retry with backoff. |

Uploads are **idempotent**: re-sending the same point (same timestamp) is
reported as a duplicate, never stored twice. Matka keeps **one fix per second**
per account (timestamps are truncated to whole seconds), so send whole epoch
seconds; a second fix within the same second counts as a duplicate. So it is always safe to retry a
batch whose response was lost.

## `GET /api/ingest`

Status for the collector UI.

```json
{ "ok": true, "device": "Pixel 8", "points": 113871, "last": "2026-10-18T14:03:11.000Z" }
```

`points` / `last` are totals for the account (all devices); `last` is the
newest stored fix or `null`.

## `POST /api/devices/heartbeat`

The collector's recording watchdog checks in (the Matka app: from its periodic
background job, ~every 15 min while recording, and when the app is opened), so
the web Devices page can warn when a phone that should be recording goes quiet.

```jsonc
{
  "recording": true,              // required: the user turned recording on
  "mode": "standby",              // required: active | standby | off ("off" whenever recording is false)
  "lastFixAt": "2026-10-19T11:33:00Z", // newest fix on the phone (ISO-8601 or epoch s/ms), or null
  "queued": 42,                   // points waiting to upload
  "appVersion": "1.0.0 (1)",      // free text, ≤ 64 chars
  "recoveries": 1,                // watchdog restarts in the last 24 h
  "problem": null,                // recording wanted but impossible: "permission" | "not_running" | null
  "preset": "precise",            // low | balanced | precise | max | custom
  "custom": null,                 // for "custom": {"accuracy": "balanced|high|highest", "distance": m, "time": ms}
  "smartTracking": true,
  "usage": [                      // what the recorder did, today and yesterday (phone's local days), running totals
    {"day": "2026-10-28", "preset": "precise", "activeS": 1320, "standbyS": 50000, "offS": 0,
     "fixes": 210, "movingS": 1500, "stillS": 48000,
     // whole-phone current while unplugged (mA, discharge positive): screen off with GPS active / in standby, screen on
     "current": {"active": {"n": 12, "mean": 412, "median": 405}, "standby": {...}, "screen": {...}},
     "dropMah": 1240, "dropS": 34000}   // charge-counter fall while unplugged, and the time it covers
  ]
}
```

`preset`, `custom`, `smartTracking` and `usage` are optional (apps from before
2026-10-28 omit them). The preset is stored in `devices.status`, and a change
adds a row to `device_preset_log`; `usage` rows are upserted into
`device_daily_usage` (a row that counts less time than the stored one is
ignored). Bodies are limited to 8 KB.

Responses: `200 {"ok":true}`; `400` for a malformed body (wrong JSON, missing
`recording`/`mode`; invalid optional fields are ignored); `401` as above; `413`
above 8 KB. A server from before heartbeats answers `404`: the collector just
tries again later. Every accepted `POST /api/ingest` also counts as contact
(`devices.heartbeat_at`), but only a heartbeat updates the status.

The Devices page shows, per device: "Recording · last location 12 min ago ·
standby", "Recording is off on this phone", or a red "No contact for 5 h while
recording was on" once neither a heartbeat nor an upload arrived for 3 h.

## Viewer (read-only)

The app's viewer screens read with the same `Authorization: Bearer <token>`.
These are `GET` only; a device token can never change anything. All times are
ISO-8601 UTC; durations seconds; distances metres.

| Endpoint | Returns |
| --- | --- |
| `GET /api/overview` | `{ totals: {points, visits, trips, days, distance, first, last}, months: [{year, month, distance}] (last 12), topPlaces: [{id, name, hours}], recent: [{id, placeId, name, startedAt, duration}] }` |
| `GET /api/timeline[?date=YYYY-MM-DD]` | `{ day: {date, items: [{kind:"visit", visit:{id, startedAt, endedAt, duration, placeId, placeName, category, lat, lon}} \| {kind:"move", track:{id, startedAt, endedAt, distance, duration, mode, legs?, waits?}}]}, dates: [...], minDate, maxDate }`. Days are in the account's time zone; without `date`, the latest day with data. With transit lines on, `legs: [{kind, lines, fromStop, toStop, startedAt, endedAt, distance}]` are the public transport rides matched within the move; `waits: [{startedAt, endedAt, stop}]` are transfers folded into it ("Waited at Kamppi"). Both are left out when empty. `mode` is one of `walking, running, cycling, driving, bus, train, flying, boat, motorcycle, stationary, unknown`. A visit also has `placeKind` (saved kind or null), `osmKey` (OSM key of the place's feature, for its category icon) and, when its name is a guess among several ("Visited X?"), `candidates: [{name, category, address}]` to pick from. A move may have `from`/`to` (`{lat, lon}`), `path` (the recorded line simplified to about 1/100 of its extent, a few dozen `[lon, lat]` pairs: enough to sketch the day, not to draw it on a map), `correctionId` (the user fixed it) and `added: true` (the user added it where nothing was recorded; its `id` is negative). |
| `GET /api/places` | `{ places: [{id, name, city, country, category, visitCount, totalTime, lastVisit, kind, radius}] }`, saved places first, then most visited; `name` may be null (unknown), `category` is an OSM value like `cafe`, `kind` is what the place was saved as (`home, family, school, work, other`) or null. |
| `GET /api/day-summary?date=YYYY-MM-DD` | `{ date, distance, duration, modes: [{mode, distance, duration, count}] }` for one local day, modes largest distance first. A trip crossing midnight is split between the days by time (distance pro rata). |
| `GET /api/insights/modes[?month=YYYY-MM]` | `{ month, distance, duration, modes: [{mode, distance, duration, count, history: [{month, distance, duration}]}], historyMonths, firstMonth, lastMonth }`. Default month: the latest with trips. `history` is the six months ending at `month`, oldest first; `modes` lists every mode used in those six months (zeros included) in a fixed order. |
| `GET /api/search?q=…` | `{ query, places: [{id, name, kind, category, city, country, visitCount, totalTime, firstVisit, lastVisit, lastVisitDate, recentDates, match}], areas: [{type, name, country, places, visits, duration, lastVisit, href}] }`: places whose name (or old geocoded name), street, saved kind, type, city or country contain every word of `q`, case- and accent-insensitive; best name match first (exact, prefix, word prefix, substring), then most visits, most recent. At most 30 places. `firstVisit`/`lastVisit` are the starts of the first and latest visit; `lastVisitDate` and `recentDates` (up to 5, newest first) are local dates (`YYYY-MM-DD`) for `/timeline?date=`. `match` is `name, address, kind, category` or `area` (only the city/country matched). `areas` are cities (`type: "city"`, with their `country`) and countries whose own name matches, with totals and the web page in `href`. An empty `q` returns nothing. |
| `GET /api/insights/saved[?month=YYYY-MM]` | `{ month, saved, rows: [{placeId, name, kind, seconds, nights}] }`: time per saved place in the month (default: the current one), most time first. `saved` is how many places are saved at all; `kind` is `home, family, school, work` or `other`; `nights` counts nights (keyed by the morning) whose 00:00–06:00 was mostly spent there. Places with no time that month are left out. |
| `GET /api/insights/trips` | `{ home: {lat, lon, nights, city, country, saved} \| null, trips: [{id, name, startDate, endDate, days, nights, departure, arrival, cities: [{city, country, duration, firstSeen, away}], countries, distance, duration, modes, cover}] }`, newest first. `cover` is an Immich asset id (or `null`); fetch it via `/api/immich/asset/<id>`. |
| `GET /api/insights/trips/:id` | `{ trip }` as above plus `dayList: [{date, distance, duration, modes, cities}]` and `photos` (up to 8 more asset ids for a strip); `404` for an unknown id. |
| `GET /api/immich/asset/:id[?size=thumbnail\|preview]` | The image bytes of an Immich asset (default `thumbnail`), proxied so the Immich key stays on the server; `404` when Immich isn't set up. Send the bearer header (e.g. as image request headers). |
| `GET /api/insights/world[?sort=visits\|places\|time\|recent\|name]` | `{ countries: [{name, places, visits, duration, lastVisit, cities}], cities: [{name, country, places, visits, duration, lastVisit}], unplaced }`. |
| `GET /api/insights/world?city=…&country=…` | `{ city, country, places: [...] }`, the `/api/places` item shape, most visited first. |
| `GET /api/insights/quality[?days=30]` | `{ fromDate, toDate, periods: [{label, preset, start, end, total, days: [{date, ...stats}]}], comparison: {at, days, before, after} \| null, usage: [{preset, label, days: [{day, activeS, standbyS, fixes, movingS, stillS, current, dropMah, dropS, estimate: {mAh, percent, ...}}], perDay, current, dropMah, dropS}], model: {calibrated, device, batteryMah}, rules }`. Recording quality of the app's fixes per local day, split at recording-preset changes (`lib/insights/quality.ts`; `start`/`end` null = open); `stats` = `{fixes, hours, fixesPerHour, standbyShare, moving: {minutes, fixes, fixesPerMinute, secondsPerFix, intervalMedianS, intervalP90S, accuracyMedian, accuracyP90, within10, within20, over50, pathNoise} \| null}`; `comparison` is the 7 days before vs after the latest change. `usage` is Matka's own battery use per day and preset, an estimate (`lib/insights/powerModel.ts`), with the phone's whole-phone measurements. `days` 1–120. |
| `GET /api/timeline/photos?date=YYYY-MM-DD` | `{ configured, pending, linkBase, items: [{key, ids, total}], points: [{id, key, lat, lon}] }`: the Immich camera photos taken during each visit and move of the day, keyed like the day map (`v-<visit id>`, `m-<trip id>`), oldest first (`ids` at most 60; `total` all). `points` are the GPS-tagged ones. `pending: true` = still being looked up, ask again in a few seconds. `linkBase` is the user's Immich web address for "Open in Immich" (`<linkBase>/photos/<id>`), or null. |
| `GET /api/places/:id/photos` | `{ configured, photos: [{id, thumbUrl, takenAt}] }`; `thumbUrl` is a path on the server, fetch it with the bearer header. |

Same `401` rule as ingest: a request carrying `Authorization` is judged on that token
only (cookies are ignored). Send API requests without cookies (`credentials: "omit"`),
because on Android `fetch` shares the WebView's cookie jar.

Details:
- `topPlaces` and `recent` hold at most 8 entries; `hours` is fractional.
- Insight modes are the displayed ones: with transit lines on, a trip at least half covered by matched
  transit legs counts as the kind covering most of it (`tram`, `metro` can then appear too).
- Trips (`/api/insights/trips`) are found automatically: home is where most nights (00:00–06:00 local)
  are spent; a trip is a run of nights more than 30 km from home, from leaving home to getting back.
  `id` is the trip's first day (`YYYY-MM-DD`), stable as long as that day doesn't change. `arrival` is
  null while still away. `startDate`/`endDate`/`dayList[].date` are local dates; `departure`, `arrival`
  and `firstSeen` are ISO instants.
- World entries count places with at least one visit, grouped by the geocoder's `city`/`country`;
  `unplaced` counts places with neither.
- Months and days follow the account's time zone. Bad `date`/`month`/`sort` values get `400`.
- With no data yet, the timeline returns `day.date: ""`, `dates: []` and `minDate`/`maxDate: null`.
- On a server error these return `500 {"error": "…"}` (`/api/places` also includes `places: []`);
  treat that like any 5xx and retry later.

### Timeline changes

The only writes a device token may make, from the Timeline tab (JSON bodies, answers as below,
`400 {error}` for bad input):

- `POST /api/corrections {startedAt, endedAt, mode, legs?: [{kind, line, transferStop?}]}` fixes the
  trip in that time range ("Fix this trip"); with `added: true, from: {lat, lon}, to: {lat, lon}` it
  adds a trip where none was recorded ("Missing travel" → "Add travel"). Answers `{correction}`.
- `DELETE /api/corrections/:id` undoes either.
- `POST /api/places/:id/confirm` answers "Visited X?": `{confirm: true}` keeps the shown name,
  `{name, category?}` names the place (a candidate or typed). Answers `{ok: true}`; `404` for
  someone else's place.

### Map in a WebView

Never put the token in a URL. Instead:

1. `POST /api/device/embed-ticket` with the bearer header → `{ "url": "https://…/embed/start?ticket=…" }`.
   The URL is valid for 60 seconds and is built from the server's configured public URL
   (`APP_URL`), the same base URL the pairing QR code carries. A client may refuse a URL on any
   other origin.
2. Load that URL in the WebView, optionally with `&theme=light` or `&theme=dark` appended so the map
   matches the app's appearance. The server sets an httpOnly cookie (12 h, read-only, dies when the device
   is revoked) and redirects to `/embed/map`, a full-screen map without the web navigation.
   With `&to=day` (optionally `&date=YYYY-MM-DD`) it redirects to `/embed/day` instead: one day of
   the timeline on a map (the day's trips in mode colours, its stops numbered in timeline order),
   for the app's Timeline tab. Once the cookie is set, the app switches days without reloading:
   - app → page: `window.matkaDay.setDate("YYYY-MM-DD")`, `window.matkaDay.select(key | null)`
     (pans to and highlights a row's stop or trip);
   - page → app: `ReactNativeWebView.postMessage` JSON `{ "type": "matka-day", "event": … }` with
     event `ready` (bridge installed; `drawn: true` from pages that send `drawn`), `day` (`date`,
     `hasMap`: false when there's nothing to draw; the day's data is in, the map may still be
     loading), `drawn` (`date`: its lines and the basemap under them are on screen),
     `select` (`key`: a stop or line was tapped), `error`, or `expired` (the cookie died).
     A client keeps its own placeholder up until `drawn`, or until `day` when `ready` didn't say `drawn`.

   Keys are `v-<visit id>` and `m-<trip id>` from `GET /api/timeline`.
3. Expiry looks like this:
   - an expired or invalid ticket → `401` plain text ("This map link has expired…");
   - an expired or revoked map cookie → `200` HTML page saying "Session expired", and the map's
     data requests get `401`.

   In both cases, get a new ticket and reload.

## `GET /api/health`

Unauthenticated liveness/readiness probe: `200 {"ok":true}` when the database is
reachable, `503` otherwise. Leaks nothing else.
