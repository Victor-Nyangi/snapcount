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

    # The widest magnitude in the column, so exactly one team saturates and
    # every other pair stays distinguishable. `domain * 4` = 600 lived on
    # the client and pinned nine of 32 teams to full colour across
    # 2016-2025 - NYJ at -1193 and CLE at -751 read as the same cell.
    # `max(..., 1)` because the client divides by this, and an empty range
    # (or a genuinely all-zero one) is a legal request.
    total_domain = max((abs(r.total) for r in rows), default=1) or 1

    return ExplorerResponse(
        seasons=seasons,
        domain=DOMAIN,
        total_domain=total_domain,
        rows=rows,
    )
