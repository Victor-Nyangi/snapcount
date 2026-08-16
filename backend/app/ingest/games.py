"""Upserts `Game` rows from a `NflverseSource`, keyed on `game_id`.

Three things this module is careful about, each corresponding to a defect
mode called out in the task brief:

1. `recap` is editorial text no feed provides — the upsert loop below never
   assigns it, on either the insert or the update path, so a re-ingest can
   never clobber a sentence someone wrote by hand.
2. `away_score`/`home_score` stay `None` for unplayed games. The feed gives
   nulls for future games; nothing here coerces that to 0.
3. Does not call `session.commit()`. `ingest_season` (runner.py) is the
   transaction boundary — it wraps games -> players -> aggregate in one
   nested transaction so a failure partway through leaves nothing partial
   committed. Callers that want this module's effects to survive on their
   own must commit explicitly (see the module-level tests, which do).
"""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Any
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from app.ingest.source import NflverseSource
from app.models import Game, Season

# The feed's `gameday`/`gametime` pair is local kickoff time, always
# US/Eastern regardless of the stadium's actual timezone (nflverse's own
# convention) — see the brief's Step 5 instruction.
_FEED_TZ = ZoneInfo("America/New_York")


def _kickoff_at(gameday: str, gametime: str | None) -> datetime:
    d = date.fromisoformat(gameday)
    if gametime:
        hour, minute = (int(p) for p in gametime.split(":")[:2])
        t = time(hour=hour, minute=minute)
    else:
        t = time(hour=13, minute=0)  # no time given: assume early slot
    return datetime.combine(d, t, tzinfo=_FEED_TZ)


def _status(
    away_score: int | None, home_score: int | None, overtime: int | bool | None
) -> str:
    if away_score is None or home_score is None:
        return "scheduled"
    return "final_ot" if overtime else "final"


def _ensure_season(session: Session, season: int, rows: list[dict[str, Any]]) -> Season:
    """Get-or-create the `Season` row `Game.season` foreign-keys into, and
    keep `current_week` in step with the furthest week this ingest saw.
    Static reference fields (`week_count`) are left alone once created —
    only `current_week` is refreshed on every run, since that is the one
    value that's supposed to move as a season progresses."""
    existing = session.get(Season, season)
    max_week = max((row["week"] for row in rows), default=1)
    if existing is None:
        existing = Season(year=season, current_week=max_week)
        session.add(existing)
    else:
        existing.current_week = max_week
    session.flush()
    return existing


def ingest_games(session: Session, season: int, source: NflverseSource) -> int:
    """Upsert every `Game` row `source.schedules(season)` returns. Returns
    the number of rows processed (inserted or updated)."""
    rows = source.schedules(season)
    _ensure_season(session, season, rows)

    existing = {
        g.id: g for g in session.exec(select(Game).where(Game.season == season)).all()
    }

    for row in rows:
        away_score = row["away_score"]
        home_score = row["home_score"]
        status = _status(away_score, home_score, row["overtime"])
        kickoff_at = _kickoff_at(row["gameday"], row.get("gametime"))

        game = existing.get(row["game_id"])
        if game is None:
            game = Game(
                id=row["game_id"],
                season=row["season"],
                week=row["week"],
                game_type=row["game_type"],
                kickoff_at=kickoff_at,
                away_team=row["away_team"],
                home_team=row["home_team"],
                away_score=away_score,
                home_score=home_score,
                spread_line=row.get("spread_line"),
                total_line=row.get("total_line"),
                overtime=bool(row["overtime"]),
                status=status,
                # recap intentionally omitted: no feed owns this column.
            )
            session.add(game)
            existing[game.id] = game
        else:
            game.season = row["season"]
            game.week = row["week"]
            game.game_type = row["game_type"]
            game.kickoff_at = kickoff_at
            game.away_team = row["away_team"]
            game.home_team = row["home_team"]
            game.away_score = away_score
            game.home_score = home_score
            game.spread_line = row.get("spread_line")
            game.total_line = row.get("total_line")
            game.overtime = bool(row["overtime"])
            game.status = status
            # game.recap intentionally never assigned here either.

    session.flush()
    return len(rows)
