# Matka web

The Matka web app, device API and processing worker. Setup and deployment are covered in the
[repo README](../README.md) and [docs/DEPLOY.md](../docs/DEPLOY.md).

- `src/app`: pages and route handlers (`api/ingest` is the device API, `auth/*` the OIDC flow)
- `src/proxy.ts`: session gate in front of everything
- `src/lib/processing`: visit/trip detection, geocoding, background worker
- `migrations/`, `scripts/migrate.mjs`, `scripts/import-dawarich.mjs`
