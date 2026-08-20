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
    # THIRTEEN, not twelve, and that is the point of the limit now: Tony
    # Pollard and Rico Dowdle both ran for 1,079 yards in 2024 and land
    # either side of a Top-12 cut, so the board carries the tie rather than
    # picking one of two identical seasons. `limit` bounds the ranks shown,
    # not the row count.
    rows = body["rows"]
    assert len(rows) == 13
    assert max(r["rank"] for r in rows) == 12
    assert [r["value"] for r in rows if r["rank"] == 12] == [1079.0, 1079.0]
    # The assertion this test actually exists for: every row cleared the
    # 120-carry qualifier, so no unqualified back is on the board.
    assert all(r["secondary"]["value"] >= 0 for r in rows)


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
    # Names the season on the board, not a count of the seasons this
    # database holds for the player — see test_players.py for why the
    # ordinal could not be made truthful.
    assert row["player"]["meta"].startswith("2024 season · ")


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


def test_leaders_names_the_rate_unit_for_the_position_not_a_global_one(
    client: TestClient,
) -> None:
    """The rate metric is yards per ATTEMPT only for a quarterback.

    The design mockup keeps one global `UNITS` table with `rate: 'Y/A'`,
    which put "Y/A" as the largest label on a running back's leader card
    while the metric dropdown right above it read "Yards per carry". The
    unit and the label have to agree, and `METRIC_LABELS` is the one that
    was already right.
    """
    expected = {"QB": "Y/A", "RB": "Y/C", "WR": "Y/T", "TE": "Y/T"}
    for position, unit in expected.items():
        body = client.get(
            f"/api/v1/leaders/2024?position={position}&metric=rate&limit=1"
        ).json()
        assert body["unit"] == unit
        assert body["metric_label"].lower().startswith("yards per")

    # The other three units genuinely do not vary by position.
    for position in expected:
        for metric, unit in (("epa", "EPA"), ("yds", "YDS"), ("td", "TD")):
            body = client.get(
                f"/api/v1/leaders/2024?position={position}&metric={metric}&limit=1"
            ).json()
            assert body["unit"] == unit


# 2024 receiving touchdowns is the cleanest tie in the backfill: Brian
# Thomas Jr., Justin Jefferson and Tee Higgins all caught 10, and they
# straddle the Top-5 cutoff exactly.
_TIE_URL = "/api/v1/leaders/2024?position=WR&metric=td"


def test_tied_leaders_share_a_rank(client: TestClient) -> None:
    """Three players with 10 touchdowns are not 5th, 6th and 7th.

    Ranking was `enumerate(top, start=1)` — a position in a list, presented
    as a rank. The explorer already gets this right (two teams on +157 in
    2024 are both "Ranked #3 of 32"); the leaderboard disagreed with it.
    """
    rows = client.get(f"{_TIE_URL}&limit=8").json()["rows"]
    by_value: dict[float, set[int]] = {}
    for row in rows:
        by_value.setdefault(row["value"], set()).add(row["rank"])
    for value, ranks in by_value.items():
        assert len(ranks) == 1, f"{value} TDs was given ranks {sorted(ranks)}"

    tens = [r for r in rows if r["value"] == 10]
    assert len(tens) == 3
    # Chase 17, McLaurin 13, St. Brown 12, Evans 11 -> the tie is 5th.
    assert {r["rank"] for r in tens} == {5}
    # ...and the next player down resumes at 8, not 6: standard competition
    # ranking, the same convention the explorer's panel already uses.
    assert min(r["rank"] for r in rows if r["value"] == 9) == 8


def test_a_tie_at_the_cutoff_does_not_silently_drop_a_player(
    client: TestClient,
) -> None:
    """Top 5 must not show one player on 10 TDs and hide two others on 10.

    `qualified[:limit]` cut mid-tie, so `limit=5` returned Brian Thomas Jr.
    and dropped Justin Jefferson and Tee Higgins — identical seasons by the
    metric on screen. Whichever survived was decided by the order rows came
    back from an unordered SELECT.
    """
    rows = client.get(f"{_TIE_URL}&limit=5").json()["rows"]
    names = [r["player"]["name"] for r in rows]
    assert "Brian Thomas Jr." in names
    assert "Justin Jefferson" in names, "dropped a player on the same 10 TDs"
    assert "Tee Higgins" in names, "dropped a player on the same 10 TDs"
    # Seven rows for "Top 5" — the tie is carried, not truncated.
    assert len(rows) == 7
    # And nothing BELOW the tie leaks in.
    assert min(r["value"] for r in rows) == 10


def test_the_board_is_deterministic(client: TestClient) -> None:
    """The same URL must produce the same board.

    `qualified.sort()` is stable, so ties preserved the order of a
    `select()` with no `ORDER BY` — and Postgres does not promise one.
    """
    first = client.get(f"{_TIE_URL}&limit=8").json()["rows"]
    second = client.get(f"{_TIE_URL}&limit=8").json()["rows"]
    assert [r["player"]["id"] for r in first] == [r["player"]["id"] for r in second]
    # Within the tie the order is by name, which is at least a reason.
    tens = [r["player"]["name"] for r in first if r["value"] == 10]
    assert tens == sorted(tens)
