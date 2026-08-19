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
def player_page(
    session: SessionDep, player_id: str, season: int | None = None
) -> PlayerPageResponse:
    player = session.get(Player, player_id)
    stats = session.exec(
        select(PlayerSeasonStat)
        .where(PlayerSeasonStat.player_id == player_id)
        .order_by(col(PlayerSeasonStat.season))
    ).all()
    if player is None or not stats:
        raise HTTPException(status_code=404, detail="Player not found")

    # THE SEASON THE PAGE IS ABOUT. This used to be `stats[-1]`
    # unconditionally, with no `season` parameter at all — so the frontend
    # sent `?season=2024`, the route ignored it, and the entire page (team
    # chip, team name, position, games, ordinal and every rate card) came
    # from the player's LAST ingested season. A 2024 URL rendered Aaron
    # Rodgers on Pittsburgh, his 2025 team, directly beneath a
    # season-scoped picker reading "Aaron Rodgers · NYJ".
    #
    # Falling back to the most recent season rather than 404ing when the
    # player has no row for `season` is deliberate, and
    # `player.$playerId.tsx` states the reason: "a real player who simply
    # did not qualify that season is absent from the list while still
    # having a perfectly good page — a deep link to either would be
    # silently thrown away."
    latest = stats[-1]
    focus = next((s for s in stats if s.season == season), latest)

    if focus.position not in _SUPPORTED_POSITIONS:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No player page for position {focus.position!r} — "
                "Snapcount's player view covers QB, RB, WR and TE."
            ),
        )

    abbrs = {s.team for s in stats}
    teams = {
        t.abbr: t
        for t in session.exec(select(Team).where(col(Team.abbr).in_(abbrs))).all()
    }
    focus_team = teams[focus.team]

    # The positional pool `focus`'s rate cards are measured against —
    # every player at the same position in the same season, the same
    # scope `leaders` uses for its own baseline/qualifier logic. Keyed to
    # the FOCUSED season, so a 2018 page compares against 2018's field.
    position_pool = session.exec(
        select(PlayerSeasonStat).where(
            PlayerSeasonStat.season == focus.season,
            PlayerSeasonStat.position == focus.position,
        )
    ).all()

    rate_cards = []
    for metric in _RATE_CARD_METRICS:
        value = metric_value(focus, metric)
        line_baseline = baseline(position_pool, metric)
        # Unfiltered max (not qualified-only) so the bar's own player can
        # never exceed its own scale.
        scale_max = max(metric_value(s, metric) for s in position_pool)
        rate_cards.append(
            RateCard(
                key=metric,
                label=METRIC_LABELS[focus.position][metric],
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
            # Still literally "the player's most recent season", NOT the
            # focused one — `season-columns.tsx` documents this highlight as
            # "the most recent completed season" and the table is a career
            # view. Whether it should instead follow `focus` is a design
            # call, deliberately left alone here.
            is_latest=s.season == latest.season,
        )
        for s in stats
    ]

    return PlayerPageResponse(
        player=PlayerRef(
            id=player.id,
            name=player.name,
            position=focus.position,
            team_abbr=focus.team,
            team_color=focus_team.color,
            meta=(
                f"{ordinal(focus.seasons_played)} season · {focus.games} g · "
                f"{focus.position} · {focus_team.name}"
            ),
        ),
        rate_cards=rate_cards,
        seasons=seasons,
    )
