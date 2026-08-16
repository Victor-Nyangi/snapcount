from sqlmodel import SQLModel

from app.schemas.leaders import LeaderPosition

PlayerPosition = LeaderPosition


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
