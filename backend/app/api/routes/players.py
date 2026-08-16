from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.analytics.leaders import baseline, metric_value
from app.api.deps import SessionDep
from app.api.routes._format import ordinal
from app.api.routes._metrics import METRIC_LABELS, PRECISION
from app.models import Player, PlayerSeasonStat, Team
from app.schemas.leaders import LeaderPosition
from app.schemas.players import (
    PlayerListRow,
    PlayerPageResponse,
    PlayerRef,
    PlayerSeasonRow,
    RateCard,
)

router = APIRouter(prefix="/players", tags=["players"])

_METRICS = ("epa", "yds", "td", "rate")


@router.get("")
def list_players(
    session: SessionDep, season: int, position: LeaderPosition
) -> list[PlayerListRow]:
    rows = session.exec(
        select(PlayerSeasonStat, Player)
        .join(Player, Player.id == PlayerSeasonStat.player_id)  # type: ignore[arg-type]
        .where(
            PlayerSeasonStat.season == season,
            PlayerSeasonStat.position == position.value,
        )
        .order_by(Player.name)
    ).all()
    return [
        PlayerListRow(id=player.id, name=player.name, team_abbr=stat.team)
        for stat, player in rows
    ]


@router.get("/{player_id}")
def player_page(session: SessionDep, player_id: str) -> PlayerPageResponse:
    player = session.get(Player, player_id)
    stats = session.exec(
        select(PlayerSeasonStat)
        .where(PlayerSeasonStat.player_id == player_id)
        .order_by(PlayerSeasonStat.season)
    ).all()
    if player is None or not stats:
        raise HTTPException(status_code=404, detail="Player not found")

    latest = stats[-1]

    abbrs = {s.team for s in stats}
    teams = {
        t.abbr: t
        for t in session.exec(select(Team).where(Team.abbr.in_(abbrs))).all()  # type: ignore[attr-defined]
    }
    latest_team = teams[latest.team]

    # The positional pool `latest`'s rate cards are measured against —
    # every player at the same position in the same season, the same
    # scope `leaders` uses for its own baseline/qualifier logic.
    position_pool = session.exec(
        select(PlayerSeasonStat).where(
            PlayerSeasonStat.season == latest.season,
            PlayerSeasonStat.position == latest.position,
        )
    ).all()

    rate_cards = []
    for metric in _METRICS:
        value = metric_value(latest, metric)
        line_baseline = baseline(position_pool, metric)
        # Unfiltered max (not qualified-only) so the bar's own player can
        # never exceed its own scale.
        scale_max = max(metric_value(s, metric) for s in position_pool)
        rate_cards.append(
            RateCard(
                key=metric,
                label=METRIC_LABELS[latest.position][metric],
                precision=PRECISION[metric],
                value=value,
                baseline=line_baseline,
                delta=value - line_baseline,
                scale_max=scale_max,
            )
        )

    seasons = [
        PlayerSeasonRow(
            season=s.season,
            team_abbr=s.team,
            team_color=teams[s.team].color,
            games=s.games,
            yards=metric_value(s, "yds"),
            tds=metric_value(s, "td"),
            rate=metric_value(s, "rate"),
            epa=metric_value(s, "epa"),
            is_latest=s.season == latest.season,
        )
        for s in stats
    ]

    return PlayerPageResponse(
        player=PlayerRef(
            id=player.id,
            name=player.name,
            position=latest.position,
            team_abbr=latest.team,
            team_color=latest_team.color,
            meta=(
                f"{ordinal(latest.seasons_played)} season · {latest.games} g · "
                f"{latest.position} · {latest_team.name}"
            ),
        ),
        rate_cards=rate_cards,
        seasons=seasons,
    )
