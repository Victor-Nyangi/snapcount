from sqlmodel import SQLModel


class ExplorerTeam(SQLModel):
    abbr: str
    name: str
    color: str
    # The explorer sorts by conference-then-division as one of its four
    # orders, so these travel with the row. Without them the client would
    # have to fetch standings purely to learn which division a team is in,
    # and then hold two payloads in sync.
    conference: str
    division: str


class ExplorerRow(SQLModel):
    team: ExplorerTeam
    values: list[int | None]
    total: int


class ExplorerResponse(SQLModel):
    seasons: list[int]
    domain: int
    rows: list[ExplorerRow]
