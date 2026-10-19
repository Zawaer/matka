# Matka

Self-hosted location history: a timeline of where you've been and how you got there, places
with photos from your Immich library, and a map and heatmap. A small Expo app on your phone
collects your location in the background and uploads it to your own server.

- `web/`: Next.js app. UI, device API, processing worker, one Docker image.
- `mobile/`: Expo / React Native collector (Android, iOS-compatible).
- `docs/`: [deploy](docs/DEPLOY.md) · [device API](docs/API.md) · [schema](docs/SCHEMA.md) · [decisions](docs/DECISIONS.md)
- `deploy/k8s/`: example k3s manifests.

## Develop

```bash
(cd db && docker compose up -d)               # PostGIS on 127.0.0.1:5544
cd web
cp .env.example .env.local                    # set MATKA_AUTH_DISABLED=1 to skip login locally
npm install
DATABASE_URL=postgresql://matka:matka@localhost:5544/matka npm run migrate
npm run dev
```

Demo data: `DATABASE_URL=… node scripts/seed-demo.mjs --reset --save` fills the key-mode
owner's account with ~3 months of made-up history around Helsinki (commutes, weekends in town,
trips to Tampere, Tallinn and Berlin, a recording gap), deterministic per `--seed`; the worker
turns it into visits and trips on its next tick. Options are in the script's header. Dev only.

Tests: `npm test`. DB integration tests run when `TEST_DATABASE_URL` points at a scratch
PostGIS database; it gets wiped.
