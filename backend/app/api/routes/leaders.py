from fastapi import APIRouter, HTTPException
from sqlmodel import col, select

from app.analytics.leaders import (
    BOARD_METRICS,
    DEFENSIVE_POSITIONS,
    baseline,
    is_qualified,
    metric_value,
)
from app.api.deps import SessionDep
from app.api.routes._metrics import (
    METRIC_LABELS,
    NOTES,
    PRECISION,
    UNITS,
    qualifier_label,
    season_progress,
)
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

# Boards whose rows mix positions, and so name each player's position on
# the card. A QB board saying "QB" on every row would only repeat the tab.
_MIXED_POSITION_BOARDS = frozenset({LeaderPosition.DEF, LeaderPosition.ALL})

# The card's secondary readout is always a whole count (see LeaderCard),
# so it is never sacks. Per board: (metric shown, key) when the rank metric
# is `primary`, else the fallback pair.
_SECONDARY: dict[str, tuple[str, tuple[str, str], tuple[str, str]]] = {
    # `metric == "yds"` gets a TD secondary; every other metric gets YDS —
    # matches the design mockup's leader-card rule exactly. ALL follows the
    # same rule with scrimmage totals.
    "offence": ("yds", ("td", "TD"), ("yds", "YDS")),
    "DEF": ("tackles", ("tfl", "TFL"), ("tackles", "TKL")),
}


@router.get("/{season}")
def leaders(
    session: SessionDep,
    season: int,
    position: LeaderPosition,
    metric: LeaderMetric,
    limit: int = 5,
) -> LeadersResponse:
    board = position.value
    # A pair the board does not offer is the caller's error, not a board
    # of zeros: "QB sacks" would rank every quarterback at 0.0.
    if metric.value not in BOARD_METRICS[board]:
        raise HTTPException(
            status_code=422,
            detail=f"The {board} board offers {', '.join(BOARD_METRICS[board])}",
        )

    # `PlayerSeasonStat` holds every position; `metric_value` reads the
    # columns of the BOARD, so the pool has to be filtered in the query —
    # the (season, position) index exists for exactly this. DEF is every
    # defensive roster label; ALL is the whole season.
    query = select(PlayerSeasonStat).where(PlayerSeasonStat.season == season)
    if position == LeaderPosition.DEF:
        query = query.where(col(PlayerSeasonStat.position).in_(DEFENSIVE_POSITIONS))
    elif position != LeaderPosition.ALL:
        query = query.where(PlayerSeasonStat.position == board)
    stats = session.exec(query).all()
    if not stats:
        raise HTTPException(status_code=404, detail="No data for that season")

    # Thresholds scale with how much of the regular season is final, so a
    # week-10 board is not judged against a full season's volume.
    progress = season_progress(session, season)
    qualified = [s for s in stats if is_qualified(s, progress, board)]

    def value_of(stat: PlayerSeasonStat, name: str = metric.value) -> float:
        return metric_value(stat, name, board)

    # Names for EVERY qualified player, not just the ones that make the
    # board, because the name is part of the sort key below and the cut
    # cannot be made before the order is settled.
    players = {
        p.id: p
        for p in session.exec(
            select(Player).where(col(Player.id).in_([s.player_id for s in qualified]))
        ).all()
    }

    # DETERMINISTIC. `sort` is stable, so sorting on the metric alone left
    # ties in whatever order the rows came back from a `select()` with no
    # `ORDER BY` — and Postgres promises nothing there, so the same URL
    # could produce a different board. Name is the tiebreak: arbitrary, but
    # a reason, and the same one the reader sees.
    qualified.sort(key=lambda s: (-value_of(s), players[s.player_id].name))

    # CARRY THE TIE PAST THE CUTOFF. `qualified[:limit]` cut mid-tie: 2024
    # receiving touchdowns has Brian Thomas Jr., Justin Jefferson and Tee
    # Higgins all on 10, so "Top 5" showed one of them and silently dropped
    # two identical seasons. Whichever survived was decided by row order.
    # Better to hand back seven rows for a Top 5 than to publish a cut that
    # cannot be justified by the metric on screen.
    top = qualified[:limit]
    if len(qualified) > limit:
        edge = value_of(qualified[limit - 1])
        top += [s for s in qualified[limit:] if value_of(s) == edge]
    teams = {
        t.abbr: t
        for t in session.exec(
            select(Team).where(col(Team.abbr).in_([s.team for s in top]))
        ).all()
    }

    line_baseline = baseline(stats, metric.value, progress, board)
    primary, when_primary, otherwise = _SECONDARY.get(board, _SECONDARY["offence"])
    secondary_metric, secondary_key = (
        when_primary if metric.value == primary else otherwise
    )

    rows = []
    # COMPETITION RANKING: equal values share the lowest rank and the next
    # player resumes at their true position (1, 2, 2, 4). `enumerate` gave
    # a position in a list and called it a rank, so three players on 10
    # touchdowns read as 5th, 6th and 7th. The explorer's own selection
    # panel already ranks this way — two teams on +157 in 2024 are both
    # "Ranked #3 of 32" — and the leaderboard disagreed with it.
    ranks: list[int] = []
    for index, stat in enumerate(top):
        value = value_of(stat)
        if index and value == value_of(top[index - 1]):
            ranks.append(ranks[-1])
        else:
            ranks.append(index + 1)

    for rank, stat in zip(ranks, top, strict=True):
        player = players[stat.player_id]
        team = teams[stat.team]
        value = value_of(stat)
        meta = f"{stat.season} season · {stat.games} g"
        if position in _MIXED_POSITION_BOARDS:
            meta = f"{stat.season} season · {stat.position} · {stat.games} g"
        rows.append(
            LeaderRow(
                rank=rank,
                player=LeaderPlayer(
                    id=player.id,
                    name=player.name,
                    team_abbr=team.abbr,
                    team_color=team.color,
                    meta=meta,
                ),
                value=value,
                secondary=LeaderSecondary(
                    key=secondary_key,
                    value=int(value_of(stat, secondary_metric)),
                ),
                vs_baseline=value - line_baseline,
            )
        )

    return LeadersResponse(
        season=season,
        position=position.value,
        metric=metric.value,
        metric_label=METRIC_LABELS[board][metric.value],
        unit=UNITS[board][metric.value],
        precision=PRECISION[metric.value],
        baseline=line_baseline,
        qualifier_label=qualifier_label(board, progress),
        note=NOTES.get((board, metric.value)),
        rows=rows,
    )
