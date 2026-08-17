from enum import StrEnum

from sqlmodel import SQLModel


class LeaderPosition(StrEnum):
    QB = "QB"
    RB = "RB"
    WR = "WR"
    TE = "TE"


class LeaderMetric(StrEnum):
    epa = "epa"
    yds = "yds"
    td = "td"
    rate = "rate"


class LeaderPlayer(SQLModel):
    id: str
    name: str
    team_abbr: str
    team_color: str
    meta: str


class LeaderSecondary(SQLModel):
    key: str
    value: float


class LeaderRow(SQLModel):
    rank: int
    player: LeaderPlayer
    value: float
    secondary: LeaderSecondary
    vs_baseline: float


class LeadersResponse(SQLModel):
    season: int
    position: str
    metric: str
    metric_label: str
    unit: str
    precision: int
    baseline: float
    qualifier_label: str
    rows: list[LeaderRow]
