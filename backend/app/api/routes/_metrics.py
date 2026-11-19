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

from sqlmodel import Session, col, func, select

from app.analytics.leaders import (
    QUALIFIER_THRESHOLD_BY_POSITION,
    SeasonProgress,
    qualifier_threshold,
)
from app.ingest.games import FINAL_STATUSES
from app.models import Game

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
    # No mockup for these two boards; worded to say what is counted.
    "DEF": {
        "tackles": "Total tackles",
        "sacks": "Sacks",
        "tfl": "Tackles for loss",
        "qb_hits": "QB hits",
        "interceptions": "Interceptions",
        "passes_defended": "Passes defended",
    },
    "ALL": {
        "td": "Scrimmage touchdowns",
        "yds": "Scrimmage yards",
    },
}

# position -> metric -> unit. The mockup keeps ONE global table here, with
# `rate: 'Y/A'` for every position — which is right only for a quarterback.
# A running back's rate metric is yards per CARRY and a receiver's is yards
# per TARGET, and `METRIC_LABELS` directly above already says exactly that.
# Serving the global version put "Y/A" as the biggest label on a leader card
# sitting directly under a dropdown reading "Yards per carry": the same
# lying-label defect already fixed once in `qualifier_label`. Only `rate`
# varies; the other three units are genuinely position-independent.
_RATE_UNIT = {"QB": "Y/A", "RB": "Y/C", "WR": "Y/T", "TE": "Y/T"}

UNITS: dict[str, dict[str, str]] = {
    position: {"epa": "EPA", "yds": "YDS", "td": "TD", "rate": rate_unit}
    for position, rate_unit in _RATE_UNIT.items()
} | {
    "DEF": {
        "tackles": "TKL",
        "sacks": "SCK",
        "tfl": "TFL",
        "qb_hits": "QBH",
        "interceptions": "INT",
        "passes_defended": "PD",
    },
    "ALL": {"td": "TD", "yds": "YDS"},
}

# Fixed per metric — precision is a column property, not a per-cell choice.
# Sacks are the one count with a decimal: a shared sack is half each.
PRECISION = {
    "epa": 3,
    "yds": 0,
    "td": 0,
    "rate": 1,
    "tackles": 0,
    "sacks": 1,
    "tfl": 0,
    "qb_hits": 0,
    "interceptions": 0,
    "passes_defended": 0,
}

# Said under the board when the label cannot say it alone. Keyed
# (board, metric); anything absent has no note.
NOTES: dict[tuple[str, str], str] = {
    ("ALL", "td"): (
        "Rushing plus receiving touchdowns, any position. "
        "Passing touchdowns are on the QB board."
    ),
    ("ALL", "yds"): "Rushing plus receiving yards, any position.",
    ("DEF", "tackles"): "Solo plus assisted tackles, as the league counts them.",
    ("DEF", "sacks"): "A shared sack counts half to each player.",
}

# The noun each position's qualifier threshold counts, stated verbatim on
# the leaders label. QB reads "games", not "starts" — `PlayerSeasonStat`
# has no `starts` column (see plan §"QB qualifier"). The threshold values
# themselves are NOT redeclared here — they're imported from
# `app.analytics.leaders`, the one place that actually applies them
# (`is_qualified`), so a changed threshold can't silently desync from the
# label describing it.
QUALIFIER_NOUN = {
    "QB": "games",
    "RB": "carries",
    "WR": "targets",
    "TE": "targets",
    "DEF": "tackles",
    "ALL": "carries + targets",
}
# How the qualifier label names a board. The positions name themselves;
# "DEF 20+ tackles" and "ALL 50+ carries + targets" read as codes.
_QUALIFIER_SUBJECT = {"DEF": "Defenders", "ALL": "Any position"}
QUALIFIER_THRESHOLD = QUALIFIER_THRESHOLD_BY_POSITION


def season_progress(session: Session, season: int) -> SeasonProgress | None:
    """How much of `season`'s regular season is final, read off its games.

    One grouped read: the last regular-season week on the schedule, and
    the last one with a final score. `None` when the season has no
    regular-season games at all — progress is then unknown, and
    `qualifier_threshold` keeps the full-season numbers rather than
    guessing. (The committed test slice carries games for 2024 only, so
    this is also what keeps every other fixture season on full thresholds.)
    """
    weeks_total, weeks_played = session.exec(
        select(
            func.max(col(Game.week)),
            func.max(col(Game.week)).filter(col(Game.status).in_(FINAL_STATUSES)),
        ).where(Game.season == season, Game.game_type == "REG")
    ).one()
    if weeks_total is None:
        return None
    return SeasonProgress(weeks_played=weeks_played or 0, weeks_total=weeks_total)


def qualifier_label(position: str, progress: SeasonProgress | None = None) -> str:
    """The qualifier the board actually applied, as the reader sees it.

    A completed season reads exactly as it always has ("QB 14+ games"). A
    season in progress names the pro-rated number AND where it came from —
    "QB 8+ games" alone would look like a typo for 14.
    """
    threshold = qualifier_threshold(position, progress)
    subject = _QUALIFIER_SUBJECT.get(position, position)
    label = f"{subject} {threshold}+ {QUALIFIER_NOUN[position]}"
    if progress is not None and not progress.complete:
        label += (
            f" · pro-rated to week {progress.weeks_played} of {progress.weeks_total}"
        )
    return label
