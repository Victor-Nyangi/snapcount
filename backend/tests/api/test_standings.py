from fastapi.testclient import TestClient


def test_standings_returns_32_rows_ranked_by_power_descending(
    client: TestClient,
) -> None:
    body = client.get("/api/v1/standings/2024").json()
    rows = body["rows"]
    assert len(rows) == 32
    assert [r["rank"] for r in rows] == list(range(1, 33))
    assert rows == sorted(rows, key=lambda r: -r["power"])
    assert body["formula_label"].startswith("0.55")


def test_standings_conference_filter_returns_16(client: TestClient) -> None:
    rows = client.get("/api/v1/standings/2024?conference=AFC").json()["rows"]
    assert len(rows) == 16
    assert {r["team"]["conference"] for r in rows} == {"AFC"}
    assert [r["rank"] for r in rows] == list(range(1, 17))


def test_standings_rejects_an_unknown_conference(client: TestClient) -> None:
    assert client.get("/api/v1/standings/2024?conference=XFL").status_code == 422


def test_standings_row_carries_server_formed_labels_and_null_safe_fields(
    client: TestClient,
) -> None:
    rows = client.get("/api/v1/standings/2024").json()["rows"]
    row = next(r for r in rows if r["team"]["abbr"] == "DET")
    assert row["record_label"] == f"{row['wins']}-{row['losses']}"
    assert row["differential"] == row["points_for"] - row["points_against"]
    assert row["team"]["color"].startswith("#")
    # playoff_seed is legitimately unknown for most teams — must stay null,
    # never coerced to 0.
    assert "playoff_seed" in row


def test_standings_unknown_season_returns_404(client: TestClient) -> None:
    assert client.get("/api/v1/standings/1899").status_code == 404
