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
| 200 | `{"received":n,"inserted":i,"duplicates":d,"rejected":r}` | Batch accepted. **Delete the whole batch from the local queue**, even if some were duplicates (already stored) or rejected (invalid, will never succeed). |
| 400 | `{"error":"…"}` | Body is not valid JSON / wrong shape. Drop the batch (it will never succeed). |
| 401 | `{"error":"unauthorized"}` | Token invalid or revoked. Keep queue, stop, prompt re-pair. |
| 413 | `{"error":"too large"}` | Split the batch and retry. |
| 5xx / network error | — | Keep queue, retry later with backoff. |

Uploads are **idempotent**: re-sending the same point (same timestamp) is
reported as a duplicate, never stored twice. So it is always safe to retry a
batch whose response was lost.

## `GET /api/ingest`

Status for the collector UI.

```json
{ "ok": true, "device": "Pixel 8", "points": 113871, "last": "2026-10-18T14:03:11.000Z" }
```

`points` / `last` are totals for the account (all devices); `last` is the
newest stored fix or `null`.

## `GET /api/health`

Unauthenticated liveness/readiness probe: `200 {"ok":true}` when the database is
reachable, `503` otherwise. Leaks nothing else.
