"""Orchestrates one season's ingestion (`ingest_season`) and the CLI that
drives it across a range of seasons.

`ingest_season` is the transaction boundary the rest of `app.ingest` is
built around: `ingest_games`, `ingest_players`, and `aggregate_team_seasons`
never call `session.commit()` themselves (see each module's docstring) so
that this function can wrap all three in a single SAVEPOINT (nested
transaction) and roll the whole thing back atomically if any step raises —
"one failed season must not invalidate the nine that succeeded," and within
a season, no partial rows survive a failure either.

`seed_teams` is deliberately called OUTSIDE that SAVEPOINT, before it opens:
it's idempotent, static reference data unrelated to a season's success or
failure, and it calls `session.commit()` internally (see app/ingest/
teams.py) — interleaving that commit with an open SAVEPOINT would end the
SAVEPOINT early and break the rollback semantics this function relies on.
"""

from __future__ import annotations

import argparse
import logging
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlmodel import Session

from app.core.db import engine
from app.ingest.aggregate import aggregate_team_seasons
from app.ingest.games import ingest_games
from app.ingest.players import ingest_players
from app.ingest.source import NflreadpySource, NflverseSource
from app.ingest.teams import seed_teams
from app.models import IngestRun, Season

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def ingest_season(session: Session, season: int, source: NflverseSource) -> IngestRun:
    """Ingest one season end-to-end: teams -> games -> players -> aggregate.

    Opens an `IngestRun` row up front (`status="running"`). On success,
    closes it `ok` with a row count and stamps `Season.last_ingested_at` —
    the freshness pill's data source. On failure, rolls back every game,
    player, and team-season-stat row this call touched, and closes the run
    `failed` with the exception text. Either way, this season's `IngestRun`
    row itself always persists.
    """
    run = IngestRun(
        source="nflreadpy",
        season=season,
        started_at=datetime.now(UTC),
        status="running",
    )
    session.add(run)
    session.flush()

    total_rows = 0
    try:
        seed_teams(session)

        with session.begin_nested():
            total_rows += ingest_games(session, season, source)
            total_rows += ingest_players(session, season, source)
            total_rows += aggregate_team_seasons(session, season)
    except Exception as exc:  # noqa: BLE001 - recorded on the run, then re-raised as a failed status, never swallowed
        run.status = "failed"
        run.error = str(exc)
        run.finished_at = datetime.now(UTC)
        session.commit()
        return run

    run.status = "ok"
    run.rows = total_rows
    run.finished_at = datetime.now(UTC)
    season_row = session.get(Season, season)
    if season_row is not None:
        season_row.last_ingested_at = datetime.now(UTC)
    session.commit()
    return run


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest nflverse schedules, player stats, and team "
        "season aggregates into Snapcount."
    )
    parser.add_argument("--season", type=int, help="ingest a single season")
    parser.add_argument(
        "--from", dest="from_season", type=int, help="first season, inclusive"
    )
    parser.add_argument(
        "--to", dest="to_season", type=int, help="last season, inclusive"
    )
    return parser.parse_args(argv)


def _season_range(args: argparse.Namespace) -> range:
    if args.season is not None:
        return range(args.season, args.season + 1)
    if args.from_season is not None and args.to_season is not None:
        return range(args.from_season, args.to_season + 1)
    raise SystemExit("pass --season YYYY, or --from YYYY --to YYYY")


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    seasons = _season_range(args)
    source = NflreadpySource()

    # Sequential on purpose: nflreadpy caches downloads to disk, and
    # concurrent runs would fight over that cache for no throughput gain.
    with Session(engine) as session:
        for season in seasons:
            logger.info("ingesting season %s", season)
            run = ingest_season(session, season, source)
            if run.status == "ok":
                logger.info("season %s: ok, %s rows", season, run.rows)
            else:
                logger.error("season %s: failed - %s", season, run.error)


if __name__ == "__main__":
    main()
