from datetime import datetime

from sqlalchemy import DateTime, Index
from sqlmodel import Field, SQLModel


class Game(SQLModel, table=True):
    __table_args__ = (Index("ix_game_season_week", "season", "week"),)

    id: str = Field(primary_key=True)  # nflverse game_id
    season: int = Field(foreign_key="season.year")
    week: int
    game_type: str  # REG | WC | DIV | CON | SB
    kickoff_at: datetime = Field(sa_type=DateTime(timezone=True))  # type: ignore
    away_team: str = Field(foreign_key="team.abbr")
    home_team: str = Field(foreign_key="team.abbr")
    away_score: int | None = None  # None until played
    home_score: int | None = None
    spread_line: float | None = None  # home-relative closing line
    total_line: float | None = None
    overtime: bool = False
    status: str = "scheduled"  # scheduled | live | final | final_ot
    recap: str | None = None  # editorial; see plan §2
