from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.models import Game


@dataclass
class ScheduleRow:
    """One game on `team`'s schedule, in kickoff order."""

    week: int
    opponent: str
    is_home: bool
    margin: int | None  # signed from `team`'s perspective; None if unplayed
    cumulative: int | None  # running total of margin; None if unplayed


def team_schedule(team: str, games: Sequence[Game]) -> list[ScheduleRow]:
    """`team`'s games in kickoff order, each with a running cumulative point
    differential.

    Margin is signed from `team`'s own perspective, so the same game read
    from either side flips sign. Unplayed games (`home_score is None or
    away_score is None`) appear in the schedule but carry `margin` and
    `cumulative` as None — they are skipped when accumulating the running
    total, and any played games after a gap resume from the last real
    total rather than restarting. This is the only input the trend chart
    takes: an in-progress season plots the played games and stops, instead
    of plotting zeros out to week 18.
    """
    team_games = sorted(
        (g for g in games if g.home_team == team or g.away_team == team),
        key=lambda g: g.kickoff_at,
    )

    rows: list[ScheduleRow] = []
    running_total = 0
    for g in team_games:
        is_home = g.home_team == team
        opponent = g.away_team if is_home else g.home_team

        if g.home_score is None or g.away_score is None:
            margin = None
            cumulative = None
        else:
            team_score = g.home_score if is_home else g.away_score
            opponent_score = g.away_score if is_home else g.home_score
            margin = team_score - opponent_score
            running_total += margin
            cumulative = running_total

        rows.append(
            ScheduleRow(
                week=g.week,
                opponent=opponent,
                is_home=is_home,
                margin=margin,
                cumulative=cumulative,
            )
        )

    return rows
