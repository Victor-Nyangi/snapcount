#!/usr/bin/env bash
# Load a `dump-backfill.sh` file into a target database.
#
# Run this AFTER `prestart.sh` (or the deploy workflow's "Prepare database"
# step), never before: the dump is data only and expects the migrated schema
# to already exist.
#
# Usage:
#   ./scripts/restore-backfill.sh DUMP.sql.gz 'postgresql://user:pw@host/db'
#
# The URL argument is required rather than defaulted. Restoring a decade of
# rows into whichever database an ambient DATABASE_URL happened to point at
# is not a mistake worth making convenient.
set -euo pipefail

DUMP="${1:?usage: restore-backfill.sh DUMP.sql.gz DATABASE_URL}"
TARGET_URL="${2:?usage: restore-backfill.sh DUMP.sql.gz DATABASE_URL}"

[ -f "$DUMP" ] || {
  echo "no such dump: $DUMP" >&2
  exit 1
}

cd "$(dirname "$0")/.."

run_psql() {
  # Through the db container for the same reason dump-backfill.sh does:
  # matched client binaries without depending on what the host has
  # installed. `-v ON_ERROR_STOP=1` matters — without it psql reports
  # success after a failed statement.
  docker compose exec -T db psql -v ON_ERROR_STOP=1 "$TARGET_URL" "$@"
}

# LOOK AT THE TARGET BEFORE WRITING TO IT. The dump is one transaction, so a
# collision would roll back rather than half-load — but "it failed safely"
# is a worse answer than not firing a decade of rows at a database someone
# has already populated.
existing=$(run_psql -t -A -c "SELECT count(*) FROM teamseasonstat;")
if [ "$existing" != "0" ]; then
  echo "target already holds $existing teamseasonstat rows — refusing." >&2
  echo "This script is for a FRESH deploy. To replace existing data," >&2
  echo "truncate those tables deliberately first." >&2
  exit 1
fi

echo "restoring $DUMP ..."
# -o /dev/null: each of the eight concatenated dumps carries its own
# pg_dump header, so without it the load prints eight copies of a
# `set_config` result table. Errors still surface (ON_ERROR_STOP).
gunzip -c "$DUMP" | run_psql -q -o /dev/null -f -

echo
echo "Verifying against the values the backfill is known to produce:"
run_psql -t -A -F' | ' -c "
  SELECT 'DET 2024 differential', (points_for - points_against)::text
  FROM teamseasonstat WHERE season = 2024 AND team = 'DET'
  UNION ALL
  SELECT 'NE titles', count(*)::text FROM champion WHERE team = 'NE'
  UNION ALL
  SELECT 'seasons', count(*)::text FROM season
  UNION ALL
  SELECT 'games', count(*)::text FROM game
  UNION ALL
  SELECT 'player-seasons', count(*)::text FROM playerseasonstat;"
echo
echo "Expected: DET +222, NE 6 titles, 10 seasons, 2761 games, 19521 player-seasons."
