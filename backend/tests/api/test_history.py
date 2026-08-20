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
    # SEVEN cards, not six: five franchises hold two titles and they all
    # sit on the sixth card's count, so the row carries the tie rather than
    # dropping Tampa Bay to alphabetical order. The limit bounds the counts
    # shown, not the card count.
    assert len(body["most_titles"]) == 7
    assert sorted({t["count"] for t in body["most_titles"]}) == [2, 3, 6]


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


def test_most_titles_does_not_drop_a_team_on_the_same_count(
    client: TestClient,
) -> None:
    """Five franchises have two championships; the row showed four of them.

    The cut was `[:6]` over a list sorted by (-count, abbr), so Tampa Bay
    lost its card to Pittsburgh on alphabetical order alone while holding
    exactly the same two titles. A row labelled "most titles" cannot omit a
    team with the same number as one it shows — the same defect the leader
    board had at its own cutoff.
    """
    body = client.get("/api/v1/history/champions").json()
    counts = {c["team"]["abbr"]: 0 for c in body["champions"]}
    for c in body["champions"]:
        counts[c["team"]["abbr"]] += 1

    shown = {t["team"]["abbr"]: t["count"] for t in body["most_titles"]}
    lowest = min(shown.values())
    # Everyone on the lowest count that made the row must be in the row.
    expected = {abbr for abbr, n in counts.items() if n >= lowest}
    assert set(shown) == expected

    # Concretely, on the seeded history: TB has two, like BAL/NYG/PHI/PIT.
    assert counts["TB"] == 2
    assert "TB" in shown
