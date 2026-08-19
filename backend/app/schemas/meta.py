from datetime import datetime

from sqlmodel import SQLModel


class SeasonSummary(SQLModel):
    """One row of `GET /meta/seasons` — populates the season selector."""

    year: int
    current_week: int
    week_count: int
    # DERIVED from the games themselves, unlike `week_count`, which is a
    # stored constant (18 for every season ever ingested) and does not
    # describe reality: the playoffs are weeks too, so the real last week
    # is 21 for 2016-2020 and 22 from 2021. The week selector reads this.
    max_week: int
    last_ingested_at: datetime | None


class FreshnessResponse(SQLModel):
    """`GET /meta/freshness?season=`. `label` is fully formed server-side —
    the freshness pill renders it verbatim."""

    status: str  # "live" | "final" | "stale"
    label: str
    last_ingested_at: datetime | None
