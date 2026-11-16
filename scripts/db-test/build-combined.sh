#!/usr/bin/env bash
# Rebuilds drizzle/manual/0019-0030_combined.sql from migrations 0019–0030 (the SaaS upgrade set).
# Later migrations are applied normally by Lovable/Drizzle and are not part of this fallback file.
set -euo pipefail
cd "$(dirname "$0")/../.."
{
  echo "-- COMBINED SaaS migrations 0019+ — fallback for manual application (e.g. Lovable Cloud SQL editor)."
  echo "-- Safe to run more than once: every statement is idempotent. Take a database backup first."
  echo "-- Generated from drizzle/migrations by scripts/db-test/build-combined.sh — do not edit by hand."
  echo
  for f in drizzle/migrations/*.sql; do
    n="$(basename "$f" | cut -c1-4)"; { [ "$n" \< "0019" ] || [ "$n" \> "0030" ]; } && continue # this file covers exactly 0019–0030
    echo "-- ===== $(basename "$f") ====="; cat "$f"; echo
  done
} > drizzle/manual/0019-0030_combined.sql
