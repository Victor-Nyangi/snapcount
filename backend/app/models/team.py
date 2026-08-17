from sqlmodel import Field, SQLModel


class Team(SQLModel, table=True):
    """An NFL team. Seeded from app/data/teams.json — see app/ingest/teams.py.

    `color` is design data (a fixed hex chosen against a contrast rule the
    frontend depends on), never ingested from a feed.
    """

    abbr: str = Field(primary_key=True, max_length=3)
    name: str
    nickname: str
    conference: str  # AFC | NFC
    division: str  # East | North | South | West
    color: str  # #RRGGBB — design data, seeded not ingested
