#!/usr/bin/env bash
# Load the Dawarich snapshot (data/dawarich.dump) into the local matka_db PostGIS container.
# Safe to re-run: it drops & recreates matching tables from the custom-format dump.
set -euo pipefail

DUMP="${1:-data/dawarich.dump}"
CT=matka_db
DB=matka
USER=matka

echo "==> ensure postgis extension"
docker exec -e PGPASSWORD=matka "$CT" psql -U "$USER" -d "$DB" -c "CREATE EXTENSION IF NOT EXISTS postgis;" >/dev/null

echo "==> copy dump into container"
docker cp "$DUMP" "$CT":/tmp/dawarich.dump

echo "==> restore (clean, no owner)"
# --clean drops existing objects first; --if-exists avoids errors on first run.
docker exec -e PGPASSWORD=matka "$CT" pg_restore -U "$USER" -d "$DB" \
  --no-owner --no-privileges --clean --if-exists /tmp/dawarich.dump 2>&1 | \
  grep -viE "does not exist, skipping|already exists" || true

echo "==> row counts"
docker exec -e PGPASSWORD=matka "$CT" psql -U "$USER" -d "$DB" -t -c \
  "SELECT 'points', count(*) FROM points UNION ALL SELECT 'visits', count(*) FROM visits UNION ALL SELECT 'tracks', count(*) FROM tracks UNION ALL SELECT 'places', count(*) FROM places;"
echo "==> done"
