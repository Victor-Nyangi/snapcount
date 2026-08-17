from itertools import accumulate

from fastapi.testclient import TestClient

from tests.api.conftest import TEAM_SCHEDULE_SEASON


def test_team_page_returns_the_full_schedule_with_a_running_total(
    client: TestClient,
) -> None:
    body = client.get("/api/v1/teams/2024/DET").json()
    assert body["team"]["conference"] == "NFC"
    assert body["team"]["color"].startswith("#")
    assert len(body["schedule"]) == 17
    cumulative = [g["cumulative"] for g in body["schedule"]]
    margins = [g["margin"] for g in body["schedule"]]
    assert cumulative == list(accumulate(margins))


def test_team_page_depth_groups_are_structural_and_carry_no_names(
    client: TestClient,
) -> None:
    groups = client.get("/api/v1/teams/2024/DET").json()["depth_groups"]
    assert [g["group"] for g in groups] == [
        "QB",
        "RB",
        "WR",
        "TE",
        "OL",
        "DL",
        "LB",
        "DB",
    ]
    assert all(isinstance(s, str) for g in groups for s in g["slots"])


def test_team_page_stats_and_labels(client: TestClient) -> None:
    body = client.get("/api/v1/teams/2024/DET").json()
    assert body["record_label"] == "15-2"
    assert body["conference_label"] == "NFC North"
    stat_keys = [s["key"] for s in body["stats"]]
    assert stat_keys == [
        "points / game",
        "allowed / game",
        "differential / game",
        "power rank",
    ]
    power_rank = next(s["value"] for s in body["stats"] if s["key"] == "power rank")
    assert power_rank.startswith("#")


def test_unknown_team_returns_404(client: TestClient) -> None:
    assert client.get("/api/v1/teams/2024/XXX").status_code == 404


def test_unknown_season_returns_404(client: TestClient) -> None:
    assert client.get("/api/v1/teams/1899/DET").status_code == 404


def test_team_schedule_stops_at_the_last_played_game(
    client: TestClient,
    teams_partial_schedule: None,  # noqa: ARG001
) -> None:
    body = client.get(f"/api/v1/teams/{TEAM_SCHEDULE_SEASON}/LV").json()
    rows = body["schedule"]
    assert len(rows) == 2
    played, unplayed = rows
    assert played["margin"] == 7
    assert played["cumulative"] == 7
    assert played["result"] == "W"
    assert unplayed["margin"] is None
    assert unplayed["cumulative"] is None
    assert unplayed["result"] is None
    assert unplayed["score_label"] is None
