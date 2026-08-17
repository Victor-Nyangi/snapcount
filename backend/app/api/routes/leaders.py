from fastapi import APIRouter, HTTPException
from sqlmodel import col, select

from app.analytics.leaders import baseline, is_qualified, metric_value
from app.api.deps import SessionDep
from app.api.routes._format import ordinal
from app.api.routes._metrics import METRIC_LABELS, PRECISION, UNITS, qualifier_label
from app.models import Player, PlayerSeasonStat, Team
from app.schemas.leaders import (
    LeaderMetric,
    LeaderPlayer,
    LeaderPosition,
    LeaderRow,
    LeaderSecondary,
    LeadersResponse,
)

router = APIRouter(prefix="/leaders", tags=["leaders"])


@router.get("/{season}")
def leaders(
    session: SessionDep,
    season: int,
    position: LeaderPosition,
    metric: LeaderMetric,
    limit: int = 5,
) -> LeadersResponse:
    # `PlayerSeasonStat` holds every position; `metric_value` raises for
    # anything outside QB/RB/WR/TE, so the position filter has to happen
    # in the query, not in Python — the (season, position) index exists
    # for exactly this.
    stats = session.exec(
        select(PlayerSeasonStat).where(
            PlayerSeasonStat.season == season,
            PlayerSeasonStat.position == position.value,
        )
    ).all()
    if not stats:
        raise HTTPException(status_code=404, detail="No data for that season")

    qualified = [s for s in stats if is_qualified(s)]
    qualified.sort(key=lambda s: metric_value(s, metric.value), reverse=True)
    top = qualified[:limit]

    players = {
        p.id: p
        for p in session.exec(
            select(Player).where(col(Player.id).in_([s.player_id for s in top]))
        ).all()
    }
    teams = {
        t.abbr: t
        for t in session.exec(
            select(Team).where(col(Team.abbr).in_([s.team for s in top]))
        ).all()
    }

    line_baseline = baseline(stats, metric.value)
    # `metric == "yds"` gets a TD secondary; every other metric gets YDS —
    # matches the design mockup's leader-card rule exactly.
    if metric == LeaderMetric.yds:
        secondary_metric, secondary_key = "td", "TD"
    else:
        secondary_metric, secondary_key = "yds", "YDS"

    rows = []
    for rank, stat in enumerate(top, start=1):
        player = players[stat.player_id]
        team = teams[stat.team]
        value = metric_value(stat, metric.value)
        rows.append(
            LeaderRow(
                rank=rank,
                player=LeaderPlayer(
                    id=player.id,
                    name=player.name,
                    team_abbr=team.abbr,
                    team_color=team.color,
                    meta=f"{ordinal(stat.seasons_played)} season · {stat.games} g",
                ),
                value=value,
                secondary=LeaderSecondary(
                    key=secondary_key,
                    value=int(metric_value(stat, secondary_metric)),
                ),
                vs_baseline=value - line_baseline,
            )
        )

    return LeadersResponse(
        season=season,
        position=position.value,
        metric=metric.value,
        metric_label=METRIC_LABELS[position.value][metric.value],
        unit=UNITS[position.value][metric.value],
        precision=PRECISION[metric.value],
        baseline=line_baseline,
        qualifier_label=qualifier_label(position.value),
        rows=rows,
    )
