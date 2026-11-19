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

# Qualifier thresholds, stated verbatim on the Leaders mockup:
# "QB 14+ starts, RB 120+ carries, WR/TE 50+ targets". These are FULL-SEASON
# numbers; `qualifier_threshold` scales them to the share of the regular
# season played, so a board in week 10 is not judged against week 18.
_QUALIFIER_FIELD_BY_POSITION = {
    "QB": "games",
    "RB": "carries",
    "WR": "targets",
    "TE": "targets",
}
# Public (no leading underscore): `app.api.routes._metrics` imports this
# directly for `qualifier_label` rather than redeclaring it — one dict, one
# owner, so the served label can never silently stop describing the actual
# filter this module applies.
QUALIFIER_THRESHOLD_BY_POSITION = {
    "QB": 14,
    "RB": 120,
    "WR": 50,
    "TE": 50,
}

_YARDS_SUFFIX = "yards"
_TD_SUFFIX = "tds"  # PlayerSeasonStat's own column suffix is plural; the
# metric *key* below (the API/frontend contract) is singular "td".

# The four metric keys the API and frontend search schema agree on
# (`z.enum(['epa', 'yds', 'td', 'rate'])`). Keep this in sync with that
# enum — it is what stops the two drifting apart again.
SUPPORTED_METRICS = frozenset({"epa", "yds", "td", "rate"})


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


def metric_value(stat: PlayerSeasonStat, metric: str) -> float:
    """Read a leader-board metric off `stat`, from the column family that
    matches the player's position (QB -> passing_*, RB -> rushing_*,
    WR/TE -> receiving_*).

    `metric` is one of `SUPPORTED_METRICS`: "epa", "yds", "td", "rate".

    EPA and rate are both per play, not season totals: EPA is the
    position's total EPA divided by its volume stat (attempts/carries/
    targets); rate is yards divided by that same volume stat (yards per
    attempt/carry/target). A player with zero volume has no rate to
    compute, so both are 0.0 rather than a division-by-zero error.
    """
    prefix = _PREFIX_BY_POSITION.get(stat.position)
    if prefix is None:
        raise ValueError(f"unknown position: {stat.position!r}")

    if metric == "epa":
        attempts = _int_field(stat, _ATTEMPTS_FIELD_BY_POSITION[stat.position])
        if not attempts:
            return 0.0
        return _float_field(stat, f"{prefix}_epa") / attempts

    if metric == "rate":
        attempts = _int_field(stat, _ATTEMPTS_FIELD_BY_POSITION[stat.position])
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


def is_qualified(
    stat: PlayerSeasonStat, progress: SeasonProgress | None = None
) -> bool:
    """Whether `stat` clears its position's leader-board volume threshold,
    pro-rated to `progress` (see `qualifier_threshold`)."""
    field_name = _QUALIFIER_FIELD_BY_POSITION.get(stat.position)
    if field_name is None:
        return False
    threshold = qualifier_threshold(stat.position, progress)
    return _int_field(stat, field_name) >= threshold


def baseline(
    stats: Sequence[PlayerSeasonStat],
    metric: str,
    progress: SeasonProgress | None = None,
) -> float:
    """Mean `metric` value across QUALIFIED players only.

    An unqualified outlier (three carries and a freak long run) would
    otherwise drag the positional baseline every leader card is measured
    against. Qualification is pro-rated by `progress`, the same as the
    board's own rows, so the baseline is always the mean of a pool the
    reader can see.
    """
    qualified_values = [
        metric_value(stat, metric) for stat in stats if is_qualified(stat, progress)
    ]
    if not qualified_values:
        return 0.0
    return sum(qualified_values) / len(qualified_values)
