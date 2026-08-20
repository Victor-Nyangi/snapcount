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
    # The total column needs its OWN saturation magnitude: a decade of
    # differentials is an order of magnitude wider than one season's, so
    # reusing `domain` (or a fixed multiple of it) flattens the extremes
    # into one another. Derived from the rows actually returned, so it
    # holds for any range the caller asks for.
    total_domain: int
    rows: list[ExplorerRow]
