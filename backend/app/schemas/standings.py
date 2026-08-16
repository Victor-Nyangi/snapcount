from enum import StrEnum

from sqlmodel import SQLModel


class Conference(StrEnum):
    AFC = "AFC"
    NFC = "NFC"


class StandingsTeam(SQLModel):
    abbr: str
    name: str
    nickname: str
    conference: str
    division: str
    color: str


class StandingsRow(SQLModel):
    rank: int
    team: StandingsTeam
    wins: int
    losses: int
    ties: int
    record_label: str
    pct: float
    points_for: int
    points_against: int
    differential: int
    sos: float
    streak: str
    form: str
    playoff_seed: int | None
    power: float


class StandingsResponse(SQLModel):
    season: int
    formula_label: str
    rows: list[StandingsRow]
