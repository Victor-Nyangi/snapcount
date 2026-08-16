from fastapi.testclient import TestClient

from tests.api.conftest import EXPLORER_MISSING_SEASON, EXPLORER_PRESENT_SEASON


def test_explorer_returns_32_rows_by_10_seasons(client: TestClient) -> None:
    body = client.get("/api/v1/explorer/differentials?from=2016&to=2025").json()
    assert len(body["seasons"]) == 10
    assert len(body["rows"]) == 32
    assert all(len(r["values"]) == 10 for r in body["rows"])
    assert body["domain"] == 150


def test_explorer_total_is_the_sum_of_present_seasons(client: TestClient) -> None:
    row = client.get("/api/v1/explorer/differentials?from=2016&to=2025").json()["rows"][
        0
    ]
    assert row["total"] == sum(v for v in row["values"] if v is not None)
    assert row["team"]["color"].startswith("#")


def test_explorer_returns_null_not_zero_for_a_missing_team_season(
    client: TestClient,
    explorer_partial_range: None,  # noqa: ARG001
) -> None:
    body = client.get(
        f"/api/v1/explorer/differentials?from={EXPLORER_PRESENT_SEASON}"
        f"&to={EXPLORER_MISSING_SEASON}"
    ).json()
    row = next(r for r in body["rows"] if r["team"]["abbr"] == "LV")
    # season 1 has a real, present, *zero* differential; season 2 has no
    # team-season row at all. They must not look the same.
    assert row["values"] == [0, None]
    assert row["values"][0] is not None
    assert row["values"][1] is None
    assert row["total"] == 0
