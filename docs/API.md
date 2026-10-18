# Matka device API

The contract between the Matka server and the mobile collector. Everything else
on the server sits behind Authentik (OIDC) login; these endpoints authenticate
with a **device token** instead, so a background collector never needs an
interactive login.

## Pairing

1. Log in to the web app → **Devices** → **Pair a device** → give it a name.
2. The server shows a one-time view of the token, as a QR code and as text.
   Only a hash is stored, so it cannot be shown again; revoke and re-pair if lost.
3. QR / pairing link payload:

   ```
   matka://pair?server=<url-encoded base URL>&token=<token>
   ```

   e.g. `matka://pair?server=https%3A%2F%2Fmatka.example.com&token=mtk_…`

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
      "battery": 87          // optional, 0..100
    }
  ]
}
```

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

## Viewer (read-only)

The app's viewer screens read with the same `Authorization: Bearer <token>`.
These are `GET` only; a device token can never change anything. All times are
ISO-8601 UTC; durations seconds; distances metres.

| Endpoint | Returns |
| --- | --- |
| `GET /api/overview` | `{ totals: {points, visits, trips, days, distance, first, last}, months: [{year, month, distance}] (last 12), topPlaces: [{id, name, hours}], recent: [{id, placeId, name, startedAt, duration}] }` |
| `GET /api/timeline[?date=YYYY-MM-DD]` | `{ day: {date, items: [{kind:"visit", visit:{id, startedAt, endedAt, duration, placeId, placeName, category, lat, lon}} \| {kind:"move", track:{id, startedAt, endedAt, distance, duration, mode}}]}, dates: [...], minDate, maxDate }`. Days are in the account's time zone; without `date`, the latest day with data. `mode` is one of `walking, running, cycling, driving, bus, train, flying, boat, motorcycle, stationary, unknown`. |
| `GET /api/places` | `{ places: [{id, name, city, country, category, visitCount, totalTime, lastVisit}] }`; `name` may be null (unknown), `category` is an OSM value like `cafe`. |
| `GET /api/places/:id/photos` | `{ configured, photos: [{id, thumbUrl, takenAt}] }`; `thumbUrl` is a path on the server, fetch it with the bearer header. |

Same `401` rule as ingest: a request carrying `Authorization` is judged on that token
only (cookies are ignored). Send API requests without cookies (`credentials: "omit"`),
because on Android `fetch` shares the WebView's cookie jar.

Details:
- `topPlaces` and `recent` hold at most 8 entries; `hours` is fractional.
- With no data yet, the timeline returns `day.date: ""`, `dates: []` and `minDate`/`maxDate: null`.
- On a server error these return `500 {"error": "…"}` (`/api/places` also includes `places: []`);
  treat that like any 5xx and retry later.

### Map in a WebView

Never put the token in a URL. Instead:

1. `POST /api/device/embed-ticket` with the bearer header → `{ "url": "https://…/embed/start?ticket=…" }`.
   The URL is valid for 60 seconds and is built from the server's configured public URL
   (`APP_URL`), the same base URL the pairing QR code carries. A client may refuse a URL on any
   other origin.
2. Load that URL in the WebView. The server sets an httpOnly cookie (12 h, read-only, dies when the device
   is revoked) and redirects to `/embed/map`, a full-screen map without the web navigation.
3. Expiry looks like this:
   - an expired or invalid ticket → `401` plain text ("This map link has expired…");
   - an expired or revoked map cookie → `200` HTML page saying "Session expired", and the map's
     data requests get `401`.

   In both cases, get a new ticket and reload.

## `GET /api/health`

Unauthenticated liveness/readiness probe: `200 {"ok":true}` when the database is
reachable, `503` otherwise. Leaks nothing else.
