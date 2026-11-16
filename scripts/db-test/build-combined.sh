#!/usr/bin/env bash
# Rebuilds drizzle/manual/0019-0030_combined.sql from the individual migrations (0019 onward).
set -euo pipefail
cd "$(dirname "$0")/../.."
{
  echo "-- COMBINED SaaS migrations 0019+ — fallback for manual application (e.g. Lovable Cloud SQL editor)."
  echo "-- Safe to run more than once: every statement is idempotent. Take a database backup first."
  echo "-- Generated from drizzle/migrations by scripts/db-test/build-combined.sh — do not edit by hand."
  echo
  for f in drizzle/migrations/*.sql; do
    n="$(basename "$f" | cut -c1-4)"; [ "$n" \< "0019" ] && continue
    echo "-- ===== $(basename "$f") ====="; cat "$f"; echo
  done
} > drizzle/manual/0019-0030_combined.sql
