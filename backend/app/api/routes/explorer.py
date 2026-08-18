from typing import Annotated

from fastapi import APIRouter, Query
from sqlmodel import select

from app.api.deps import SessionDep
from app.models import Team, TeamSeasonStat
from app.schemas.explorer import ExplorerResponse, ExplorerRow, ExplorerTeam

router = APIRouter(prefix="/explorer", tags=["explorer"])

# The one diverging scale's saturation magnitude (frontend `lib/diverging.ts`
# defaults to the same 150) — parameterised here so the client never
# hard-codes it a second time.
DOMAIN = 150


@router.get("/differentials")
def differentials(
    session: SessionDep,
    from_: Annotated[int, Query(alias="from")],
    to: int,
) -> ExplorerResponse:
    seasons = list(range(from_, to + 1))

    teams = session.exec(select(Team).order_by(Team.abbr)).all()
    stats = session.exec(
        select(TeamSeasonStat).where(
            TeamSeasonStat.season >= from_, TeamSeasonStat.season <= to
        )
    ).all()
    by_team_season = {(s.team, s.season): s for s in stats}

    rows = []
    for team in teams:
        values: list[int | None] = []
        for season in seasons:
            stat = by_team_season.get((team.abbr, season))
            # A missing team-season (a franchise not yet relocated under
            # this abbreviation) stays None — never 0. A zero differential
            # and an absent season must not look identical on the
            # diverging scale.
            values.append(
                None if stat is None else stat.points_for - stat.points_against
            )
        rows.append(
            ExplorerRow(
                team=ExplorerTeam(
                    abbr=team.abbr,
                    name=team.name,
                    color=team.color,
                    conference=team.conference,
                    division=team.division,
                ),
                values=values,
                total=sum(v for v in values if v is not None),
            )
        )

    return ExplorerResponse(seasons=seasons, domain=DOMAIN, rows=rows)
