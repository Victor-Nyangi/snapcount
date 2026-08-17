from datetime import datetime

from sqlalchemy import DateTime
from sqlmodel import Field, SQLModel


class Season(SQLModel, table=True):
    year: int = Field(primary_key=True)
    current_week: int
    week_count: int = 18
    last_ingested_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


class IngestRun(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    source: str
    season: int
    started_at: datetime = Field(sa_type=DateTime(timezone=True))  # type: ignore
    finished_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    status: str  # running | ok | failed
    rows: int = 0
    error: str | None = None
