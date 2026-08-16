from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.api.deps import SessionDep
from app.api.routes._format import record_label
from app.models import Team, TeamSeasonStat
from app.schemas.standings import (
    Conference,
    StandingsResponse,
    StandingsRow,
    StandingsTeam,
)

router = APIRouter(prefix="/standings", tags=["standings"])

FORMULA_LABEL = (
    "0.55 × point differential per game + 0.30 × strength of schedule "
    "+ 0.15 × win rate, scaled to 100"
)


@router.get("/{season}")
def standings(
    session: SessionDep, season: int, conference: Conference | None = None
) -> StandingsResponse:
    query = (
        select(TeamSeasonStat, Team)
        .join(Team, Team.abbr == TeamSeasonStat.team)  # type: ignore[arg-type]
        .where(TeamSeasonStat.season == season)
    )
    if conference is not None:
        query = query.where(Team.conference == conference.value)

    pairs = session.exec(query).all()
    if not pairs:
        raise HTTPException(status_code=404, detail="Season not found")

    pairs.sort(key=lambda pair: (-pair[0].power, pair[1].abbr))

    rows = []
    for rank, (stat, team) in enumerate(pairs, start=1):
        games = stat.wins + stat.losses + stat.ties
        pct = (stat.wins + 0.5 * stat.ties) / games if games else 0.0
        rows.append(
            StandingsRow(
                rank=rank,
                team=StandingsTeam(
                    abbr=team.abbr,
                    name=team.name,
                    nickname=team.nickname,
                    conference=team.conference,
                    division=team.division,
                    color=team.color,
                ),
                wins=stat.wins,
                losses=stat.losses,
                ties=stat.ties,
                record_label=record_label(stat.wins, stat.losses, stat.ties),
                pct=pct,
                points_for=stat.points_for,
                points_against=stat.points_against,
                differential=stat.points_for - stat.points_against,
                sos=stat.sos,
                streak=stat.streak,
                form=stat.form,
                playoff_seed=stat.playoff_seed,
                power=stat.power,
            )
        )

    return StandingsResponse(season=season, formula_label=FORMULA_LABEL, rows=rows)
