"""Derives `TeamSeasonStat` for a season from that season's `Game` rows.

This module is a pure re-derivation over whatever `Game` rows are already
in the DB for `season` — safe to call any number of times, and it never
duplicates the standings math: it calls `derive_records`,
`strength_of_schedule`, and `power_score` from `app.analytics` and nothing
else computes wins, losses, streaks, form, SOS, or power here.

The one thing this module is solely responsible for that the analytics
layer deliberately does NOT do: `derive_records`, `strength_of_schedule`,
and (elsewhere) `team_schedule` process whatever list of games they're
handed — none of them filter by `game_type` or `season`. So every read
here is filtered to `Game.season == season AND Game.game_type == "REG"`
before it ever reaches `derive_records`. Passing postseason games in would
silently inflate regular-season records (a playoff win counting as a 17th
regular-season win) and every standing on the site would be wrong while
every existing analytics test kept passing, because those tests build
their own in-memory `Game` lists and never exercise this filter.
"""

from __future__ import annotations

from sqlmodel import Session, select

from app.analytics.power import power_score
from app.analytics.standings import TeamRecord, derive_records, strength_of_schedule
from app.models import Game, TeamSeasonStat


def aggregate_team_seasons(session: Session, season: int) -> int:
    """Upsert `TeamSeasonStat` for every team that appears in `season`'s
    regular-season games. Returns the number of rows processed."""
    reg_games = session.exec(
        select(Game).where(Game.season == season, Game.game_type == "REG")
    ).all()

    teams = sorted({g.home_team for g in reg_games} | {g.away_team for g in reg_games})
    records = derive_records(reg_games)

    existing = {
        s.team: s
        for s in session.exec(
            select(TeamSeasonStat).where(TeamSeasonStat.season == season)
        ).all()
    }

    for team in teams:
        record = records.get(team, TeamRecord())
        sos = strength_of_schedule(team, records)
        power = power_score(
            wins=record.wins,
            losses=record.losses,
            points_for=record.points_for,
            points_against=record.points_against,
            sos=sos,
        )

        stat = existing.get(team)
        if stat is None:
            stat = TeamSeasonStat(
                season=season,
                team=team,
                wins=record.wins,
                losses=record.losses,
                ties=record.ties,
                points_for=record.points_for,
                points_against=record.points_against,
                sos=sos,
                streak=record.streak,
                form=record.form,
                power=power,
                # Seeded from the schedule alone — no clinching-scenario
                # logic here. Unknown until a dedicated seeding source
                # exists; see stats.py's own comment on the field.
                playoff_seed=None,
            )
            session.add(stat)
            existing[team] = stat
        else:
            stat.wins = record.wins
            stat.losses = record.losses
            stat.ties = record.ties
            stat.points_for = record.points_for
            stat.points_against = record.points_against
            stat.sos = sos
            stat.streak = record.streak
            stat.form = record.form
            stat.power = power
            # playoff_seed intentionally left untouched on update: it is
            # not derived here, so a re-run must not clobber a value some
            # future seeding step assigned.

    session.flush()
    return len(teams)
