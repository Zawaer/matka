#!/usr/bin/env bash
# Apply db/migrations/*.sql (all idempotent) to the database in DATABASE_URL,
# or to the local matka_db container when DATABASE_URL is unset.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/../db/migrations" && pwd)"

for f in "$DIR"/*.sql; do
  echo "==> $(basename "$f")"
  if [[ -n "${DATABASE_URL:-}" ]]; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
  else
    docker exec -i -e PGPASSWORD=matka matka_db psql -U matka -d matka -v ON_ERROR_STOP=1 -q < "$f"
  fi
done
echo "==> done"
