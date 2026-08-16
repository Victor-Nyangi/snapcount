"""API-test-local fixtures.

Route tests exercise the real backfilled dev database directly (2016-2025)
wherever the assertions hold against it — `seeded_2024`-style names from the
task brief map onto no-op reads of that already-present data, since
inserting synthetic rows into that range is exactly the incident
`tests/ingest/conftest.py` warns about (a real-range fixture season made an
earlier suite non-deterministic; see git history for Task 3.4's fix round).

The handful of states that cannot occur in the real backfill (an unplayed
future game, a stale ingest) get dedicated sentinel-season fixtures that
commit and then purge themselves in a `finally`. Note this is a different
hazard than the ingest package's `isolated_db`: routes here go through
`TestClient`, which opens its own DB connection per request via
`app.api.deps.get_db`, so a SAVEPOINT rolled back on *this* fixture's
session would be invisible to it — the mutation has to be a real commit,
undone by an explicit delete afterward, the same way
`tests/ingest/test_runner.py`'s `_purge_season` cleans up after
`ingest_season` (which also commits for real).

Sentinel seasons: 2081 (unplayed game), 2082 (stale freshness). Ingest's own
tests own 2095-2099; picked clear of that range on purpose.
"""

from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import pytest
from sqlmodel import Session, delete

from app.models import Game, Season

FUTURE_SEASON = 2081
STALE_SEASON = 2082


@pytest.fixture
def seeded_future(db: Session) -> Generator[None]:
    """A season row plus one scheduled, unplayed game — both scores
    `None`. `Game.season` FK-references `season.year`, so the season row
    has to exist too."""
    season = Season(year=FUTURE_SEASON, current_week=1, week_count=18)
    game = Game(
        id=f"{FUTURE_SEASON}_01_KC_LV",
        season=FUTURE_SEASON,
        week=1,
        game_type="REG",
        kickoff_at=datetime(FUTURE_SEASON, 9, 7, 17, 0, tzinfo=UTC),
        away_team="KC",
        home_team="LV",
        away_score=None,
        home_score=None,
        spread_line=None,
        status="scheduled",
    )
    db.add(season)
    db.commit()
    db.add(game)
    db.commit()
    try:
        yield
    finally:
        db.exec(delete(Game).where(Game.season == FUTURE_SEASON))
        db.commit()
        db.exec(delete(Season).where(Season.year == FUTURE_SEASON))
        db.commit()


@pytest.fixture
def stale_season(db: Session) -> Generator[None]:
    """A `Season` row whose last successful ingest is more than a day old,
    with no live game and no in-flight `IngestRun` to override it."""
    season = Season(
        year=STALE_SEASON,
        current_week=1,
        week_count=18,
        last_ingested_at=datetime.now(UTC) - timedelta(days=2),
    )
    db.add(season)
    db.commit()
    try:
        yield
    finally:
        db.exec(delete(Season).where(Season.year == STALE_SEASON))
        db.commit()
