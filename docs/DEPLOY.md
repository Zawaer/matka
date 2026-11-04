# Deploying Matka

There are two supported setups. Both run the same image and code; they differ in how
people sign in and how the app is reached.

| | Homelab (`compose.yml`) | Cluster (`deploy/k8s/`) |
| --- | --- | --- |
| Runs with | Docker Compose, `docker compose up -d --build matka` | k3s, image from GHCR |
| Reached at | `MATKA_APP_URL` via your reverse proxy (e.g. Caddy over Tailscale) | public host via ingress-nginx |
| TLS | Caddy's private CA (installed on your devices) | public certificate |
| Sign-in | `MATKA_AUTH=key`: one owner, a login key | OIDC (Authentik) + allowlist |
| Place names | own Photon container (`matka_photon`) | own Photon (`photon.yaml`) |

## Homelab

`compose.yml` starts Matka, its PostGIS and its Photon. Non-secret settings are in the
compose file; put the three secrets and two settings in `.env` next to `compose.yml`:

```bash
cd ~/matka
cat >> .env <<EOF
MATKA_APP_URL=https://matka.example.com
MATKA_PROXY_NETWORK=proxy_net
MATKA_DB_PASSWORD=$(openssl rand -hex 24)
MATKA_SECRET=$(openssl rand -base64 48 | tr -d '\n')
MATKA_LOGIN_KEY=$(openssl rand -base64 36 | tr -d '\n')
EOF
chmod 600 .env
grep MATKA_LOGIN_KEY .env   # the key you sign in with; keep it in your password manager
```

`MATKA_PROXY_NETWORK` is the existing Docker network your reverse proxy is on (created
outside this file); the proxy forwards `MATKA_APP_URL` to `matka:3000`.

Then run `docker compose up -d --build matka`. On first start the worker copies your Dawarich history by
itself (see "Import your Dawarich history" below), and Photon indexes Finland (a few
minutes). Open your `MATKA_APP_URL`, paste the login key once per browser, then pair
the phone under **Devices**.

The login key works like a password: anyone with it can sign in. To rotate it, change
`MATKA_LOGIN_KEY` and redeploy; existing sessions last until they expire or you use
**Sign out everywhere else** in Settings.

## Cluster

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
`MATKA_WORKER=off` (disable the worker on a replica), `MATKA_WORKER_INTERVAL_MS`,
`CLAUDE_ACCOUNTS_URL` and `CLAUDE_ACCOUNTS_TOKEN` (the AI place picker, below).

### AI place picker (optional)

Where Photon finds several shops, cafés or venues next to each other, Matka can let a
small Claude model pick the one you were most likely at from when and how long you stay
there. It runs on the shared accounts of a
[claude-accounts](https://github.com/Zawaer/claude-accounts) service (which picks an
account, hands over its setup token and hears back about rate limits) through the Claude
Agent SDK; the image carries Claude Code's binary for that (about 280 MB).

It is off unless both variables are set, and then each user turns it on under
**Settings → Place names**. Per ambiguous place the model is sent only the candidate
names, their OSM types and distances in metres, whether a street address is an option
(not the address), and the visit pattern in local time (count, usual start hour and
length, weekend and night share). Never coordinates, addresses, dates or tracks. Saved
and renamed places are skipped; bars, clinics and places of worship are never candidates;
only confident picks (`ai_name`) are shown, and a rename always wins.

Homelab, once:

```bash
# 1. A token for Matka in the claude-accounts service
cd ~/claude-accounts
TOKEN=$(openssl rand -hex 24)
# add it to API_TOKENS (comma-separated) in that .env:
sed -i -e "s/^API_TOKENS=\(..*\)$/API_TOKENS=\1,$TOKEN/" -e "s/^API_TOKENS=$/API_TOKENS=$TOKEN/" .env
docker compose up -d
# 2. The same token for Matka
echo "CLAUDE_ACCOUNTS_TOKEN=$TOKEN" >> ~/matka/.env
docker compose up -d --build matka
```

Limits: one request (up to 20 places) per worker tick, `MATKA_AI_REQUESTS_PER_DAY`
(default 40), a 60 s timeout (`MATKA_AI_TIMEOUT_MS`), and a pause until the reset after a
rate limit. Model: `MATKA_AI_MODEL` (default `claude-haiku-5-5`).

## 3. Reverse proxy

TLS terminates at the proxy. Matka must be reached on `APP_URL` exactly. Allow request bodies
of at least 1 MB (`nginx.ingress.kubernetes.io/proxy-body-size: 2m`) for phone uploads. Point
probes at `GET /api/health`, which is unauthenticated and reports only database reachability.

Don't publish Postgres. The dev `db/docker-compose.yml` binds to `127.0.0.1` with throwaway
credentials. Production should use the in-cluster Service only, with a real password.

## 4. Import your Dawarich history

Automatic: set `DAWARICH_IMPORT_URL` to a **read-only** connection to Dawarich's database
(e.g. the `matka_ro` role) and, with OIDC, `DAWARICH_IMPORT_TO` to your email or `sub`
(sign in once first; in key mode it defaults to the owner). The worker copies the points
in pages of 5,000 and logs `[import] dawarich: 45000/113872 read (40%), 44980 new`.
Progress is kept in the `import_state` table: an interrupted import resumes where it
stopped, and once it has finished it never runs again. Every read is in a read-only
transaction; Matka never writes to Dawarich. Afterwards the variable can stay or go.

Manual alternative (same result), inside the app container:

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
