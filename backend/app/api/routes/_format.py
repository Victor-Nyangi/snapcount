"""Server-side display-label formatting shared by route modules.

Every value here is a straight format of a value already read from the
database — no analytic is recomputed. This is what keeps "the browser
formats, it does not calculate" true: `kickoff_label`, `line_label`,
`record_label`, and friends all come down fully formed so the client never
rebuilds a string from parts.
"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

_EASTERN = ZoneInfo("America/New_York")

_PHASE_LABELS = {
    "REG": "regular season",
    "WC": "wild card round",
    "DIV": "divisional round",
    "CON": "conference championship",
    "SB": "Super Bowl",
}


def phase_label(game_type: str) -> str:
    return _PHASE_LABELS.get(game_type, game_type.lower())


def kickoff_label(kickoff_at: datetime) -> str:
    """`"Thu 8:15p"` / `"Sun 1:00p"` — weekday + 12-hour clock in the
    league's own Eastern timezone, matching the design mockup's sample
    data verbatim (`resources/design-v2-seven-screens.html`)."""
    local = kickoff_at.astimezone(_EASTERN)
    hour12 = local.hour % 12 or 12
    period = "a" if local.hour < 12 else "p"
    return f"{local.strftime('%a')} {hour12}:{local.minute:02d}{period}"


def _trim_trailing_zero(magnitude: float) -> str:
    text = f"{magnitude:.1f}"
    if text.endswith(".0"):
        text = text[:-2]
    return text


def line_label(
    spread_line: float | None, *, home_abbr: str, away_abbr: str
) -> str | None:
    """`"BAL -3.5"` — the favored team's abbreviation and the closing
    margin. `spread_line` is home-relative (positive means home favored),
    matching the nflverse convention `Game.spread_line` is ingested under."""
    if spread_line is None:
        return None
    if spread_line == 0:
        return "PICK"
    favored = home_abbr if spread_line > 0 else away_abbr
    return f"{favored} -{_trim_trailing_zero(abs(spread_line))}"


def record_label(wins: int, losses: int, ties: int) -> str:
    """`"13-4"`, or `"13-4-1"` when a tie is on the books — the mockup's
    sample data never has a tie, but the real backfill can."""
    if ties:
        return f"{wins}-{losses}-{ties}"
    return f"{wins}-{losses}"


def score_label(away_score: int, home_score: int) -> str:
    """`"34–38"` (away first), en dash — matches the featured-card sample
    data (`resources/design-v2-seven-screens.html`'s `FEATURED` array)."""
    return f"{away_score}–{home_score}"
