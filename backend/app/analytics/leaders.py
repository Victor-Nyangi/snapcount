from __future__ import annotations

from collections.abc import Sequence

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
# "QB 14+ starts, RB 120+ carries, WR/TE 50+ targets".
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


def is_qualified(stat: PlayerSeasonStat) -> bool:
    """Whether `stat` clears its position's leader-board volume threshold."""
    field_name = _QUALIFIER_FIELD_BY_POSITION.get(stat.position)
    if field_name is None:
        return False
    threshold = QUALIFIER_THRESHOLD_BY_POSITION[stat.position]
    return _int_field(stat, field_name) >= threshold


def baseline(stats: Sequence[PlayerSeasonStat], metric: str) -> float:
    """Mean `metric` value across QUALIFIED players only.

    An unqualified outlier (three carries and a freak long run) would
    otherwise drag the positional baseline every leader card is measured
    against.
    """
    qualified_values = [
        metric_value(stat, metric) for stat in stats if is_qualified(stat)
    ]
    if not qualified_values:
        return 0.0
    return sum(qualified_values) / len(qualified_values)
