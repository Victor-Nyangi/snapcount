from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from app.models import Game


@dataclass
class TeamRecord:
    """A team's accumulated record over a set of played games."""

    wins: int = 0
    losses: int = 0
    ties: int = 0
    points_for: int = 0
    points_against: int = 0
    streak: str = ""  # current run only, e.g. "W3" | "L1" | "T1"
    form: str = ""  # last five results, newest last, e.g. "WWLWW"
    opponents: list[str] = field(default_factory=list)  # once per meeting


def derive_records(games: Sequence[Game]) -> dict[str, TeamRecord]:
    """Derive every team's record from a single pass over played games.

    Unplayed games (`away_score is None or home_score is None`) are skipped
    entirely — a scheduled game is not a 0-0 tie. Games are processed oldest
    kickoff first so `form` and `streak` read correctly off the tail of each
    team's per-game result list. A tie breaks both a win streak and a loss
    streak, and counts toward neither `wins` nor `losses`.
    """
    played = sorted(
        (g for g in games if g.home_score is not None and g.away_score is not None),
        key=lambda g: g.kickoff_at,
    )

    records: dict[str, TeamRecord] = {}
    results: dict[str, list[str]] = {}

    def record_for(team: str) -> TeamRecord:
        if team not in records:
            records[team] = TeamRecord()
            results[team] = []
        return records[team]

    for g in played:
        home, away = g.home_team, g.away_team
        # sorted() above guarantees these are not None for played games.
        home_score, away_score = g.home_score, g.away_score
        assert home_score is not None and away_score is not None

        home_record, away_record = record_for(home), record_for(away)

        home_record.points_for += home_score
        home_record.points_against += away_score
        away_record.points_for += away_score
        away_record.points_against += home_score
        home_record.opponents.append(away)
        away_record.opponents.append(home)

        if home_score > away_score:
            home_record.wins += 1
            away_record.losses += 1
            results[home].append("W")
            results[away].append("L")
        elif away_score > home_score:
            away_record.wins += 1
            home_record.losses += 1
            results[home].append("L")
            results[away].append("W")
        else:
            home_record.ties += 1
            away_record.ties += 1
            results[home].append("T")
            results[away].append("T")

    for team, record in records.items():
        team_results = results[team]
        record.form = "".join(team_results[-5:])
        record.streak = _current_streak(team_results)

    return records


def _current_streak(results: list[str]) -> str:
    """Walk backward from the most recent result until it changes."""
    if not results:
        return ""
    current = results[-1]
    count = 0
    for result in reversed(results):
        if result != current:
            break
        count += 1
    return f"{current}{count}"


def strength_of_schedule(team: str, records: dict[str, TeamRecord]) -> float:
    """Mean win rate of every opponent `team` has faced, opponents counted
    once per meeting (a division rival played twice weighs double).

    Ties count as half a win in each opponent's own win rate, matching the
    NFL's standard win-percentage convention. A team with no games at all —
    itself or an opponent it faced who has no decided games — contributes
    the scale's neutral midpoint (0.5) rather than dividing by zero.
    """
    record = records.get(team)
    if record is None or not record.opponents:
        return 0.5

    win_rates = []
    for opponent in record.opponents:
        opponent_record = records.get(opponent)
        if opponent_record is None:
            win_rates.append(0.5)
            continue
        games_played = (
            opponent_record.wins + opponent_record.losses + opponent_record.ties
        )
        if games_played == 0:
            win_rates.append(0.5)
        else:
            win_rates.append(
                (opponent_record.wins + 0.5 * opponent_record.ties) / games_played
            )

    return sum(win_rates) / len(win_rates)
