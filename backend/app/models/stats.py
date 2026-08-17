from sqlalchemy import Index
from sqlmodel import Field, SQLModel


class TeamSeasonStat(SQLModel, table=True):
    # No separate index on (season,) is declared: `season` is the leading
    # column of the composite primary key (season, team), so Postgres's
    # implicit PK index already serves season-only lookups — the Explorer's
    # 32-rows-per-season read — via that leftmost-prefix. A standalone
    # single-column index here would duplicate it.
    season: int = Field(foreign_key="season.year", primary_key=True)
    team: str = Field(foreign_key="team.abbr", primary_key=True)
    wins: int
    losses: int
    ties: int
    points_for: int
    points_against: int
    sos: float  # opponent win rate
    streak: str  # "W3" | "L1"
    form: str  # last 5, newest last: "WWLWW"
    power: float  # computed, see analytics/power.py
    playoff_seed: int | None = None  # null when unknown; see plan §2


class Player(SQLModel, table=True):
    id: str = Field(primary_key=True)  # nflverse gsis_id
    name: str
    position: str  # QB | RB | WR | TE | …
    team: str | None = Field(default=None, foreign_key="team.abbr")


class PlayerSeasonStat(SQLModel, table=True):
    __table_args__ = (
        Index("ix_playerseasonstat_season_position", "season", "position"),
    )

    season: int = Field(foreign_key="season.year", primary_key=True)
    player_id: str = Field(foreign_key="player.id", primary_key=True)
    team: str = Field(foreign_key="team.abbr")
    position: str
    games: int
    seasons_played: int
    attempts: int = 0
    carries: int = 0
    targets: int = 0
    receptions: int = 0
    passing_yards: int = 0
    passing_tds: int = 0
    passing_epa: float = 0.0
    rushing_yards: int = 0
    rushing_tds: int = 0
    rushing_epa: float = 0.0
    receiving_yards: int = 0
    receiving_tds: int = 0
    receiving_epa: float = 0.0


class Champion(SQLModel, table=True):
    """Super Bowl winners. Static reference data, seeded from champions.json —
    settled history, not something to re-ingest nightly."""

    season: int = Field(primary_key=True)  # the season, not the calendar year played
    team: str = Field(foreign_key="team.abbr")
    result: str  # "40–22 over Kansas City"


class DynastyRun(SQLModel, table=True):
    """Editorial. Seeded from dynasties.json; see plan §2.

    `team` is unique: one run per franchise within the 2000-2024 window
    this app covers. The history screen renders a flat list of dynasty
    cards, and app/ingest/history.py's upsert keys on `team` — a second
    row for the same team would silently orphan one of them on re-seed.
    A second era for a given team is a product decision (how to render
    two cards for one franchise), not just a schema change, so the
    constraint is deliberate and should be removed consciously, not
    worked around.
    """

    id: int | None = Field(default=None, primary_key=True)
    team: str = Field(foreign_key="team.abbr", unique=True)
    label: str  # "New England, 2001–2018"
    titles: int
    note: str
