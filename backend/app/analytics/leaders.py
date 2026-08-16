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
_QUALIFIER_THRESHOLD_BY_POSITION = {
    "QB": 14,
    "RB": 120,
    "WR": 50,
    "TE": 50,
}

_YARDS_SUFFIX = "yards"
_TDS_SUFFIX = "tds"


def metric_value(stat: PlayerSeasonStat, metric: str) -> float:
    """Read a leader-board metric off `stat`, from the column family that
    matches the player's position (QB -> passing_*, RB -> rushing_*,
    WR/TE -> receiving_*).

    EPA is per play, not a season total: it is the position's total EPA
    divided by its volume stat (attempts/carries/targets). A player with
    zero volume has no rate to compute, so EPA is 0.0 rather than a
    division-by-zero error.
    """
    prefix = _PREFIX_BY_POSITION.get(stat.position)
    if prefix is None:
        raise ValueError(f"unknown position: {stat.position!r}")

    if metric == "epa":
        attempts_field = _ATTEMPTS_FIELD_BY_POSITION[stat.position]
        attempts = getattr(stat, attempts_field)
        if not attempts:
            return 0.0
        total_epa: float = getattr(stat, f"{prefix}_epa")
        return total_epa / attempts

    if metric == "yds":
        return float(getattr(stat, f"{prefix}_{_YARDS_SUFFIX}"))
    if metric == "tds":
        return float(getattr(stat, f"{prefix}_{_TDS_SUFFIX}"))

    raise ValueError(f"unknown metric: {metric!r}")


def is_qualified(stat: PlayerSeasonStat) -> bool:
    """Whether `stat` clears its position's leader-board volume threshold."""
    field_name = _QUALIFIER_FIELD_BY_POSITION.get(stat.position)
    if field_name is None:
        return False
    threshold = _QUALIFIER_THRESHOLD_BY_POSITION[stat.position]
    return getattr(stat, field_name) >= threshold


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
