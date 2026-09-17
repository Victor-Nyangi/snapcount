from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, delete

from app.models import IngestRun, Season
from tests.api.conftest import (
    FAILED_INGEST_SEASON,
    FRESH_SEASON,
    FUTURE_SEASON,
    STALE_SEASON,
)

# Free sentinel (2081-2089 are taken by conftest; ingest owns 2095-2099).
LIVE_INGEST_SEASON = 2090


def test_seasons_lists_every_ingested_season(client: TestClient) -> None:
    r = client.get("/api/v1/meta/seasons")
    assert r.status_code == 200
    body = r.json()
    assert len(body) >= 10
    years = {row["year"] for row in body}
    assert 2024 in years
    row_2024 = next(row for row in body if row["year"] == 2024)
    assert row_2024["week_count"] == 18
    assert isinstance(row_2024["current_week"], int)
    assert row_2024["last_ingested_at"] is not None


def test_freshness_reports_fresh_for_a_recently_ingested_season(
    client: TestClient,
    fresh_season: None,  # noqa: ARG001 — fixture used for setup/teardown only
) -> None:
    body = client.get(f"/api/v1/meta/freshness?season={FRESH_SEASON}").json()
    assert body["status"] == "fresh"
    assert body["label"].startswith("Up to date")
    assert body["last_ingested_at"] is not None


def test_freshness_reports_stale_when_ingestion_is_over_a_day_old(
    client: TestClient,
    stale_season: None,  # noqa: ARG001 — fixture used for setup/teardown only
) -> None:
    body = client.get(f"/api/v1/meta/freshness?season={STALE_SEASON}").json()
    assert body["status"] == "stale"
    assert body["label"].startswith("Stale")


def test_freshness_unknown_season_returns_404(client: TestClient) -> None:
    assert client.get("/api/v1/meta/freshness?season=1899").status_code == 404


def test_a_failed_run_leaves_the_pill_stale_and_names_the_last_SUCCESS(
    client: TestClient,
    season_with_a_failed_ingest: None,  # noqa: ARG001 — setup/teardown only
) -> None:
    """Task 6.3 Step 3.

    A failed ingest must not advance the freshness clock. `last_ingested_at`
    is stamped only when a run closes `ok`, so a season whose newest run
    failed still reports the timestamp of the last good one — and because
    that success was two days ago, the pill reads `stale` rather than
    claiming the data is current on the strength of an attempt that did not
    work.

    The failure mode this guards against is the obvious refactor: stamping
    the season at the START of a run, or in a `finally`, which would make a
    broken nightly job look like a healthy one.
    """
    body = client.get(f"/api/v1/meta/freshness?season={FAILED_INGEST_SEASON}").json()

    assert body["status"] == "stale"
    # Names the SUCCESS, two days back — not today's failed attempt.
    expected = (datetime.now(UTC) - timedelta(days=2)).strftime("%b %-d")
    assert expected in body["label"]
    assert datetime.now(UTC).strftime("%b %-d") not in body["label"]


def test_seasons_report_the_last_week_that_actually_has_games(
    client: TestClient,
) -> None:
    """`max_week` is what the week selector can offer, and it is DERIVED.

    `Season.week_count` is a stored constant — 18 for every season ever
    ingested — while the games run to week 21 (2016-2020) and week 22
    (2021-) because the playoffs are weeks too. A selector built on
    `week_count` therefore hides every postseason week, the Super Bowl
    included, which is exactly what shipped: `WEEK_OPTIONS` was
    `Array.from({length: 18})` and `/week?season=2024&week=22` rendered
    "Week 22 · 2024 Super Bowl" underneath a blank Week control.
    """
    rows = {r["year"]: r for r in client.get("/api/v1/meta/seasons").json()}
    assert 2024 in rows, "the committed backfill slice should carry 2024"
    row = rows[2024]
    # 18 regular-season weeks + wild card, divisional, conference, Super Bowl.
    assert row["max_week"] == 22
    assert row["current_week"] == 18
    # And the stored constant it replaces is still wrong, which is the point.
    assert row["week_count"] == 18


# --- VIC-137: the label reflects the season's state, not only ingest age ---
#
# Sentinel seasons sit in 2081-2090, all "in the future" relative to the real
# calendar, so these tests pin `current_season` rather than depending on
# today's date. It is patched where the route looks it up.

_CURRENT_SEASON = "app.api.routes.meta.current_season"


@pytest.fixture
def live_ingest_season(db: Session) -> Generator[None]:
    """A season with data from two days ago AND an ingest running now."""
    started = datetime.now(UTC)
    db.add(
        Season(
            year=LIVE_INGEST_SEASON,
            current_week=1,
            week_count=18,
            last_ingested_at=started - timedelta(days=2),
        )
    )
    db.add(
        IngestRun(
            source="nflreadpy",
            season=LIVE_INGEST_SEASON,
            started_at=started,
            status="running",
        )
    )
    db.commit()
    try:
        yield
    finally:
        db.exec(delete(IngestRun).where(IngestRun.season == LIVE_INGEST_SEASON))
        db.commit()
        db.exec(delete(Season).where(Season.year == LIVE_INGEST_SEASON))
        db.commit()


def test_current_season_with_recent_data_is_fresh(
    client: TestClient,
    fresh_season: None,  # noqa: ARG001 — setup/teardown only
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(_CURRENT_SEASON, lambda: FRESH_SEASON)
    body = client.get(f"/api/v1/meta/freshness?season={FRESH_SEASON}").json()
    assert body["status"] == "fresh"
    today = datetime.now(UTC).strftime("%b %-d")
    assert body["label"] == f"Up to date · {today}"


def test_current_season_with_old_data_is_stale(
    client: TestClient,
    stale_season: None,  # noqa: ARG001 — setup/teardown only
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(_CURRENT_SEASON, lambda: STALE_SEASON)
    body = client.get(f"/api/v1/meta/freshness?season={STALE_SEASON}").json()
    assert body["status"] == "stale"
    updated = (datetime.now(UTC) - timedelta(days=2)).strftime("%b %-d")
    assert body["label"] == f"Stale · updated {updated}"


def test_a_running_ingest_is_live(
    client: TestClient,
    live_ingest_season: None,  # noqa: ARG001 — setup/teardown only
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(_CURRENT_SEASON, lambda: LIVE_INGEST_SEASON)
    body = client.get(f"/api/v1/meta/freshness?season={LIVE_INGEST_SEASON}").json()
    assert body["status"] == "live"
    assert body["label"] == "Live · updating"


def test_a_past_season_with_data_is_complete_and_never_stale(
    client: TestClient,
    stale_season: None,  # noqa: ARG001 — setup/teardown only
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Two-day-old data would read "stale" for the current season; for a
    # finished one it must not.
    monkeypatch.setattr(_CURRENT_SEASON, lambda: STALE_SEASON + 1)
    body = client.get(f"/api/v1/meta/freshness?season={STALE_SEASON}").json()
    assert body["status"] == "complete"
    assert body["label"] == "Season complete"
    assert body["last_ingested_at"] is not None


def test_the_real_2024_backfill_reads_complete(client: TestClient) -> None:
    # Read-only against the committed backfill, and unpatched: 2024 is behind
    # the real current season on any date this code will run.
    body = client.get("/api/v1/meta/freshness?season=2024").json()
    assert body["status"] == "complete"
    assert body["label"] == "Season complete"


def test_a_past_season_with_no_data_says_so(
    client: TestClient,
    seeded_future: None,  # noqa: ARG001 — setup/teardown only
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(_CURRENT_SEASON, lambda: FUTURE_SEASON + 1)
    body = client.get(f"/api/v1/meta/freshness?season={FUTURE_SEASON}").json()
    assert body["status"] == "stale"
    assert body["label"] == "No data ingested yet"
    assert body["last_ingested_at"] is None


@pytest.mark.parametrize("season_fixture", ["fresh_season", "stale_season"])
def test_a_season_after_the_current_one_is_judged_like_the_current_one(
    client: TestClient,
    season_fixture: str,
    request: pytest.FixtureRequest,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request.getfixturevalue(season_fixture)
    year = FRESH_SEASON if season_fixture == "fresh_season" else STALE_SEASON
    monkeypatch.setattr(_CURRENT_SEASON, lambda: year - 1)
    body = client.get(f"/api/v1/meta/freshness?season={year}").json()
    # Never "complete" — it has not happened yet.
    assert body["status"] == ("fresh" if season_fixture == "fresh_season" else "stale")
