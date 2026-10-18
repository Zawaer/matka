# Matka web

Next.js app: the Matka UI plus the device API in [`docs/API.md`](../docs/API.md).

## Setup

```bash
cp .env.example .env.local        # then fill it in; every variable is documented there
(cd ../db && docker compose up -d) # local PostGIS on :5544
../scripts/load_snapshot.sh        # seed from the Dawarich dump (once)
../scripts/migrate.sh              # Matka's own tables (idempotent, re-run after pulls)
npm install
npm run dev
```

## Auth

Register an OAuth2/OpenID provider + application in Authentik:

- Client type **confidential**, redirect URI `<APP_URL>/auth/callback`.
- Scopes `openid profile email`.
- Copy the issuer (`https://<authentik>/application/o/<slug>/`), client ID and secret into
  `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`.
- Put your Authentik user's `sub` (or email) in `MATKA_ALLOWED_USERS`. With it empty, nobody can
  sign in; denied attempts are logged with their `sub` so you can copy it from there.

For local work without Authentik, set `MATKA_AUTH_DISABLED=1` (has no effect in production).

## Devices

Pair phones from **Devices** in the app. `GET /api/health` is the unauthenticated probe for the
reverse proxy / container healthcheck.
