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

    # Names for EVERY qualified player, not just the ones that make the
    # board, because the name is part of the sort key below and the cut
    # cannot be made before the order is settled.
    players = {
        p.id: p
        for p in session.exec(
            select(Player).where(
                col(Player.id).in_([s.player_id for s in qualified])
            )
        ).all()
    }

    # DETERMINISTIC. `sort` is stable, so sorting on the metric alone left
    # ties in whatever order the rows came back from a `select()` with no
    # `ORDER BY` — and Postgres promises nothing there, so the same URL
    # could produce a different board. Name is the tiebreak: arbitrary, but
    # a reason, and the same one the reader sees.
    qualified.sort(
        key=lambda s: (-metric_value(s, metric.value), players[s.player_id].name)
    )

    # CARRY THE TIE PAST THE CUTOFF. `qualified[:limit]` cut mid-tie: 2024
    # receiving touchdowns has Brian Thomas Jr., Justin Jefferson and Tee
    # Higgins all on 10, so "Top 5" showed one of them and silently dropped
    # two identical seasons. Whichever survived was decided by row order.
    # Better to hand back seven rows for a Top 5 than to publish a cut that
    # cannot be justified by the metric on screen.
    top = qualified[:limit]
    if len(qualified) > limit:
        edge = metric_value(qualified[limit - 1], metric.value)
        top += [
            s
            for s in qualified[limit:]
            if metric_value(s, metric.value) == edge
        ]
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
    # COMPETITION RANKING: equal values share the lowest rank and the next
    # player resumes at their true position (1, 2, 2, 4). `enumerate` gave
    # a position in a list and called it a rank, so three players on 10
    # touchdowns read as 5th, 6th and 7th. The explorer's own selection
    # panel already ranks this way — two teams on +157 in 2024 are both
    # "Ranked #3 of 32" — and the leaderboard disagreed with it.
    ranks: list[int] = []
    for index, stat in enumerate(top):
        value = metric_value(stat, metric.value)
        if index and value == metric_value(top[index - 1], metric.value):
            ranks.append(ranks[-1])
        else:
            ranks.append(index + 1)

    for rank, stat in zip(ranks, top, strict=True):
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
