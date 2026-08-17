from fastapi import APIRouter, HTTPException
from sqlmodel import col, select

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

# The player page's rate cards, verbatim order from the design mockup's
# own `rateCards` list (`resources/design-v2-seven-screens.html`):
# `[['epa','EPA per play',3],['rate','Yards per attempt',1],['td','Touchdowns',0]]`.
# Deliberately excludes `yds` — every card is "value vs. positional
# baseline," which is informative for a true rate (epa, rate) and
# defensible for a season count (td), but a raw yardage total mostly
# restates games played: a backup with 4 starts reads "below baseline" for
# reasons that say nothing about how well he played. `yds` stays a valid
# `SUPPORTED_METRICS` entry for the leaderboard (sorting by total yards is
# fine there) — only the player page's baseline-comparison cards drop it.
# The design's 3-card grid (`repeat(auto-fit, minmax(280px,1fr))`) is also
# sized for exactly three.
_RATE_CARD_METRICS = ("epa", "rate", "td")
# `PlayerSeasonStat` holds every position; `metric_value` raises for
# anything outside this set (see `app.analytics.leaders`). The player page
# itself only has a design for these four — its position selector offers
# exactly QB/RB/WR/TE, and its rate cards are defined in terms of passing/
# rushing/receiving volume, so a kicker or lineman has no meaningful value
# for any of them.
_SUPPORTED_POSITIONS = frozenset({"QB", "RB", "WR", "TE"})


@router.get("")
def list_players(
    session: SessionDep, season: int, position: LeaderPosition
) -> list[PlayerListRow]:
    rows = session.exec(
        select(PlayerSeasonStat, Player)
        .join(Player, col(Player.id) == col(PlayerSeasonStat.player_id))
        .where(
            PlayerSeasonStat.season == season,
            PlayerSeasonStat.position == position.value,
        )
        .order_by(col(Player.name))
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
        .order_by(col(PlayerSeasonStat.season))
    ).all()
    if player is None or not stats:
        raise HTTPException(status_code=404, detail="Player not found")

    latest = stats[-1]

    if latest.position not in _SUPPORTED_POSITIONS:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No player page for position {latest.position!r} — "
                "Snapcount's player view covers QB, RB, WR and TE."
            ),
        )

    abbrs = {s.team for s in stats}
    teams = {
        t.abbr: t
        for t in session.exec(select(Team).where(col(Team.abbr).in_(abbrs))).all()
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
    for metric in _RATE_CARD_METRICS:
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
