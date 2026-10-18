# Deploying Matka

One Docker image (`web/Dockerfile`, published by CI as `ghcr.io/zawaer/matka`) runs the web
app, the device API and the background processing worker. It needs PostgreSQL with PostGIS.
It migrates the database on start. `deploy/k8s/matka.yaml` is a complete k3s example
(Postgres, app, ingress-nginx, nightly backups).

## 1. Authentik

In Authentik, under **Applications → Providers**, create an **OAuth2/OpenID Provider**:

- Client type **Confidential**. Note the client ID and secret.
- Redirect URI: `https://<matka host>/auth/callback` (strict).
- Signing key: any (RS256). Scopes: the default `openid`, `email` and `profile` mappings.

Then create an **Application** that uses this provider (slug e.g. `matka`). The issuer is
`https://<authentik host>/application/o/<slug>/`.

Who may sign in: put your Authentik user's **sub** in `MATKA_ALLOWED_USERS`. To find it, sign
in once with the allowlist set to a placeholder. Matka refuses you and logs
`denied sub=…`; copy that value. Emails also work (only if Authentik marks them
`email_verified`), but Authentik users can change their own email by default. To let Authentik decide instead, bind a policy or group to the application
and set `MATKA_ALLOWED_USERS=*`.

## 2. Configuration

Every variable is documented in `web/.env.example`. Required in production:

| Variable | |
| --- | --- |
| `DATABASE_URL` | `postgresql://…` with PostGIS available (the migration creates the extension) |
| `APP_URL` | Public `https://` URL. Used for the OIDC redirect and the server address phones pair with |
| `MATKA_SECRET` | ≥ 32 random chars (`openssl rand -base64 48`). Keep it stable |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | From step 1 |
| `MATKA_ALLOWED_USERS` | See above |

Optional: `PHOTON_URL` (self-hosted Photon for place names), `MATKA_DEFAULT_TIMEZONE`,
`MATKA_WORKER=off` (disable the worker on a replica), `MATKA_WORKER_INTERVAL_MS`.

## 3. Reverse proxy

TLS terminates at the proxy. Matka must be reached on `APP_URL` exactly. Allow request bodies
of at least 1 MB (`nginx.ingress.kubernetes.io/proxy-body-size: 2m`) for phone uploads. Point
probes at `GET /api/health`, which is unauthenticated and reports only database reachability.

Don't publish Postgres. The dev `db/docker-compose.yml` binds to `127.0.0.1` with throwaway
credentials. Production should use the in-cluster Service only, with a real password.

## 4. Import your Dawarich history

Sign in to Matka once so your user exists, then run the importer inside the app container:

```bash
kubectl -n matka exec -it deploy/matka -- \
  node scripts/import-dawarich.mjs \
    --from 'postgresql://postgres:<pw>@<dawarich-db-host>:5432/dawarich_development' \
    --to you@example.com
```

It copies points only (skipping Dawarich-flagged anomalies). It is safe to re-run. Visits,
trips and places are computed by Matka within a minute or two; the server log shows
`[worker] user 1: processed N points`.

## 5. Pair your phone

In Matka, go to **Devices → Pair a device** and scan the QR code with the Matka app. See
`mobile/README.md` for building and installing the app and the recommended phone settings.

## Backups and restore

The example CronJob runs `pg_dump -Fc` nightly and keeps 14 days. Copy the dumps off the node.
`points` is the only irreplaceable table; visits and trips are recomputed from it. To restore:
`pg_restore --clean --if-exists -d "$DATABASE_URL" matka-YYYY-MM-DD.dump`. Settings → Your data
also exports all points as CSV/GeoJSON.

## Upgrading

Pull the new image tag and restart. Migrations run automatically and are serialized with a
lock, so a rolling update is fine.
