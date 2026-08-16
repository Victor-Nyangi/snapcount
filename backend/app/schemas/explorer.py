from sqlmodel import SQLModel


class ExplorerTeam(SQLModel):
    abbr: str
    name: str
    color: str


class ExplorerRow(SQLModel):
    team: ExplorerTeam
    values: list[int | None]
    total: int


class ExplorerResponse(SQLModel):
    seasons: list[int]
    domain: int
    rows: list[ExplorerRow]
