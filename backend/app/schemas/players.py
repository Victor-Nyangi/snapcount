from enum import StrEnum

from sqlmodel import SQLModel


class PlayerPosition(StrEnum):
    """The positions with a player page. Its own enum, no longer an alias
    of `LeaderPosition`: the leaderboards gained DEF and ALL, which are
    boards, not positions a player list can be filtered to."""

    QB = "QB"
    RB = "RB"
    WR = "WR"
    TE = "TE"


class PlayerRef(SQLModel):
    id: str
    name: str
    position: str
    team_abbr: str
    team_color: str
    meta: str


class RateCard(SQLModel):
    key: str
    label: str
    precision: int
    value: float
    baseline: float
    delta: float
    scale_max: float


class PlayerSeasonRow(SQLModel):
    season: int
    team_abbr: str
    team_color: str
    games: int
    yards: float
    tds: float
    rate: float
    epa: float
    is_latest: bool


class PlayerPageResponse(SQLModel):
    player: PlayerRef
    rate_cards: list[RateCard]
    seasons: list[PlayerSeasonRow]


class PlayerListRow(SQLModel):
    id: str
    name: str
    team_abbr: str
