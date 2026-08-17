"""The seam between Snapcount and the nflverse feed (via the `nflreadpy`
library). Everything downstream of this module depends on the
`NflverseSource` Protocol, not on `nflreadpy` directly — swapping feeds, or
standing up a fake for tests, touches only this file.

--------------------------------------------------------------------------
Step 2 verification (2026-08-16, nflreadpy==0.1.5) — actual columns observed
by running the inspection snippet from the brief against real 2024 data:

  s = nflreadpy.load_schedules().filter(pl.col("season") == 2024)
  p = nflreadpy.load_player_stats(seasons=[2024])

schedules() columns (44 total), sorted:
  ['away_coach', 'away_moneyline', 'away_qb_id', 'away_qb_name',
   'away_rest', 'away_score', 'away_spread_odds', 'away_team', 'div_game',
   'espn', 'ftn', 'game_id', 'game_type', 'gameday', 'gametime', 'gsis',
   'home_coach', 'home_moneyline', 'home_qb_id', 'home_qb_name',
   'home_rest', 'home_score', 'home_spread_odds', 'home_team', 'location',
   'nfl_detail_id', 'old_game_id', 'over_odds', 'overtime', 'pff', 'pfr',
   'referee', 'result', 'roof', 'season', 'spread_line', 'stadium',
   'stadium_id', 'surface', 'temp', 'total', 'total_line', 'under_odds',
   'week', 'weekday', 'wind']

  All 12 names the brief assumed (game_id, season, week, game_type,
  gameday, gametime, away_team, home_team, away_score, home_score,
  spread_line, total_line, overtime) are present VERBATIM — no column
  renaming was needed. game_type values observed: {REG, WC, DIV, CON, SB},
  matching Game.game_type's comment exactly. overtime/away_score/home_score
  are polars Int32 (nullable) — None for unplayed games, exactly as the
  brief's FakeSource models it.

  What the brief did NOT anticipate: team-abbreviation VALUES, not column
  names, differ from our `Team.abbr` set for three franchises inside the
  2016-2025 backfill window. `load_schedules()` uses the abbreviation that
  was live at the time of the game:
    - Rams:     "LA"  for every season 2016-2025 (never "LAR")
    - Chargers: "SD"  in 2016 only, "LAC" 2017 onward
    - Raiders:  "OAK" 2016-2019, "LV" 2020 onward
  Our `Team.abbr` (seeded from app/data/teams.json) has no "LA", "SD", or
  "OAK" row — only LAR, LAC, LV. Inserting a Game with home_team="LA"
  would violate the FK to team.abbr. See ABBR_MAP below.

player_stats() columns (133 total) include every name the mapper needs:
  player_id, player_name, player_display_name, position, team, week,
  season, season_type, game_id, attempts, carries, targets, receptions,
  passing_yards, passing_tds, passing_epa, rushing_yards, rushing_tds,
  rushing_epa, receiving_yards, receiving_tds, receiving_epa.
  season_type is {"REG", "POST"} — filtered to "REG" only in players.py so
  PlayerSeasonStat matches the regular-season Game rows aggregate.py uses.

  Two things that were NOT obvious from the brief and would have caused
  silent defects if guessed:
    1. player_id (and position, player_name, team) is null on ~22 rows per
       season — these are team-total/placeholder rows with no individual
       player attached. players.py drops any row with player_id is None.
    2. `team` in player_stats is ALREADY normalized to the CURRENT
       franchise abbreviation for relocated teams (LAC, LV appear even in
       2016 rows) — unlike schedules(), which retains the abbreviation
       live at kickoff. Only "LA" (Rams) needs remapping in player_stats;
       applying the full ABBR_MAP to both sources is harmless (OAK/SD
       simply never appear there, so the map is a no-op for those keys).
--------------------------------------------------------------------------
"""

from __future__ import annotations

from typing import Any, Protocol

# Feed abbreviation -> Snapcount canonical Team.abbr. Discovered empirically
# (see the module docstring) by pulling every home_team/away_team/team value
# nflreadpy returns for seasons 2016-2025 and diffing against
# app/data/teams.json. Fix the mapping here, never pad the team table.
ABBR_MAP: dict[str, str] = {
    "LA": "LAR",  # Rams — feed always says "LA", our table says "LAR"
    "SD": "LAC",  # Chargers — San Diego through 2016, relocated 2017
    "OAK": "LV",  # Raiders — Oakland through 2019, relocated 2020
}


def _canonical_abbr(abbr: str | None) -> str | None:
    if abbr is None:
        return None
    return ABBR_MAP.get(abbr, abbr)


class NflverseSource(Protocol):
    """What `games.py`/`players.py` need from a feed. `NflreadpySource`
    implements this against the real `nflreadpy` library; tests implement
    it with a hand-written fake so no test in this package ever touches
    the network."""

    def schedules(self, season: int) -> list[dict[str, Any]]: ...

    def player_stats(self, season: int) -> list[dict[str, Any]]: ...


class NflreadpySource:
    """Adapts `nflreadpy` (Polars frames) to `NflverseSource` (plain
    dicts), and normalizes team abbreviations to Snapcount's canonical set
    via ABBR_MAP so nothing downstream needs to know the feed's historical
    abbreviations ever existed."""

    def schedules(self, season: int) -> list[dict[str, Any]]:
        import nflreadpy as nfl
        import polars as pl

        frame = nfl.load_schedules().filter(pl.col("season") == season)
        rows: list[dict[str, Any]] = frame.to_dicts()
        for row in rows:
            row["away_team"] = _canonical_abbr(row["away_team"])
            row["home_team"] = _canonical_abbr(row["home_team"])
        return rows

    def player_stats(self, season: int) -> list[dict[str, Any]]:
        import nflreadpy as nfl

        frame = nfl.load_player_stats(seasons=[season])
        rows: list[dict[str, Any]] = frame.to_dicts()
        for row in rows:
            row["team"] = _canonical_abbr(row["team"])
        return rows
