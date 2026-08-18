#!/usr/bin/env bash
# Nightly ingest of the CURRENT season (Task 6.3).
#
# Deliberately not a queue. This is one job, once a night, with no fan-out,
# no retries worth coordinating and no result anyone waits on — a broker and
# a worker pool would be more moving parts than the thing they schedule.
#
# The season is DERIVED, not configured: an NFL season is named for the
# calendar year it starts in and runs from September into the February
# after. So from January to July we are still finishing last year's season,
# and a naive `date +%Y` would spend seven months of every year ingesting a
# season that does not exist yet.
set -euo pipefail

month=$(date -u +%m)
year=$(date -u +%Y)
if [ "$((10#$month))" -lt 8 ]; then
  season=$((year - 1))
else
  season=$year
fi

echo "[nightly-ingest] $(date -u +%FT%TZ) ingesting season $season"
# A failure here is recorded on the IngestRun row and deliberately does NOT
# stamp Season.last_ingested_at, so the freshness pill goes stale rather
# than reporting a successful-looking run.
exec python -m app.ingest.runner --season "$season"
