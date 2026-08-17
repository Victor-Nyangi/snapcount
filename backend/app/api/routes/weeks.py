from collections.abc import Sequence

from fastapi import APIRouter, HTTPException
from sqlmodel import col, select

from app.api.deps import SessionDep
from app.api.routes._format import kickoff_label, line_label, phase_label, score_label
from app.models import Game, Team
from app.schemas.weeks import (
    FeaturedGame,
    FeaturedStat,
    WeekGame,
    WeekResponse,
    WeekTeamSide,
)

router = APIRouter(prefix="/weeks", tags=["weeks"])


def _team_side(team: Team, score: int | None) -> WeekTeamSide:
    return WeekTeamSide(
        abbr=team.abbr,
        nickname=team.nickname,
        name=team.name,
        color=team.color,
        score=score,
    )


def _featured_games(
    games: Sequence[Game], teams: dict[str, Team]
) -> list[FeaturedGame]:
    """The week's two highest-scoring played games, by rule (plan §2) —
    not editorial. Ties on total score prefer a division game."""
    played = [g for g in games if g.away_score is not None and g.home_score is not None]

    def sort_key(g: Game) -> tuple[int, bool]:
        home, away = teams[g.home_team], teams[g.away_team]
        is_division = (
            home.conference == away.conference and home.division == away.division
        )
        assert g.away_score is not None and g.home_score is not None
        return (g.away_score + g.home_score, is_division)

    top = sorted(played, key=sort_key, reverse=True)[:2]

    featured = []
    for g in top:
        home, away = teams[g.home_team], teams[g.away_team]
        assert g.away_score is not None and g.home_score is not None
        total = g.away_score + g.home_score
        margin = abs(g.home_score - g.away_score)
        if home.conference == away.conference and home.division == away.division:
            eyebrow = f"Game of the week · {home.conference} {home.division}"
        else:
            eyebrow = "Game of the week"
        featured.append(
            FeaturedGame(
                game_id=g.id,
                eyebrow=eyebrow,
                away_abbr=away.abbr,
                home_abbr=home.abbr,
                score_label=score_label(g.away_score, g.home_score),
                banner_color=home.color,
                note=g.recap,
                stats=[
                    FeaturedStat(key="total points", value=str(total)),
                    FeaturedStat(key="margin", value=str(margin)),
                    FeaturedStat(
                        key="closing line",
                        value=line_label(
                            g.spread_line, home_abbr=home.abbr, away_abbr=away.abbr
                        )
                        or "—",
                    ),
                ],
            )
        )
    return featured


@router.get("/{season}/{week}")
def week(session: SessionDep, season: int, week: int) -> WeekResponse:
    games = session.exec(
        select(Game)
        .where(Game.season == season, Game.week == week)
        .order_by(col(Game.kickoff_at))
    ).all()
    if not games:
        raise HTTPException(status_code=404, detail="Week not found")

    abbrs = {g.away_team for g in games} | {g.home_team for g in games}
    teams = {
        t.abbr: t
        for t in session.exec(select(Team).where(col(Team.abbr).in_(abbrs))).all()
    }

    game_rows = []
    for g in games:
        away, home = teams[g.away_team], teams[g.home_team]
        margin = (
            g.home_score - g.away_score
            if g.home_score is not None and g.away_score is not None
            else None
        )
        game_rows.append(
            WeekGame(
                id=g.id,
                kickoff_at=g.kickoff_at,
                kickoff_label=kickoff_label(g.kickoff_at),
                status=g.status,
                away=_team_side(away, g.away_score),
                home=_team_side(home, g.home_score),
                spread_line=g.spread_line,
                line_label=line_label(
                    g.spread_line, home_abbr=home.abbr, away_abbr=away.abbr
                ),
                margin=margin,
                recap=g.recap,
            )
        )

    label = f"Week {week} · {season} {phase_label(games[0].game_type)}"

    return WeekResponse(
        season=season,
        week=week,
        label=label,
        games=game_rows,
        featured=_featured_games(games, teams),
    )
