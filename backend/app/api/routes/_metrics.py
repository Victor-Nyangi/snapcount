"""Shared leader-metric display data — used by both `leaders.py` (the
leaderboards) and `players.py` (the player page's rate cards), since both
render the same four metrics (`epa`, `yds`, `td`, `rate`) with the same
per-position wording, units, and fixed precision.

Verbatim from the design mockup's own `METRICS`/`UNITS` tables
(`resources/design-v2-seven-screens.html`) — the label text and precision
are presentation data, not analytics, so they live here rather than in
`app.analytics.leaders`.
"""

from __future__ import annotations

from app.analytics.leaders import QUALIFIER_THRESHOLD_BY_POSITION

# position -> metric -> label, e.g. QB's "epa" reads "EPA per play" but
# RB's reads "EPA per rush".
METRIC_LABELS: dict[str, dict[str, str]] = {
    "QB": {
        "epa": "EPA per play",
        "yds": "Passing yards",
        "td": "Touchdowns",
        "rate": "Yards per attempt",
    },
    "RB": {
        "epa": "EPA per rush",
        "yds": "Rushing yards",
        "td": "Touchdowns",
        "rate": "Yards per carry",
    },
    "WR": {
        "epa": "EPA per target",
        "yds": "Receiving yards",
        "td": "Touchdowns",
        "rate": "Yards per target",
    },
    "TE": {
        "epa": "EPA per target",
        "yds": "Receiving yards",
        "td": "Touchdowns",
        "rate": "Yards per target",
    },
}

UNITS = {"epa": "EPA", "yds": "YDS", "td": "TD", "rate": "Y/A"}

# Fixed per metric — precision is a column property, not a per-cell choice.
PRECISION = {"epa": 3, "yds": 0, "td": 0, "rate": 1}

# The noun each position's qualifier threshold counts, stated verbatim on
# the leaders label. QB reads "games", not "starts" — `PlayerSeasonStat`
# has no `starts` column (see plan §"QB qualifier"). The threshold values
# themselves are NOT redeclared here — they're imported from
# `app.analytics.leaders`, the one place that actually applies them
# (`is_qualified`), so a changed threshold can't silently desync from the
# label describing it.
QUALIFIER_NOUN = {"QB": "games", "RB": "carries", "WR": "targets", "TE": "targets"}
QUALIFIER_THRESHOLD = QUALIFIER_THRESHOLD_BY_POSITION


def qualifier_label(position: str) -> str:
    return f"{position} {QUALIFIER_THRESHOLD[position]}+ {QUALIFIER_NOUN[position]}"
