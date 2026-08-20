from fastapi.testclient import TestClient

# Kirk Cousins — a real QB in the backfill with a full ten-season run
# (2016-2025), so `seasons` and `is_latest` have something real to prove.
_QB_ID = "00-0029604"

# Phil Dawson — a real kicker in the backfill (position "K", 2016-2018
# seasons). PlayerSeasonStat holds every position, and `metric_value`
# (app.analytics.leaders) raises ValueError for anything outside
# QB/RB/WR/TE. This is a REAL id from the live database, not a fixture —
# proving the production path a fixture-only test (Kirk Cousins alone)
# would not catch.
_KICKER_ID = "00-0004091"


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
    # Exactly three — epa, rate, td — matching the design mockup's own
    # `rateCards` list verbatim. `yds` is deliberately excluded: a raw
    # volume stat compared against a positional baseline mostly restates
    # games played, and the design's 3-card grid is sized for three.
    # Asserting the set (not just the count) so a future swap of one key
    # for another doesn't slip through unnoticed.
    assert set(cards) == {"epa", "rate", "td"}
    assert cards["epa"]["precision"] == 3
    assert cards["td"]["precision"] == 0
    assert cards["rate"]["precision"] == 1
    assert cards["epa"]["scale_max"] >= cards["epa"]["value"]
    assert cards["epa"]["delta"] == cards["epa"]["value"] - cards["epa"]["baseline"]


def test_unknown_player_returns_404(client: TestClient) -> None:
    assert client.get("/api/v1/players/00-9999999").status_code == 404


def test_non_skill_position_player_returns_404_not_500(client: TestClient) -> None:
    """The player page has no design for K/P/OL/DL/LB/DB/etc. — its rate
    cards are defined in terms of passing/rushing/receiving volume, which
    a kicker has none of. `metric_value` raises ValueError for anything
    outside QB/RB/WR/TE; that must be gated into an honest 404 on the page
    resource, not surface as an unhandled 500."""
    r = client.get(f"/api/v1/players/{_KICKER_ID}")
    assert r.status_code == 404
    detail = r.json()["detail"]
    assert "'K'" in detail
    assert "QB, RB, WR and TE" in detail


def test_players_list_populates_the_player_select(client: TestClient) -> None:
    body = client.get("/api/v1/players?season=2024&position=QB").json()
    assert len(body) > 0
    assert all(set(row) == {"id", "name", "team_abbr"} for row in body)
    assert any(row["id"] == _QB_ID for row in body)


def test_players_list_rejects_an_unsupported_position(client: TestClient) -> None:
    assert client.get("/api/v1/players?season=2024&position=OL").status_code == 422


# Kirk Cousins changed teams twice inside the backfill — WAS 2016-17,
# MIN 2018-23, ATL 2024-25 — with a different games count and a different
# `seasons_played` ordinal every year. That makes him the one player who
# can prove the page is reading the season it was ASKED for rather than
# the last one it has.
def test_player_page_honours_the_requested_season(client: TestClient) -> None:
    """The page is season-scoped, like the picker above it.

    Without this the whole page was built from `stats[-1]`, so a 2024 URL
    rendered Aaron Rodgers on Pittsburgh (his 2025 team) while the
    season-scoped player dropdown beside it read NYJ — the header
    contradicting the label next to it.
    """
    body = client.get(f"/api/v1/players/{_QB_ID}?season=2018").json()
    player = body["player"]
    assert player["team_abbr"] == "MIN"
    assert player["position"] == "QB"
    # The full meta line, not a substring search: this is the string the
    # header renders, and every field in it comes from the focused season.
    #
    # The season YEAR, not an ordinal. This read "3rd season" until the
    # backfill window was recognised as not being a career: Cousins
    # debuted in 2012, so 2018 was his SEVENTH NFL season and "3rd" only
    # ever counted the seasons this database happens to hold. Nothing
    # stores a rookie year, so the ordinal could not be corrected - only
    # replaced by something true.
    assert player["meta"] == "2018 season · 16 g · QB · Minnesota Vikings"


def test_player_meta_names_the_season_it_is_showing(client: TestClient) -> None:
    """The same player, two seasons, two labels — and each names its own.

    The ordinal this replaced moved too (3rd, then 4th), so a test pinning
    one season could not tell "counts backfilled seasons" from "names the
    season". Two seasons apart can.
    """
    y2018 = client.get(f"/api/v1/players/{_QB_ID}?season=2018").json()
    y2021 = client.get(f"/api/v1/players/{_QB_ID}?season=2021").json()

    assert y2018["player"]["meta"].startswith("2018 season · ")
    assert y2021["player"]["meta"].startswith("2021 season · ")


def test_player_page_rate_cards_come_from_the_requested_season(
    client: TestClient,
) -> None:
    """The cards are the headline numbers; they must match the header.

    Asserted against the page's OWN season row for 2018 rather than a
    hard-coded float, so the test states the invariant — card == that
    season — instead of restating a number the fixture happens to hold.
    """
    body = client.get(f"/api/v1/players/{_QB_ID}?season=2018").json()
    row_2018 = next(s for s in body["seasons"] if s["season"] == 2018)
    cards = {c["key"]: c for c in body["rate_cards"]}
    assert cards["epa"]["value"] == row_2018["epa"]
    assert cards["rate"]["value"] == row_2018["rate"]
    assert cards["td"]["value"] == row_2018["tds"]


def test_player_page_without_a_season_uses_the_latest(client: TestClient) -> None:
    """`season` is optional, and omitting it keeps the pre-existing
    behaviour — the player's most recent ingested season."""
    body = client.get(f"/api/v1/players/{_QB_ID}").json()
    assert body["player"]["team_abbr"] == "ATL"
    assert body["player"]["meta"] == "2025 season · 10 g · QB · Atlanta Falcons"


def test_player_page_falls_back_when_the_player_has_no_row_that_season(
    client: TestClient,
) -> None:
    """A season the player never played is NOT a 404.

    `player.$playerId.tsx` says so explicitly: "a real player who simply
    did not qualify that season is absent from the list while still having
    a perfectly good page — a deep link to either would be silently thrown
    away." So an out-of-career season falls back to the latest season the
    player does have, rather than erroring the page out from under a link.
    """
    r = client.get(f"/api/v1/players/{_QB_ID}?season=2081")
    assert r.status_code == 200
    assert r.json()["player"]["team_abbr"] == "ATL"


def test_rate_card_scale_is_set_by_qualified_play_not_a_four_game_backup(
    client: TestClient,
) -> None:
    """The bar has to be readable, and an unfiltered max makes it useless.

    `scale_max` was `max(...)` over EVERY player at the position, so a
    one-target receiver or a four-game backup set the scale for the whole
    league. Measured on 2024 before the fix: the best QUALIFIED receiver in
    the league by EPA filled 9.6% of his bar, because the max was Tyrell
    Shavers' 7.09 EPA on a single target; Aaron Rodgers' EPA bar filled
    0.8% against Nick Mullens' 2.43 over four games.

    The original comment gave the reason for the unfiltered max — "so the
    bar's own player can never exceed its own scale" — and that still
    holds: the scale is the qualified maximum OR this player's own value,
    whichever is larger.
    """
    body = client.get(f"/api/v1/players/{_QB_ID}?season=2024").json()
    cards = {c["key"]: c for c in body["rate_cards"]}

    # Kirk Cousins threw for 3,508 yards on 425 attempts in 2024 — a real
    # qualified season, so its EPA bar should be a readable fraction of the
    # scale rather than a sliver next to a backup's four-game rate.
    epa = cards["epa"]
    assert epa["scale_max"] < 1.0, (
        f"scale_max {epa['scale_max']} is an unqualified outlier, not a "
        "qualified maximum"
    )
    # The invariant the original comment was protecting must still hold.
    for card in cards.values():
        assert card["scale_max"] >= card["value"]


def test_rate_card_scale_still_covers_an_unqualified_player_s_own_value(
    client: TestClient,
) -> None:
    """The guarantee the unfiltered max existed for, kept.

    A player who did not qualify can out-rate every qualified player — that
    is exactly how the outliers above arise — so their own page must still
    scale to them rather than clipping their bar past 100%.
    """
    # Nick Mullens, 2024: four games, and the highest QB EPA per play in
    # the league precisely because the sample is tiny.
    roster = client.get("/api/v1/players?season=2024&position=QB").json()
    mullens = next(p for p in roster if p["name"] == "Nick Mullens")
    body = client.get(f"/api/v1/players/{mullens['id']}?season=2024").json()
    epa = next(c for c in body["rate_cards"] if c["key"] == "epa")
    assert epa["scale_max"] >= epa["value"]
