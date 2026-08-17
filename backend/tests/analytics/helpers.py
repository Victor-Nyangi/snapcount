"""Shared `Game` construction helpers for the analytics test suite.

Not a test module itself (no `test_` prefix) — imported by test_standings.py
and test_trends.py to build fixtures without repeating Game's full field set
in every test.
"""

from __future__ import annotations

import itertools
from datetime import UTC, datetime, timedelta

from app.models import Game

_id_counter = itertools.count()
_BASE_KICKOFF = datetime(2024, 9, 5, tzinfo=UTC)


def make_game(
    *,
    home_team: str,
    home_score: int | None,
    away_team: str,
    away_score: int | None,
    week: int = 1,
    season: int = 2024,
    kickoff_at: datetime | None = None,
) -> Game:
    n = next(_id_counter)
    if kickoff_at is None:
        kickoff_at = _BASE_KICKOFF + timedelta(days=7 * week, seconds=n)
    status = (
        "final" if home_score is not None and away_score is not None else "scheduled"
    )
    return Game(
        id=f"{season}-{week}-{home_team}-{away_team}-{n}",
        season=season,
        week=week,
        game_type="REG",
        kickoff_at=kickoff_at,
        away_team=away_team,
        home_team=home_team,
        away_score=away_score,
        home_score=home_score,
        status=status,
    )


def game(
    home: str, home_score: int, away: str, away_score: int, *, week: int = 1
) -> Game:
    """`game(home, home_score, away, away_score)` — the shape used in the brief."""
    return make_game(
        home_team=home,
        home_score=home_score,
        away_team=away,
        away_score=away_score,
        week=week,
    )


def scheduled_game(home: str, away: str, *, week: int = 1) -> Game:
    return make_game(
        home_team=home, home_score=None, away_team=away, away_score=None, week=week
    )


def games_for(team: str, results: str, *, season: int = 2024) -> list[Game]:
    """A chronological run of games for `team`, oldest first, whose results
    (from `team`'s perspective) spell out `results` — e.g. "LLWWWWW". `team`
    is always home; each game gets a distinct, single-use opponent so the
    opponents' own records stay uninvolved."""
    games: list[Game] = []
    for i, result in enumerate(results):
        week = i + 1
        opponent = f"OPP{team}{i}"
        if result == "W":
            home_score, away_score = 24, 10
        elif result == "L":
            home_score, away_score = 10, 24
        elif result == "T":
            home_score, away_score = 17, 17
        else:
            raise ValueError(f"unknown result char: {result!r}")
        games.append(
            make_game(
                home_team=team,
                home_score=home_score,
                away_team=opponent,
                away_score=away_score,
                week=week,
                season=season,
                kickoff_at=_BASE_KICKOFF + timedelta(days=7 * week),
            )
        )
    return games


def seven_alternating_games_for(team: str) -> list[Game]:
    # 7 games, alternating, starting with a loss: L W L W L W L.
    # Last five (newest last) -> "LWLWL".
    return games_for(team, "LWLWLWL")
