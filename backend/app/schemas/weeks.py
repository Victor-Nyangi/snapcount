from datetime import datetime

from sqlmodel import SQLModel


class WeekTeamSide(SQLModel):
    """One side (away or home) of a `WeekGame`. `score` is `None` for an
    unplayed game — never coerced to 0."""

    abbr: str
    nickname: str
    name: str
    color: str
    score: int | None


class WeekGame(SQLModel):
    id: str
    kickoff_at: datetime
    kickoff_label: str
    status: str
    away: WeekTeamSide
    home: WeekTeamSide
    spread_line: float | None
    line_label: str | None
    margin: int | None  # home-relative; None for an unplayed game
    recap: str | None


class FeaturedStat(SQLModel):
    key: str
    value: str


class FeaturedGame(SQLModel):
    game_id: str
    eyebrow: str
    away_abbr: str
    home_abbr: str
    score_label: str
    banner_color: str
    stats: list[FeaturedStat]


class WeekResponse(SQLModel):
    season: int
    week: int
    label: str
    games: list[WeekGame]
    featured: list[FeaturedGame]
