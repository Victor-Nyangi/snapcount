from fastapi.testclient import TestClient

# Kirk Cousins — a real QB in the backfill with a full ten-season run
# (2016-2025), so `seasons` and `is_latest` have something real to prove.
_QB_ID = "00-0029604"


def test_player_page_returns_one_row_per_ingested_season(client: TestClient) -> None:
    body = client.get(f"/api/v1/players/{_QB_ID}").json()
    assert len(body["seasons"]) >= 1
    assert sum(s["is_latest"] for s in body["seasons"]) == 1
    assert body["player"]["position"] == "QB"
    assert body["player"]["team_color"].startswith("#")
    assert "season" in body["player"]["meta"]


def test_player_rate_cards_carry_their_own_precision_and_scale(
    client: TestClient,
) -> None:
    body = client.get(f"/api/v1/players/{_QB_ID}").json()
    cards = {c["key"]: c for c in body["rate_cards"]}
    assert set(cards) == {"epa", "yds", "td", "rate"}
    assert cards["epa"]["precision"] == 3
    assert cards["td"]["precision"] == 0
    assert cards["rate"]["precision"] == 1
    assert cards["epa"]["scale_max"] >= cards["epa"]["value"]
    assert cards["epa"]["delta"] == cards["epa"]["value"] - cards["epa"]["baseline"]


def test_unknown_player_returns_404(client: TestClient) -> None:
    assert client.get("/api/v1/players/00-9999999").status_code == 404


def test_players_list_populates_the_player_select(client: TestClient) -> None:
    body = client.get("/api/v1/players?season=2024&position=QB").json()
    assert len(body) > 0
    assert all(set(row) == {"id", "name", "team_abbr"} for row in body)
    assert any(row["id"] == _QB_ID for row in body)


def test_players_list_rejects_an_unsupported_position(client: TestClient) -> None:
    assert client.get("/api/v1/players?season=2024&position=OL").status_code == 422
