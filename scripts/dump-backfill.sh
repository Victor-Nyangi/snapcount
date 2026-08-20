#!/usr/bin/env bash
# Dump the snapcount DATA — not the schema — so a fresh deploy can start
# with the verified decade instead of seven empty screens.
#
# WHY THIS EXISTS. `backend/scripts/prestart.sh` migrates and creates the
# superuser, nothing more, so a new environment comes up empty. And
# `nightly-ingest.sh` only ever ingests the CURRENT season, by design, so it
# will never backfill history. The only alternative to this file is running
# the 2016-2025 backfill against production: a decade of networked nflverse
# pulls, which is the exact thing CI refuses to do.
#
# THE SCHEMA IS DELIBERATELY EXCLUDED. Alembic owns it, and `prestart.sh`
# runs `alembic upgrade head` before this is ever loaded. A dump carrying
# its own `CREATE TABLE` statements would be a second definition, free to
# diverge from the migrations silently.
#
# ALSO EXCLUDED, each for its own reason:
#   user             production creates its own superuser from its own
#                    secrets. Shipping a dev password hash into it would be
#                    a credential leak with a long half-life.
#   alembic_version  same as the schema — the target sets its own.
#   ingestrun        a log of runs that happened on someone's laptop.
#                    `/meta/freshness` reads this table to notice an
#                    IN-PROGRESS ingest; finished dev runs tell production
#                    nothing true. The field the freshness pill actually
#                    reads, `Season.last_ingested_at`, lives on `season`
#                    and IS included.
#
# Usage:
#   ./scripts/dump-backfill.sh [OUTPUT.sql.gz]
#
# Reads the local compose database (the documented source of truth, holding
# the verified backfill) and writes a gzipped, data-only SQL file.
set -euo pipefail

cd "$(dirname "$0")/.."

OUT="${1:-snapcount-backfill.sql.gz}"

# ORDER IS DEPENDENCY ORDER, NOT ALPHABETICAL, and that is the whole reason
# this is a loop rather than one pg_dump with eight --table flags. pg_dump
# emits tables in name order and does not sort them by foreign key, so a
# single-command dump would try to load `champion` and `game` before the
# `team` and `season` rows they reference and fail on the first constraint.
TABLES=(
  team
  season
  player
  champion
  dynastyrun
  game
  teamseasonstat
  playerseasonstat
)

# pg_dump runs INSIDE the db container: the client binaries are guaranteed
# to be there and to match the server version, which is not true of the
# host.
{
  echo "-- snapcount backfill, data only. Generated $(date -u +%FT%TZ)."
  echo "-- Load into a database that has ALREADY had \`alembic upgrade head\` run."
  echo "BEGIN;"
  for table in "${TABLES[@]}"; do
    docker compose exec -T db pg_dump -U postgres -d app \
      --data-only --no-owner --no-privileges --table="public.$table"
  done
  echo "COMMIT;"
} | gzip >"$OUT"

echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
echo
echo "Row counts in the dump:"
for table in "${TABLES[@]}"; do
  printf '%20s %s\n' "$table" "$(
    docker compose exec -T db psql -U postgres -d app -t -A \
      -c "SELECT count(*) FROM public.$table;"
  )"
done
