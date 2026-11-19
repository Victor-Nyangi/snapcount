from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.models import PlayerSeasonStat

# Which stat-column family a position reads from, and which volume column
# is the per-play denominator for that position's EPA.
_PREFIX_BY_POSITION = {
    "QB": "passing",
    "RB": "rushing",
    "WR": "receiving",
    "TE": "receiving",
}
_ATTEMPTS_FIELD_BY_POSITION = {
    "QB": "attempts",
    "RB": "carries",
    "WR": "targets",
    "TE": "targets",
}

# A BOARD is what the leaders screen ranks: one of the four offensive
# positions, or one of two boards that are not a single position.
#
# - "DEF" is every defender on ONE board, not DL/LB/DB groups. The feed's
#   `position` is the roster label, and it is scheme-dependent: the same
#   edge rusher is "DE" in a 4-3 and "OLB" in a 3-4 (2024's sack top five
#   spans DE, OLB and LB). Groups built on it would split the sack leaders
#   across two boards by their coordinator's playbook. Each metric already
#   selects its own position — tackles surface linebackers and safeties,
#   sacks edge rushers, interceptions defensive backs — and the card names
#   each player's position, so one board loses nothing.
# - "ALL" is every position, for the counting stats a fan means by "most
#   touchdowns": scrimmage touchdowns (rushing + receiving) and scrimmage
#   yards. Passing touchdowns are left to the QB board — folding them in
#   would put a quarterback first every season and make it the QB board
#   again.
#
# Every roster label the feed uses for a defender, observed across 2024 and
# 2026 (see `app.ingest.source`). The DEF board's pool is these positions.
DEFENSIVE_POSITIONS = frozenset(
    {
        "DE",
        "DT",
        "DL",
        "NT",
        "LB",
        "OLB",
        "ILB",
        "MLB",
        "CB",
        "DB",
        "SAF",
        "S",
        "FS",
        "SS",
    }
)

_OFFENCE_METRICS = ("epa", "yds", "td", "rate")
# Board -> the metrics it offers, in the order the metric control lists
# them. A metric outside its board's tuple is a 422, not a zero.
BOARD_METRICS: dict[str, tuple[str, ...]] = {
    "QB": _OFFENCE_METRICS,
    "RB": _OFFENCE_METRICS,
    "WR": _OFFENCE_METRICS,
    "TE": _OFFENCE_METRICS,
    "DEF": ("tackles", "sacks", "tfl", "qb_hits", "interceptions", "passes_defended"),
    "ALL": ("td", "yds"),
}

# Qualifier thresholds. QB/RB/WR/TE are stated verbatim on the Leaders
# mockup: "QB 14+ starts, RB 120+ carries, WR/TE 50+ targets". The two new
# boards have no mockup, so their volume measures are the nearest thing the
# feed has to playing time (snaps are not ingested):
#
# - DEF: 20 total tackles — an every-down defender clears it by midseason,
#   a special-teamer with a handful does not, so the baseline describes
#   defenders rather than the whole 53. Chosen over games because the feed
#   only emits a row for a week with a stat in it, so "games" for a
#   defender means "weeks he recorded something".
# - ALL: 50 carries + targets — the RB and WR/TE measures added together,
#   so the pool is players the offence actually gives the ball to.
#
# These are FULL-SEASON numbers; `qualifier_threshold` scales them to the
# share of the regular season played, so a board in week 10 is not judged
# against week 18.
#
# Public (no leading underscore): `app.api.routes._metrics` imports this
# directly for `qualifier_label` rather than redeclaring it — one dict, one
# owner, so the served label can never silently stop describing the actual
# filter this module applies.
QUALIFIER_THRESHOLD_BY_POSITION = {
    "QB": 14,
    "RB": 120,
    "WR": 50,
    "TE": 50,
    "DEF": 20,
    "ALL": 50,
}

_YARDS_SUFFIX = "yards"
_TD_SUFFIX = "tds"  # PlayerSeasonStat's own column suffix is plural; the
# metric *key* below (the API/frontend contract) is singular "td".

# Every metric key the API and the frontend search schema agree on
# (`routes/_layout/leaders.tsx`). Keep this in sync with that enum — it is
# what stops the two drifting apart again.
SUPPORTED_METRICS = frozenset(m for metrics in BOARD_METRICS.values() for m in metrics)


# The stat columns below are reached by name (the position prefix is only
# known at runtime), so `getattr` is unavoidable. These two wrappers put the
# column's real type back on the value instead of letting `Any` spread
# through every arithmetic expression that touches it.
def _int_field(stat: PlayerSeasonStat, name: str) -> int:
    value: int = getattr(stat, name)
    return value


def _float_field(stat: PlayerSeasonStat, name: str) -> float:
    value: float = getattr(stat, name)
    return value


def total_tackles(stat: PlayerSeasonStat) -> int:
    """Combined tackles as the league counts them. All three columns are
    needed: solo + assists alone reads Zaire Franklin's 2024 as 155; the
    official figure, and this sum, is 173."""
    return (
        stat.def_tackles_solo + stat.def_tackles_with_assist + stat.def_tackle_assists
    )


_DEFENCE_COLUMN = {
    "sacks": "def_sacks",
    "tfl": "def_tackles_for_loss",
    "qb_hits": "def_qb_hits",
    "interceptions": "def_interceptions",
    "passes_defended": "def_pass_defended",
}


def _defence_value(stat: PlayerSeasonStat, metric: str) -> float:
    if metric == "tackles":
        return float(total_tackles(stat))
    column = _DEFENCE_COLUMN.get(metric)
    if column is None:
        raise ValueError(f"unknown metric for the DEF board: {metric!r}")
    return float(getattr(stat, column))


def _scrimmage_value(stat: PlayerSeasonStat, metric: str) -> float:
    if metric == "td":
        return float(stat.rushing_tds + stat.receiving_tds)
    if metric == "yds":
        return float(stat.rushing_yards + stat.receiving_yards)
    raise ValueError(f"unknown metric for the ALL board: {metric!r}")


def metric_value(
    stat: PlayerSeasonStat, metric: str, board: str | None = None
) -> float:
    """Read a leader-board metric off `stat` for `board` (default: the
    player's own position).

    The DEF board reads the defensive columns; the ALL board reads
    scrimmage totals (rushing + receiving — never passing). The offensive
    boards read the column family that matches the position (QB ->
    passing_*, RB -> rushing_*, WR/TE -> receiving_*).

    `metric` is one of `SUPPORTED_METRICS`: "epa", "yds", "td", "rate".

    EPA and rate are both per play, not season totals: EPA is the
    position's total EPA divided by its volume stat (attempts/carries/
    targets); rate is yards divided by that same volume stat (yards per
    attempt/carry/target). A player with zero volume has no rate to
    compute, so both are 0.0 rather than a division-by-zero error.
    """
    board = board or stat.position
    if board == "DEF":
        return _defence_value(stat, metric)
    if board == "ALL":
        return _scrimmage_value(stat, metric)

    prefix = _PREFIX_BY_POSITION.get(board)
    if prefix is None:
        raise ValueError(f"unknown position: {board!r}")

    if metric == "epa":
        attempts = _int_field(stat, _ATTEMPTS_FIELD_BY_POSITION[board])
        if not attempts:
            return 0.0
        return _float_field(stat, f"{prefix}_epa") / attempts

    if metric == "rate":
        attempts = _int_field(stat, _ATTEMPTS_FIELD_BY_POSITION[board])
        if not attempts:
            return 0.0
        return _int_field(stat, f"{prefix}_{_YARDS_SUFFIX}") / attempts

    if metric == "yds":
        return float(_int_field(stat, f"{prefix}_{_YARDS_SUFFIX}"))
    if metric == "td":
        return float(_int_field(stat, f"{prefix}_{_TD_SUFFIX}"))

    raise ValueError(f"unknown metric: {metric!r}")


@dataclass(frozen=True)
class SeasonProgress:
    """How far a season's regular season has got, from its schedule.

    `weeks_played` is the latest regular-season week with a final score;
    `weeks_total` is the last regular-season week on the schedule (17
    through 2020, 18 from 2021). The schedule is published whole, so the
    total is known from the first ingest of a season.
    """

    weeks_played: int
    weeks_total: int

    @property
    def complete(self) -> bool:
        return self.weeks_played >= self.weeks_total


def qualifier_threshold(position: str, progress: SeasonProgress | None = None) -> int:
    """`position`'s volume threshold, pro-rated to `progress`.

    `full x weeks_played / weeks_total`, rounded UP — a fractional game
    cannot be played, and rounding down would admit a player on less than
    the pro-rated share. Integer arithmetic, so a completed season returns
    the full-season number exactly rather than 13.999…

    `None` (no schedule ingested for the season) and a completed season
    both keep the full-season threshold. The floor is 1: before a week is
    final the share is zero, and a threshold of zero qualifies every row in
    the table.
    """
    full = QUALIFIER_THRESHOLD_BY_POSITION[position]
    if progress is None or progress.complete or progress.weeks_total <= 0:
        return full
    scaled = -(-full * progress.weeks_played // progress.weeks_total)  # ceil
    return max(1, scaled)


def _qualifier_volume(stat: PlayerSeasonStat, board: str) -> int | None:
    """The volume a board's qualifier counts, or None for a board with no
    qualifier (and so no leaderboard)."""
    if board == "QB":
        return stat.games
    if board == "RB":
        return stat.carries
    if board in ("WR", "TE"):
        return stat.targets
    if board == "DEF":
        return total_tackles(stat)
    if board == "ALL":
        return stat.carries + stat.targets
    return None


def is_qualified(
    stat: PlayerSeasonStat,
    progress: SeasonProgress | None = None,
    board: str | None = None,
) -> bool:
    """Whether `stat` clears `board`'s (default: its own position's)
    volume threshold, pro-rated to `progress` (see `qualifier_threshold`)."""
    board = board or stat.position
    volume = _qualifier_volume(stat, board)
    if volume is None:
        return False
    return volume >= qualifier_threshold(board, progress)


def baseline(
    stats: Sequence[PlayerSeasonStat],
    metric: str,
    progress: SeasonProgress | None = None,
    board: str | None = None,
) -> float:
    """Mean `metric` value across QUALIFIED players only.

    An unqualified outlier (three carries and a freak long run) would
    otherwise drag the positional baseline every leader card is measured
    against. Qualification is pro-rated by `progress`, the same as the
    board's own rows, so the baseline is always the mean of a pool the
    reader can see.
    """
    qualified_values = [
        metric_value(stat, metric, board)
        for stat in stats
        if is_qualified(stat, progress, board)
    ]
    if not qualified_values:
        return 0.0
    return sum(qualified_values) / len(qualified_values)
