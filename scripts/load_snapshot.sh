#!/usr/bin/env bash
# Dev helper: restore a Dawarich pg_dump (custom format) into a separate
# `dawarich` database in the local matka_db container, then import it into
# Matka with web/scripts/import-dawarich.mjs. Matka's own database is never
# touched by the restore.
#
#   scripts/load_snapshot.sh path/to/dawarich.dump you@example.com
set -euo pipefail

DUMP="${1:?usage: $0 <dawarich.dump> <matka user email or sub>}"
TO="${2:?usage: $0 <dawarich.dump> <matka user email or sub>}"
CT=matka_db

echo "==> (re)create dawarich database"
docker exec "$CT" psql -U matka -d postgres -qc "DROP DATABASE IF EXISTS dawarich WITH (FORCE)" -c "CREATE DATABASE dawarich OWNER matka"
docker exec "$CT" psql -U matka -d dawarich -qc "CREATE EXTENSION IF NOT EXISTS postgis"

echo "==> restore"
docker cp "$DUMP" "$CT":/tmp/dawarich.dump
docker exec "$CT" pg_restore -U matka -d dawarich --no-owner --no-privileges /tmp/dawarich.dump 2>&1 |
  grep -viE "already exists" || true
docker exec "$CT" rm /tmp/dawarich.dump

echo "==> import into Matka"
cd "$(dirname "$0")/../web"
DATABASE_URL="${DATABASE_URL:-postgresql://matka:matka@localhost:5544/matka}" \
  node scripts/import-dawarich.mjs --from postgresql://matka:matka@localhost:5544/dawarich --to "$TO"
