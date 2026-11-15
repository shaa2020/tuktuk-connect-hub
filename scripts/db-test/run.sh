#!/usr/bin/env bash
# Starts a throwaway local PostgreSQL 16, applies Supabase stubs + every migration in
# drizzle/migrations (in order), then runs the database policy test suite.
# Nothing here touches the production database. Usage: bash scripts/db-test/run.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${DB_TEST_PORT:-54329}"
DATA="$(mktemp -d /tmp/tt-dbtest-XXXXXX)"
AS=""
if [ "$(id -u)" = "0" ]; then chown postgres "$DATA"; AS="runuser -u postgres --"; fi
cleanup() { $AS "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT
$AS "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
$AS "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -l "$DATA/log" -w start >/dev/null
export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -d postgres -c "create database app"
"${PSQL[@]}" -d app -c "alter database app set search_path = public, extensions"
"${PSQL[@]}" -d app -f "$ROOT/scripts/db-test/supabase-stubs.sql"
# MIGRATIONS_UPTO=0018 applies only up to that number (to prove tests catch the old behaviour).
for f in "$ROOT"/drizzle/migrations/*.sql; do
  n="$(basename "$f" | cut -c1-4)"
  if [ -n "${MIGRATIONS_UPTO:-}" ] && [ "$n" \> "$MIGRATIONS_UPTO" ]; then continue; fi
  echo "applying $(basename "$f")"
  "${PSQL[@]}" -d app -1 -f "$f" >/dev/null
done
# New migrations must be safe to re-run (Lovable/Supabase may retry): apply 0019+ a second time.
if [ -z "${MIGRATIONS_UPTO:-}" ]; then
  for f in "$ROOT"/drizzle/migrations/*.sql; do
    n="$(basename "$f" | cut -c1-4)"; [ "$n" \< "0019" ] && continue
    echo "re-applying $(basename "$f") (idempotency check)"; "${PSQL[@]}" -d app -1 -f "$f" >/dev/null
  done
fi
export DATABASE_TEST_URL="postgres://postgres@127.0.0.1:$PORT/app"
cd "$ROOT"
npx vitest run --config vitest.db.config.ts "$@"
