from collections.abc import Generator

import pytest
from sqlmodel import Session, select

from app.ingest.games import ingest_games
from app.models import Game
from tests.ingest.conftest import purge_season

# Sentinel season for every fixture in this file. NOT a real-range year
# (2016-2025): "season" is a foreign key into Season.year, and this repo's
# tests write into the same real dev database `ingest_season` backfills for
# real (see tests/ingest/conftest.py's docstring). 2025 was tried first and
# collided with the real backfill twice - phantom games in the real 2025
# standings, and a corrupted Season.current_week - because a completed
# real-data season and a 3-game fake fixture shared a primary key range.
# 2099 is deliberately NOT a "nearby-looking" year like 1999: it must never
# become plausible to backfill, even if this window widens someday. If a
# season=2099 row ever shows up outside a test, that is itself the bug
# report. Do not "tidy" this back to a realistic-looking year.
_SEASON = 2099


class FakeSource:
    def schedules(self, season):
        return [
            {
                "game_id": f"{_SEASON}_15_CIN_BAL",
                "season": _SEASON,
                "week": 15,
                "game_type": "REG",
                "gameday": f"{_SEASON}-12-11",
                "gametime": "20:15",
                "away_team": "CIN",
                "home_team": "BAL",
                "away_score": 24,
                "home_score": 31,
                "spread_line": 3.5,
                "total_line": 47.5,
                "overtime": 0,
            },
            {
                "game_id": f"{_SEASON}_15_WAS_PHI",
                "season": _SEASON,
                "week": 15,
                "game_type": "REG",
                "gameday": f"{_SEASON}-12-14",
                "gametime": "13:00",
                "away_team": "WAS",
                "home_team": "PHI",
                "away_score": 27,
                "home_score": 30,
                "spread_line": 4.0,
                "total_line": 49.0,
                "overtime": 1,
            },
            {
                "game_id": f"{_SEASON}_16_KC_LV",
                "season": _SEASON,
                "week": 16,
                "game_type": "REG",
                "gameday": f"{_SEASON}-12-21",
                "gametime": "16:25",
                "away_team": "KC",
                "home_team": "LV",
                "away_score": None,
                "home_score": None,
                "spread_line": 10.5,
                "total_line": 44.0,
                "overtime": 0,
            },
        ]

    def player_stats(self, season):
        return []


@pytest.fixture(autouse=True, scope="module")
def _purge_sentinel_season(db: Session) -> Generator[None]:
    """`ingest_games` does not commit, but this module does (the recap test
    has to, to prove an editorial value survives a re-ingest) - and the
    shared session commits again at teardown regardless. So these three
    fake games and the Season row `ingest_games` creates for them persisted
    into the real dev database on every run. They did, for months: see
    `purge_season`. Module-scoped so the recap test still sees what the
    tests before it wrote."""
    yield
    purge_season(db, _SEASON)


def test_ingest_games_maps_the_feed_onto_the_model(db: Session) -> None:
    ingest_games(db, _SEASON, FakeSource())
    game = db.get(Game, f"{_SEASON}_15_CIN_BAL")
    assert game.away_team == "CIN" and game.home_team == "BAL"
    assert game.away_score == 24 and game.home_score == 31
    assert game.status == "final"


def test_overtime_games_get_the_final_ot_status(db: Session) -> None:
    ingest_games(db, _SEASON, FakeSource())
    assert db.get(Game, f"{_SEASON}_15_WAS_PHI").status == "final_ot"


def test_unplayed_games_stay_scheduled_with_null_scores(db: Session) -> None:
    ingest_games(db, _SEASON, FakeSource())
    game = db.get(Game, f"{_SEASON}_16_KC_LV")
    assert game.status == "scheduled"
    assert game.away_score is None and game.home_score is None
    assert game.spread_line == 10.5  # the line exists before the game does


def test_ingest_games_is_idempotent_and_updates_scores_in_place(db: Session) -> None:
    ingest_games(db, _SEASON, FakeSource())
    ingest_games(db, _SEASON, FakeSource())
    # Scoped to _SEASON, not a bare table count: the real 2016-2025
    # backfill lives in this same database (see the _SEASON comment above),
    # so an unscoped count would include thousands of real games too.
    games = db.exec(select(Game).where(Game.season == _SEASON)).all()
    assert len(games) == 3


def test_ingest_preserves_an_editorial_recap_across_reruns(db: Session) -> None:
    ingest_games(db, _SEASON, FakeSource())
    game = db.get(Game, f"{_SEASON}_15_CIN_BAL")
    game.recap = "Baltimore controlled the second half."
    db.commit()
    ingest_games(db, _SEASON, FakeSource())
    assert (
        db.get(Game, f"{_SEASON}_15_CIN_BAL").recap
        == "Baltimore controlled the second half."
    )
