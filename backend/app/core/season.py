from datetime import UTC, datetime

# The month (1-12) the new NFL season's name takes over. An NFL season is
# named for the calendar year it starts in and runs from September into the
# February after, so January-July still belong to last year's season.
_SEASON_ROLLOVER_MONTH = 8


def current_season(now: datetime | None = None) -> int:
    """The NFL season in progress (or next up) at `now`, UTC by default.

    This is THE derivation in Python, and it must stay identical to
    `backend/scripts/nightly-ingest.sh`, which picks the season to ingest
    with the same rule in shell: `month < 8 → year - 1, else year`, on the
    UTC date. If one changes, change the other — otherwise the freshness
    pill and the nightly job disagree about which season is still moving.
    """
    now = now or datetime.now(UTC)
    now = now.astimezone(UTC) if now.tzinfo is not None else now
    return now.year - 1 if now.month < _SEASON_ROLLOVER_MONTH else now.year
