"""Upserts `Player` and `PlayerSeasonStat` from a `NflverseSource`'s weekly
player-stat rows, summed to season totals and keyed on `(season,
player_id)`.

Two feed quirks (see source.py's module docstring, Step 2) drive the
filtering here:

- `player_id` is null on team-total placeholder rows nflverse emits
  alongside real player rows — those rows carry no individual identity and
  are dropped before anything else happens.
- `season_type` is `"REG"` or `"POST"`. Only `"REG"` weeks are summed, so
  PlayerSeasonStat lines up with the regular-season-only Game rows
  aggregate.py uses — a player's postseason box score never inflates their
  season line.

A traded player's `team`/`position` on both `Player` and `PlayerSeasonStat`
comes from their most recent week that season, not their first — the
season-ending team is what the roster should show.

Like games.py, this module never calls `session.commit()`: `ingest_season`
(runner.py) owns the transaction boundary.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from typing import Any

from sqlmodel import Session, select

from app.ingest.games import ensure_season_exists
from app.ingest.source import NflverseSource
from app.models import Player, PlayerSeasonStat

# Season-total columns, split by whether the feed/model type is int or
# float — PlayerSeasonStat's EPA columns are the only floats.
_INT_FIELDS = (
    "attempts",
    "carries",
    "targets",
    "receptions",
    "passing_yards",
    "passing_tds",
    "rushing_yards",
    "rushing_tds",
    "receiving_yards",
    "receiving_tds",
)
_FLOAT_FIELDS = ("passing_epa", "rushing_epa", "receiving_epa")


def _season_totals(weeks: Sequence[dict[str, Any]]) -> dict[str, int | float]:
    totals: dict[str, int | float] = dict.fromkeys(_INT_FIELDS, 0)
    totals.update(dict.fromkeys(_FLOAT_FIELDS, 0.0))
    for row in weeks:
        for field in _INT_FIELDS:
            totals[field] += int(row.get(field) or 0)
        for field in _FLOAT_FIELDS:
            totals[field] += float(row.get(field) or 0.0)
    return totals


def ingest_players(session: Session, season: int, source: NflverseSource) -> int:
    """Upsert `Player` and `PlayerSeasonStat` for every player with at least
    one regular-season row in `source.player_stats(season)`. Returns the
    number of PlayerSeasonStat rows processed."""
    rows = [
        row
        for row in source.player_stats(season)
        if row.get("player_id") is not None and row.get("season_type") == "REG"
    ]
    # Only ensures the Season row exists (the FK target) - deliberately
    # does NOT touch current_week. player_stats rows have no game_type
    # column at all (they have season_type instead), so this module has
    # no data current_week could correctly be derived from; only the
    # schedule (games.py) is authoritative for that. See games.py's
    # ensure_season_exists docstring for the incident that made this a
    # hard rule rather than a shared, configurable helper.
    ensure_season_exists(session, season)

    by_player: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_player[row["player_id"]].append(row)

    existing_players = {p.id: p for p in session.exec(select(Player)).all()}
    existing_stats = {
        (s.season, s.player_id): s
        for s in session.exec(
            select(PlayerSeasonStat).where(PlayerSeasonStat.season == season)
        ).all()
    }

    # How many seasons of stats we've ingested for each of this batch's
    # players, prior to `season` - one query for the whole batch instead
    # of one per player (a decade backfill runs this ingest ~2,000 times
    # per season; per-player queries would be ~20,000 extra round trips).
    prior_seasons_by_player: dict[str, set[int]] = defaultdict(set)
    if by_player:
        prior_stats = session.exec(
            select(PlayerSeasonStat)
            # SQLModel ships no mypy plugin here, so `.in_()` isn't
            # recognized on any field (confirmed project-wide - the same
            # false positive fires on Game.id/Team.abbr/etc.); real
            # SQLAlchemy Column at runtime, verified by the passing tests.
            .where(PlayerSeasonStat.player_id.in_(list(by_player.keys())))  # type: ignore[attr-defined]
            .where(PlayerSeasonStat.season < season)
        ).all()
        for prior_stat in prior_stats:
            prior_seasons_by_player[prior_stat.player_id].add(prior_stat.season)

    for player_id, weeks in by_player.items():
        latest = max(weeks, key=lambda r: r["week"])
        name = (
            latest.get("player_display_name") or latest.get("player_name") or player_id
        )
        position = latest["position"]
        team = latest["team"]

        player = existing_players.get(player_id)
        if player is None:
            player = Player(id=player_id, name=name, position=position, team=team)
            session.add(player)
            existing_players[player_id] = player
        else:
            player.name = name
            player.position = position
            player.team = team

        # How many seasons of stats we've ingested for this player so far,
        # including this one. This reflects our own backfill window (only
        # what's actually in the DB), not the player's true NFL career
        # length — a player whose career started before our earliest
        # backfilled season will read as having fewer seasons than they
        # actually have.
        seasons_played = len(prior_seasons_by_player[player_id]) + 1

        totals = _season_totals(weeks)

        stat = existing_stats.get((season, player_id))
        if stat is None:
            stat = PlayerSeasonStat(
                season=season,
                player_id=player_id,
                team=team,
                position=position,
                games=len(weeks),
                seasons_played=seasons_played,
                **totals,
            )
            session.add(stat)
            existing_stats[(season, player_id)] = stat
        else:
            stat.team = team
            stat.position = position
            stat.games = len(weeks)
            stat.seasons_played = seasons_played
            for field, value in totals.items():
                setattr(stat, field, value)

    session.flush()
    return len(by_player)
