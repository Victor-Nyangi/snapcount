from fastapi.testclient import TestClient


def test_leaders_respects_the_limit_and_ranks_by_the_named_metric(
    client: TestClient,
) -> None:
    body = client.get("/api/v1/leaders/2024?position=QB&metric=epa&limit=5").json()
    assert len(body["rows"]) == 5
    assert [r["rank"] for r in body["rows"]] == [1, 2, 3, 4, 5]
    assert body["rows"] == sorted(body["rows"], key=lambda r: -r["value"])
    assert body["metric_label"] == "EPA per play"
    assert body["precision"] == 3
    assert body["unit"] == "EPA"


def test_leaders_excludes_unqualified_players_from_rows_and_baseline(
    client: TestClient,
) -> None:
    body = client.get("/api/v1/leaders/2024?position=RB&metric=yds&limit=12").json()
    assert body["qualifier_label"] == "RB 120+ carries"
    assert len(body["rows"]) == 12


def test_qb_qualifier_label_reads_games_not_starts(client: TestClient) -> None:
    body = client.get("/api/v1/leaders/2024?position=QB&metric=epa&limit=5").json()
    assert body["qualifier_label"] == "QB 14+ games"


def test_leader_row_carries_team_color_and_secondary_stat(
    client: TestClient,
) -> None:
    body = client.get("/api/v1/leaders/2024?position=QB&metric=yds&limit=5").json()
    row = body["rows"][0]
    assert row["player"]["team_color"].startswith("#")
    assert row["secondary"]["key"] == "TD"
    assert "season" in row["player"]["meta"]


def test_leaders_metric_and_position_reject_unknown_values(
    client: TestClient,
) -> None:
    assert client.get("/api/v1/leaders/2024?position=QB&metric=nope").status_code == 422
    assert client.get("/api/v1/leaders/2024?position=OL&metric=epa").status_code == 422


def test_leaders_precision_switches_with_the_metric(client: TestClient) -> None:
    epa = client.get("/api/v1/leaders/2024?position=QB&metric=epa").json()
    td = client.get("/api/v1/leaders/2024?position=QB&metric=td").json()
    rate = client.get("/api/v1/leaders/2024?position=QB&metric=rate").json()
    assert epa["precision"] == 3
    assert td["precision"] == 0
    assert rate["precision"] == 1
