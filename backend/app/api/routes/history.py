from collections import Counter

from fastapi import APIRouter
from sqlmodel import select

from app.api.deps import SessionDep
from app.models import Champion, DynastyRun, Team
from app.schemas.history import (
    ChampionRow,
    ChampionTeam,
    DynastyRow,
    DynastyTeam,
    HistoryResponse,
    TitleCount,
    TitleCountTeam,
)

router = APIRouter(prefix="/history", tags=["history"])

# Matches the design mockup's own `mostTitles` rule: top 6 by title count.
_MOST_TITLES_LIMIT = 6


@router.get("/champions")
def champions(session: SessionDep) -> HistoryResponse:
    rows = session.exec(select(Champion)).all()
    teams = {t.abbr: t for t in session.exec(select(Team)).all()}

    champion_rows = [
        ChampionRow(
            season=c.season,
            team=ChampionTeam(
                abbr=teams[c.team].abbr,
                name=teams[c.team].name,
                nickname=teams[c.team].nickname,
                color=teams[c.team].color,
            ),
            result=c.result,
        )
        for c in sorted(rows, key=lambda c: c.season, reverse=True)
    ]

    title_counts = Counter(c.team for c in rows)
    most_titles = [
        TitleCount(
            team=TitleCountTeam(
                abbr=teams[abbr].abbr,
                nickname=teams[abbr].nickname,
                color=teams[abbr].color,
            ),
            count=count,
        )
        for abbr, count in sorted(
            title_counts.items(), key=lambda item: (-item[1], item[0])
        )[:_MOST_TITLES_LIMIT]
    ]

    dynasty_rows = session.exec(select(DynastyRun)).all()
    dynasties = [
        DynastyRow(
            team=DynastyTeam(abbr=teams[d.team].abbr, color=teams[d.team].color),
            label=d.label,
            titles=d.titles,
            note=d.note,
        )
        for d in dynasty_rows
    ]

    return HistoryResponse(
        champions=champion_rows, most_titles=most_titles, dynasties=dynasties
    )
