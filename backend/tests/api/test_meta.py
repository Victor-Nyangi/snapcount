from fastapi.testclient import TestClient

from tests.api.conftest import FAILED_INGEST_SEASON, FRESH_SEASON, STALE_SEASON


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


def test_freshness_reports_final_for_a_recently_ingested_season(
    client: TestClient,
    fresh_season: None,  # noqa: ARG001 — fixture used for setup/teardown only
) -> None:
    body = client.get(f"/api/v1/meta/freshness?season={FRESH_SEASON}").json()
    assert body["status"] == "final"
    assert body["label"].startswith("Final")
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
    from datetime import UTC, datetime, timedelta

    body = client.get(f"/api/v1/meta/freshness?season={FAILED_INGEST_SEASON}").json()

    assert body["status"] == "stale"
    # Names the SUCCESS, two days back — not today's failed attempt.
    expected = (datetime.now(UTC) - timedelta(days=2)).strftime("%b %-d")
    assert expected in body["label"]
    assert datetime.now(UTC).strftime("%b %-d") not in body["label"]
