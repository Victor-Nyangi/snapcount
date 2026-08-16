from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.api.deps import SessionDep
from app.models import Game, IngestRun, Season
from app.schemas.meta import FreshnessResponse, SeasonSummary

router = APIRouter(prefix="/meta", tags=["meta"])

_STALE_AFTER = timedelta(days=1)


@router.get("/seasons")
def list_seasons(session: SessionDep) -> list[SeasonSummary]:
    seasons = session.exec(select(Season).order_by(Season.year)).all()
    return [
        SeasonSummary(
            year=s.year,
            current_week=s.current_week,
            week_count=s.week_count,
            last_ingested_at=s.last_ingested_at,
        )
        for s in seasons
    ]


@router.get("/freshness")
def freshness(session: SessionDep, season: int) -> FreshnessResponse:
    row = session.get(Season, season)
    if row is None:
        raise HTTPException(status_code=404, detail="Season not found")

    live_game = session.exec(
        select(Game.id).where(Game.season == season, Game.status == "live").limit(1)
    ).first()
    running_ingest = session.exec(
        select(IngestRun.id)
        .where(IngestRun.season == season, IngestRun.status == "running")
        .limit(1)
    ).first()

    if live_game is not None or running_ingest is not None:
        return FreshnessResponse(
            status="live",
            label="Live · updating",
            last_ingested_at=row.last_ingested_at,
        )

    if row.last_ingested_at is None:
        return FreshnessResponse(
            status="stale", label="No data ingested yet", last_ingested_at=None
        )

    age = datetime.now(UTC) - row.last_ingested_at
    updated = row.last_ingested_at.strftime("%b %-d")
    if age <= _STALE_AFTER:
        return FreshnessResponse(
            status="final",
            label=f"Final · updated {updated}",
            last_ingested_at=row.last_ingested_at,
        )
    return FreshnessResponse(
        status="stale",
        label=f"Stale · updated {updated}",
        last_ingested_at=row.last_ingested_at,
    )
