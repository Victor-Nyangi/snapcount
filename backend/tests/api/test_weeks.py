from fastapi.testclient import TestClient

from tests.api.conftest import FEATURED_SEASON, FUTURE_SEASON


def test_week_returns_every_game_with_both_teams_resolved(
    client: TestClient,
) -> None:
    r = client.get("/api/v1/weeks/2024/15")
    assert r.status_code == 200
    body = r.json()
    assert len(body["games"]) == 16
    game = body["games"][0]
    assert game["away"]["color"].startswith("#")
    assert game["home"]["nickname"]


def test_week_label_names_the_season_and_phase(client: TestClient) -> None:
    body = client.get("/api/v1/weeks/2024/15").json()
    assert body["label"] == "Week 15 · 2024 regular season"


def test_played_game_has_a_signed_margin_and_no_null_scores(
    client: TestClient,
) -> None:
    games = client.get("/api/v1/weeks/2024/15").json()["games"]
    game = next(g for g in games if g["status"] in ("final", "final_ot"))
    assert game["away"]["score"] is not None
    assert game["home"]["score"] is not None
    assert game["margin"] == game["home"]["score"] - game["away"]["score"]


def test_unplayed_games_return_null_scores_and_no_margin(
    client: TestClient,
    seeded_future: None,  # noqa: ARG001 — fixture used for setup/teardown only
) -> None:
    body = client.get(f"/api/v1/weeks/{FUTURE_SEASON}/1").json()
    game = body["games"][0]
    assert game["away"]["score"] is None
    assert game["home"]["score"] is None
    assert game["margin"] is None
    assert game["line_label"] is None


def test_unknown_week_returns_404_not_an_empty_list(client: TestClient) -> None:
    assert client.get("/api/v1/weeks/2024/99").status_code == 404


def test_featured_games_are_derived_not_editorial(client: TestClient) -> None:
    body = client.get("/api/v1/weeks/2024/15").json()
    assert len(body["featured"]) <= 2
    for featured in body["featured"]:
        assert featured["banner_color"].startswith("#")
        assert featured["stats"]
        assert "–" in featured["score_label"]


def test_featured_note_is_the_games_own_recap(
    client: TestClient,
    featured_with_recap: None,  # noqa: ARG001 — fixture used for setup/teardown only
) -> None:
    """`note` is `game.recap` (plan §2) — never prose composed by the route.
    Both featured games come back; only the one with a recap has a note."""
    featured = client.get(f"/api/v1/weeks/{FEATURED_SEASON}/1").json()["featured"]
    by_id = {f["game_id"]: f for f in featured}

    assert by_id[f"{FEATURED_SEASON}_01_KC_LV"]["note"] == (
        "Las Vegas fell short on a two-point try with nine seconds left."
    )
    assert by_id[f"{FEATURED_SEASON}_01_DEN_LAC"]["note"] is None


def test_featured_note_is_null_across_the_real_backfill(client: TestClient) -> None:
    """No feed writes `recap`, so every real featured card renders without a
    note today. Asserted so that a future ingest quietly inventing recaps
    shows up here rather than as surprise prose on the screen."""
    featured = client.get("/api/v1/weeks/2024/15").json()["featured"]
    assert featured
    assert all(f["note"] is None for f in featured)
