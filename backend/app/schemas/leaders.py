from enum import StrEnum

from sqlmodel import SQLModel


class LeaderPosition(StrEnum):
    """A leaderboard: four positions, every defender (DEF), or every
    position (ALL). See `app.analytics.leaders` for why defence is one
    board rather than DL/LB/DB groups."""

    QB = "QB"
    RB = "RB"
    WR = "WR"
    TE = "TE"
    DEF = "DEF"
    ALL = "ALL"


class LeaderMetric(StrEnum):
    """Every metric any board offers. Which board offers which is
    `app.analytics.leaders.BOARD_METRICS`; a pair outside it is a 422."""

    epa = "epa"
    yds = "yds"
    td = "td"
    rate = "rate"
    tackles = "tackles"
    sacks = "sacks"
    tfl = "tfl"
    qb_hits = "qb_hits"
    interceptions = "interceptions"
    passes_defended = "passes_defended"


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
    # What the metric counts, when its label alone cannot say — e.g. that
    # scrimmage touchdowns leave passing out. Null for the boards whose
    # label already says everything.
    note: str | None = None
    rows: list[LeaderRow]
