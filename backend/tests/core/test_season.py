"""`current_season()` must agree with `scripts/nightly-ingest.sh`.

The freshness pill decides "current season vs finished season" in Python;
the nightly job decides which season to ingest in shell. If the two drift,
the pill calls a season complete while the job is still ingesting it (or
the reverse). So the parity test below runs the script's OWN derivation
lines — with `date` stubbed — rather than restating its rule.
"""

import re
import subprocess
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.core.season import current_season

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "nightly-ingest.sh"


def _script_season(year: int, month: int) -> int:
    source = SCRIPT.read_text()
    match = re.search(r"^month=.*?^fi$", source, flags=re.MULTILINE | re.DOTALL)
    assert match, "nightly-ingest.sh no longer has a month=...fi season block"
    stub = (
        f'date() {{ case "$*" in *%m*) echo {month:02d};; '
        f"*%Y*) echo {year};; esac; }}\n"
    )
    out = subprocess.run(
        ["bash", "-c", f'{stub}{match.group(0)}\necho "$season"'],
        capture_output=True,
        text=True,
        check=True,
    )
    return int(out.stdout.strip())


@pytest.mark.parametrize("month", range(1, 13))
def test_matches_the_nightly_ingest_script_for_every_month(month: int) -> None:
    assert current_season(datetime(2026, month, 15, tzinfo=UTC)) == _script_season(
        2026, month
    )


@pytest.mark.parametrize(
    ("now", "expected"),
    [
        (datetime(2027, 1, 1, tzinfo=UTC), 2026),  # playoffs of the 2026 season
        (datetime(2027, 7, 31, 23, 59, tzinfo=UTC), 2026),
        (datetime(2027, 8, 1, 0, 0, tzinfo=UTC), 2027),  # rollover
        (datetime(2026, 12, 31, 23, 59, tzinfo=UTC), 2026),
    ],
)
def test_rolls_over_on_august_1st_utc(now: datetime, expected: int) -> None:
    assert current_season(now) == expected


def test_judges_the_date_in_utc_like_the_script() -> None:
    # 20:00 on Jul 31 at UTC-5 is already Aug 1 in UTC.
    now = datetime(2027, 7, 31, 20, 0, tzinfo=timezone(timedelta(hours=-5)))
    assert current_season(now) == 2027
