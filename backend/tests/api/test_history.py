from fastapi.testclient import TestClient


def test_history_counts_titles_and_orders_champions_newest_first(
    client: TestClient,
) -> None:
    body = client.get("/api/v1/history/champions").json()
    assert [c["season"] for c in body["champions"]] == sorted(
        (c["season"] for c in body["champions"]), reverse=True
    )
    assert len(body["champions"]) == 25
    assert body["most_titles"][0]["team"]["abbr"] == "NE"
    assert body["most_titles"][0]["count"] == 6
    assert len(body["most_titles"]) <= 6


def test_champion_rows_carry_team_color_and_result(client: TestClient) -> None:
    body = client.get("/api/v1/history/champions").json()
    row = body["champions"][0]
    assert row["team"]["color"].startswith("#")
    assert row["team"]["nickname"]
    assert row["result"]


def test_dynasties_are_present_and_carry_team_color(client: TestClient) -> None:
    body = client.get("/api/v1/history/champions").json()
    assert len(body["dynasties"]) == 4
    for dynasty in body["dynasties"]:
        assert dynasty["team"]["color"].startswith("#")
        assert dynasty["titles"] > 0
        assert dynasty["label"]
        assert dynasty["note"]
