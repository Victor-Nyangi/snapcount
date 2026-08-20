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
`tests/ingest/conftest.py`'s `purge_season` cleans up after
`ingest_season` (which also commits for real).

Sentinel seasons: 2081 (unplayed game), 2082 (stale freshness), 2083 (fresh
freshness), 2084 (partial team schedule), 2086/2087 (explorer present vs
missing), 2089 (explorer empty range). Ingest's own tests own 2095-2099;
picked clear of that range on purpose.
"""

from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import pytest
from sqlmodel import Session, delete

from app.models import Game, Season, TeamSeasonStat

FUTURE_SEASON = 2081
STALE_SEASON = 2082
FRESH_SEASON = 2083
# 2088 is claimed for the failed-ingest case, which needs a season that was
# ingested successfully ONCE and has since had a run fail.
FAILED_INGEST_SEASON = 2088
FEATURED_SEASON = 2085
TEAM_SCHEDULE_SEASON = 2084
EXPLORER_PRESENT_SEASON = 2086
EXPLORER_MISSING_SEASON = 2087
# Deliberately has NO fixture: the point of this one is a range the
# database holds nothing in, which is what makes every total 0.
EXPLORER_EMPTY_SEASON = 2089


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
def teams_partial_schedule(db: Session) -> Generator[None]:
    """LV's schedule for a sentinel season: one played game (week 1) and
    one unplayed game (week 2) — proves the team page's schedule stops
    accumulating rather than plotting the unplayed week as a zero."""
    season = Season(year=TEAM_SCHEDULE_SEASON, current_week=2, week_count=18)
    db.add(season)
    db.commit()

    stat = TeamSeasonStat(
        season=TEAM_SCHEDULE_SEASON,
        team="LV",
        wins=1,
        losses=0,
        ties=0,
        points_for=24,
        points_against=17,
        sos=0.5,
        streak="W1",
        form="W",
        power=55.0,
    )
    played = Game(
        id=f"{TEAM_SCHEDULE_SEASON}_01_KC_LV",
        season=TEAM_SCHEDULE_SEASON,
        week=1,
        game_type="REG",
        kickoff_at=datetime(TEAM_SCHEDULE_SEASON, 9, 7, 17, 0, tzinfo=UTC),
        away_team="KC",
        home_team="LV",
        away_score=17,
        home_score=24,
        status="final",
    )
    unplayed = Game(
        id=f"{TEAM_SCHEDULE_SEASON}_02_LV_DEN",
        season=TEAM_SCHEDULE_SEASON,
        week=2,
        game_type="REG",
        kickoff_at=datetime(TEAM_SCHEDULE_SEASON, 9, 14, 17, 0, tzinfo=UTC),
        away_team="LV",
        home_team="DEN",
        away_score=None,
        home_score=None,
        status="scheduled",
    )
    db.add_all([stat, played, unplayed])
    db.commit()
    try:
        yield
    finally:
        db.exec(delete(Game).where(Game.season == TEAM_SCHEDULE_SEASON))
        db.exec(
            delete(TeamSeasonStat).where(TeamSeasonStat.season == TEAM_SCHEDULE_SEASON)
        )
        db.commit()
        db.exec(delete(Season).where(Season.year == TEAM_SCHEDULE_SEASON))
        db.commit()


@pytest.fixture
def explorer_partial_range(db: Session) -> Generator[None]:
    """LV has a real (zero) differential in `EXPLORER_PRESENT_SEASON` and no
    team-season row at all in `EXPLORER_MISSING_SEASON` — proves the explorer
    response tells a genuine zero apart from an absent season, rather than
    the test just asserting a falsy value either way."""
    season = Season(year=EXPLORER_PRESENT_SEASON, current_week=1, week_count=18)
    db.add(season)
    db.commit()

    stat = TeamSeasonStat(
        season=EXPLORER_PRESENT_SEASON,
        team="LV",
        wins=8,
        losses=8,
        ties=0,
        points_for=300,
        points_against=300,  # differential 0, a real value — not absent
        sos=0.5,
        streak="L1",
        form="W",
        power=50.0,
    )
    db.add(stat)
    db.commit()
    try:
        yield
    finally:
        db.exec(
            delete(TeamSeasonStat).where(
                TeamSeasonStat.season == EXPLORER_PRESENT_SEASON
            )
        )
        db.commit()
        db.exec(delete(Season).where(Season.year == EXPLORER_PRESENT_SEASON))
        db.commit()


@pytest.fixture
def featured_with_recap(db: Session) -> Generator[None]:
    """Two played games in a sentinel week, the higher-scoring one carrying
    a recap. `recap` is the one column no feed writes, so it is null for
    every game in the real backfill — the only way to prove the featured
    card's `note` actually plumbs through to it is to write one."""
    season = Season(year=FEATURED_SEASON, current_week=1, week_count=18)
    db.add(season)
    db.commit()

    shootout = Game(
        id=f"{FEATURED_SEASON}_01_KC_LV",
        season=FEATURED_SEASON,
        week=1,
        game_type="REG",
        kickoff_at=datetime(FEATURED_SEASON, 9, 7, 17, 0, tzinfo=UTC),
        away_team="KC",
        home_team="LV",
        away_score=38,
        home_score=35,
        status="final",
        recap="Las Vegas fell short on a two-point try with nine seconds left.",
    )
    quiet = Game(
        id=f"{FEATURED_SEASON}_01_DEN_LAC",
        season=FEATURED_SEASON,
        week=1,
        game_type="REG",
        kickoff_at=datetime(FEATURED_SEASON, 9, 7, 20, 0, tzinfo=UTC),
        away_team="DEN",
        home_team="LAC",
        away_score=10,
        home_score=6,
        status="final",
        recap=None,
    )
    db.add_all([shootout, quiet])
    db.commit()
    try:
        yield
    finally:
        db.exec(delete(Game).where(Game.season == FEATURED_SEASON))
        db.commit()
        db.exec(delete(Season).where(Season.year == FEATURED_SEASON))
        db.commit()


@pytest.fixture
def fresh_season(db: Session) -> Generator[None]:
    """A `Season` row ingested just now, so freshness reads "final".

    Deliberately a sentinel rather than a read of 2024: "recently ingested"
    decays. Asserting it against whatever the database happens to hold
    makes the test pass for as long as someone ran a backfill recently and
    fail a day later with nothing changed — and the committed fixture slice
    (tests/fixtures) carries a timestamp frozen at generation time, so on
    CI it would have gone stale within a day of being generated.
    """
    season = Season(
        year=FRESH_SEASON,
        current_week=18,
        week_count=18,
        last_ingested_at=datetime.now(UTC),
    )
    db.add(season)
    db.commit()
    try:
        yield
    finally:
        db.exec(delete(Season).where(Season.year == FRESH_SEASON))
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


@pytest.fixture
def season_with_a_failed_ingest(db: Session) -> Generator[None]:
    """A season ingested successfully two days ago, whose most recent run
    then FAILED.

    This is the shape Task 6.3 Step 3 is about. `Season.last_ingested_at`
    is stamped only when a run closes `ok`, so a later failure must leave
    it pointing at the older SUCCESS — the freshness label has to name the
    last time the data was actually good, not the moment we last tried and
    could not.
    """
    from app.models import IngestRun

    succeeded_at = datetime.now(UTC) - timedelta(days=2)
    db.add(
        Season(
            year=FAILED_INGEST_SEASON,
            current_week=18,
            week_count=18,
            last_ingested_at=succeeded_at,
        )
    )
    db.add(
        IngestRun(
            source="nflreadpy",
            season=FAILED_INGEST_SEASON,
            started_at=succeeded_at,
            finished_at=succeeded_at,
            status="ok",
            rows=100,
        )
    )
    db.add(
        IngestRun(
            source="nflreadpy",
            season=FAILED_INGEST_SEASON,
            started_at=datetime.now(UTC),
            finished_at=datetime.now(UTC),
            status="failed",
            error="connection reset by peer",
        )
    )
    db.commit()
    try:
        yield
    finally:
        db.exec(delete(IngestRun).where(IngestRun.season == FAILED_INGEST_SEASON))
        db.commit()
        db.exec(delete(Season).where(Season.year == FAILED_INGEST_SEASON))
        db.commit()
