from sqlmodel import SQLModel


class TeamRef(SQLModel):
    abbr: str
    name: str
    nickname: str
    conference: str
    division: str
    color: str


class TeamStat(SQLModel):
    key: str
    value: str


class ScheduleOpponent(SQLModel):
    abbr: str
    nickname: str
    color: str


class ScheduleRowOut(SQLModel):
    week: int
    week_label: str
    opponent: ScheduleOpponent
    is_home: bool
    result: str | None  # "W" | "L" | "T" | None (unplayed)
    score_label: str | None
    margin: int | None
    cumulative: int | None


class DepthGroup(SQLModel):
    group: str
    slots: list[str]


class TeamPageResponse(SQLModel):
    team: TeamRef
    record_label: str
    conference_label: str
    stats: list[TeamStat]
    schedule: list[ScheduleRowOut]
    depth_groups: list[DepthGroup]
