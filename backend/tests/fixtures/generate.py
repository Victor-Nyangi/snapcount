"""Regenerates `backfill.json.gz` from the live backfilled database.

Run from `backend/`, against a database holding the real 2016-2025 ingest:

    uv run python -m tests.fixtures.generate

The output is committed. It only needs regenerating when a model in
`app.models` gains, drops or renames a column, or when the assertions in
`tests/api/` come to depend on data this slice does not carry — the loader
fails loudly on a schema mismatch rather than silently importing less.

What the slice holds, and why each part earns its place (see the docstring
of `tests/fixtures/__init__.py` for how it is loaded):

- `Season` 2016-2025 — `/meta/seasons` asserts at least ten, and every
  other table here FK-references `season.year`. Sentinel seasons are
  excluded: `SENTINEL_FLOOR` upward belongs to the tests' own fixtures, and
  2099 has leaked into the dev database before.
- `TeamSeasonStat` for all ten seasons (320 rows) — standings and the team
  page read 2024; the explorer grid reads the whole decade.
- `Game` for 2024 only (285 rows) — the week view reads 2024 week 15 and
  the team page reads DET's 17-game regular season. No test reads a game
  outside 2024, and carrying the other nine seasons would triple the file.
- `PlayerSeasonStat` for 2024, plus every season of the two players the
  tests name by id (`tests/api/test_players.py`) — leaders and the player
  page need a real qualified pool, and those two ids need their real
  careers: a ten-season QB and a kicker, the latter being the position
  whose page must 404 rather than 500.
- `Player` for exactly the ids the stat rows above reference.

`Team`, `Champion` and `DynastyRun` are deliberately absent: `seed_teams`
and `seed_history` already produce them deterministically from JSON in the
repo, so dumping them would be a second, drifting copy of data the loader
can just call the real seeders for.
"""

import gzip
import json
from pathlib import Path
from typing import Any

from sqlmodel import Session, col, select

from app.core.db import engine
from app.models import Game, Player, PlayerSeasonStat, Season, TeamSeasonStat

FIXTURE_PATH = Path(__file__).with_name("backfill.json.gz")

# The real backfill window. Kept explicit rather than "every season in the
# database" so a stray sentinel row can never widen the fixture.
FIRST_SEASON = 2016
LAST_SEASON = 2025

# Tests own 2081 upward for their own fixtures (tests/api/conftest.py,
# tests/ingest/conftest.py). Nothing at or above this may enter the slice.
SENTINEL_FLOOR = 2081

GAMES_SEASON = 2024

# Named by id in tests/api/test_players.py: Kirk Cousins (QB, ten seasons)
# and Phil Dawson (K, 2016-2018). Their full careers come along so the
# player page proves the same things in CI that it proves against the live
# database.
NAMED_PLAYER_IDS = ("00-0029604", "00-0004091")


def _rows(session: Session) -> dict[str, list[dict[str, Any]]]:
    seasons = session.exec(
        select(Season)
        .where(col(Season.year) >= FIRST_SEASON, col(Season.year) <= LAST_SEASON)
        .order_by(col(Season.year))
    ).all()
    assert all(s.year < SENTINEL_FLOOR for s in seasons)

    team_season_stats = session.exec(
        select(TeamSeasonStat)
        .where(
            col(TeamSeasonStat.season) >= FIRST_SEASON,
            col(TeamSeasonStat.season) <= LAST_SEASON,
        )
        .order_by(col(TeamSeasonStat.season), col(TeamSeasonStat.team))
    ).all()

    games = session.exec(
        select(Game).where(Game.season == GAMES_SEASON).order_by(col(Game.id))
    ).all()

    player_season_stats = session.exec(
        select(PlayerSeasonStat)
        .where(
            (col(PlayerSeasonStat.season) == GAMES_SEASON)
            | (col(PlayerSeasonStat.player_id).in_(NAMED_PLAYER_IDS)),
            col(PlayerSeasonStat.season) >= FIRST_SEASON,
            col(PlayerSeasonStat.season) <= LAST_SEASON,
        )
        .order_by(col(PlayerSeasonStat.season), col(PlayerSeasonStat.player_id))
    ).all()

    player_ids = sorted({s.player_id for s in player_season_stats})
    players = session.exec(
        select(Player).where(col(Player.id).in_(player_ids)).order_by(col(Player.id))
    ).all()
    missing = set(player_ids) - {p.id for p in players}
    assert not missing, f"stat rows reference unknown players: {sorted(missing)}"

    for player_id in NAMED_PLAYER_IDS:
        assert player_id in player_ids, f"{player_id} is not in the source database"

    # Insertion order — every table's foreign keys point only at tables
    # already listed above it (Team comes from `seed_teams`, not from here).
    return {
        "Season": [s.model_dump(mode="json") for s in seasons],
        "Game": [g.model_dump(mode="json") for g in games],
        "TeamSeasonStat": [t.model_dump(mode="json") for t in team_season_stats],
        "Player": [p.model_dump(mode="json") for p in players],
        "PlayerSeasonStat": [p.model_dump(mode="json") for p in player_season_stats],
    }


def main() -> None:
    with Session(engine) as session:
        tables = _rows(session)

    payload = {
        "window": [FIRST_SEASON, LAST_SEASON],
        "games_season": GAMES_SEASON,
        "tables": tables,
    }
    # mtime=0 and sorted keys so regenerating unchanged data produces a
    # byte-identical file instead of a spurious diff.
    with gzip.GzipFile(FIXTURE_PATH, "wb", mtime=0) as out:
        out.write(json.dumps(payload, sort_keys=True, indent=0).encode())

    counts = ", ".join(f"{name} {len(rows)}" for name, rows in tables.items())
    size_kb = FIXTURE_PATH.stat().st_size / 1024
    print(f"wrote {FIXTURE_PATH.name} ({size_kb:.0f} KB): {counts}")  # noqa: T201


if __name__ == "__main__":
    main()
