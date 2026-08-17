from datetime import datetime

from sqlmodel import SQLModel


class SeasonSummary(SQLModel):
    """One row of `GET /meta/seasons` — populates the season selector."""

    year: int
    current_week: int
    week_count: int
    last_ingested_at: datetime | None


class FreshnessResponse(SQLModel):
    """`GET /meta/freshness?season=`. `label` is fully formed server-side —
    the freshness pill renders it verbatim."""

    status: str  # "live" | "final" | "stale"
    label: str
    last_ingested_at: datetime | None
