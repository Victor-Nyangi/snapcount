from fastapi import APIRouter, HTTPException
from sqlmodel import col, select

from app.analytics.trends import team_schedule
from app.api.deps import SessionDep
from app.api.routes._format import record_label
from app.models import Game, Team, TeamSeasonStat
from app.schemas.teams import (
    DepthGroup,
    ScheduleOpponent,
    ScheduleRowOut,
    TeamPageResponse,
    TeamRef,
    TeamStat,
)

router = APIRouter(prefix="/teams", tags=["teams"])

# Structural — no names. Personnel/formation data needs charted plays we
# don't ingest; the design ships this panel with em-dashes and a caption
# saying so rather than a "coming soon" state. Verbatim from the design
# mockup's own `DEPTH` table (resources/design-v2-seven-screens.html).
_DEPTH: dict[str, list[str]] = {
    "QB": ["1 · starter", "2 · backup", "3 · practice squad"],
    "RB": ["1 · lead back", "2 · rotational", "3 · third down"],
    "WR": ["1 · X", "2 · Z", "3 · slot", "4 · rotational"],
    "TE": ["1 · starter", "2 · blocking"],
    "OL": ["LT", "LG", "C", "RG", "RT"],
    "DL": ["EDGE", "DT", "DT", "EDGE"],
    "LB": ["MIKE", "WILL", "SAM"],
    "DB": ["CB1", "CB2", "NB", "FS", "SS"],
}
_DEPTH_GROUPS = [DepthGroup(group=g, slots=slots) for g, slots in _DEPTH.items()]


def _result(margin: int | None) -> str | None:
    if margin is None:
        return None
    if margin > 0:
        return "W"
    if margin < 0:
        return "L"
    return "T"


@router.get("/{season}/{abbr}")
def team_page(session: SessionDep, season: int, abbr: str) -> TeamPageResponse:
    team = session.get(Team, abbr)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")

    stat = session.get(TeamSeasonStat, (season, abbr))
    if stat is None:
        raise HTTPException(status_code=404, detail="Season not found for team")

    games = session.exec(
        select(Game).where(
            Game.season == season,
            Game.game_type == "REG",
            (Game.home_team == abbr) | (Game.away_team == abbr),
        )
    ).all()

    # `team_schedule` is the existing pure analytics function (cumulative
    # differential, already tested) — the route queries the REG-season
    # games and hands them over rather than re-deriving the running total.
    rows = team_schedule(abbr, games)

    # `team_schedule` sorts the same games by kickoff_at internally; mirror
    # that ordering here so this list zips 1:1 with its output below, for
    # the raw per-game scores it doesn't carry (it only exposes margin).
    ordered_games = sorted(games, key=lambda g: g.kickoff_at)

    abbrs = {g.away_team for g in games} | {g.home_team for g in games}
    opponents = {
        t.abbr: t
        for t in session.exec(select(Team).where(col(Team.abbr).in_(abbrs))).all()
    }

    schedule = []
    for row, game in zip(rows, ordered_games, strict=True):
        opponent = opponents[row.opponent]
        if game.home_score is not None and game.away_score is not None:
            team_score = game.home_score if row.is_home else game.away_score
            opp_score = game.away_score if row.is_home else game.home_score
            # Team-first, opponent-second — the team page reads scores from
            # the viewed team's own perspective, unlike `weeks`' away/home
            # convention (`_format.score_label`), so it's inlined here.
            label = f"{team_score}–{opp_score}"
        else:
            label = None
        schedule.append(
            ScheduleRowOut(
                week=row.week,
                week_label=f"W{row.week}",
                opponent=ScheduleOpponent(
                    abbr=opponent.abbr, nickname=opponent.nickname, color=opponent.color
                ),
                is_home=row.is_home,
                result=_result(row.margin),
                score_label=label,
                margin=row.margin,
                cumulative=row.cumulative,
            )
        )

    games_played = stat.wins + stat.losses + stat.ties
    points_per_game = stat.points_for / games_played if games_played else 0.0
    allowed_per_game = stat.points_against / games_played if games_played else 0.0
    diff_per_game = points_per_game - allowed_per_game

    season_stats = session.exec(
        select(TeamSeasonStat).where(TeamSeasonStat.season == season)
    ).all()
    ranked = sorted(season_stats, key=lambda s: (-s.power, s.team))
    power_rank = next(i for i, s in enumerate(ranked, start=1) if s.team == abbr)

    stats = [
        TeamStat(key="points / game", value=f"{points_per_game:.1f}"),
        TeamStat(key="allowed / game", value=f"{allowed_per_game:.1f}"),
        TeamStat(
            key="differential / game",
            value=f"{'+' if diff_per_game > 0 else ''}{diff_per_game:.1f}",
        ),
        TeamStat(key="power rank", value=f"#{power_rank}"),
    ]

    return TeamPageResponse(
        team=TeamRef(
            abbr=team.abbr,
            name=team.name,
            nickname=team.nickname,
            conference=team.conference,
            division=team.division,
            color=team.color,
        ),
        record_label=record_label(stat.wins, stat.losses, stat.ties),
        conference_label=f"{team.conference} {team.division}",
        stats=stats,
        schedule=schedule,
        depth_groups=_DEPTH_GROUPS,
    )
