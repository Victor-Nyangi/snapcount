from sqlmodel import Session, delete, select

from app.ingest.aggregate import aggregate_team_seasons
from app.ingest.games import ingest_games
from app.ingest.runner import _season_range, ingest_season, parse_args
from app.models import Game, IngestRun, PlayerSeasonStat, Season, TeamSeasonStat
from tests.ingest.test_games import _SEASON as _GAMES_FAKE_SEASON
from tests.ingest.test_games import FakeSource

# Seasons far outside the real 2016-2025 backfill window, so nothing here
# can ever collide with a real nflverse row.
_AGG_SEASON = 2098
_OK_SEASON = 2097
_FAIL_SEASON = 2096


class _AggFakeSource(FakeSource):
    """Same three fixtures as test_games.py's FakeSource, retargeted at a
    season no other test touches, with an empty player_stats (aggregate
    only needs Game rows)."""

    def schedules(self, season):
        # Rewrite every row's season/game_id onto _AGG_SEASON so this
        # fixture never collides with test_games.py's own sentinel rows.
        out = []
        for row in super().schedules(season):
            row = dict(row)
            row["season"] = _AGG_SEASON
            row["game_id"] = row["game_id"].replace(
                str(_GAMES_FAKE_SEASON), str(_AGG_SEASON)
            )
            out.append(row)
        return out


class _OkSource:
    """Unlike test_games.py's FakeSource (which hardcodes its sentinel
    season into every row regardless of the `season` argument — fine for
    its own single-season tests, but a duplicate-key trap if reused
    against a different season), this fixture echoes `season` into every
    row so it is safe to ingest under any season number."""

    def schedules(self, season):
        return [
            {
                "game_id": f"{season}_01_KC_BAL",
                "season": season,
                "week": 1,
                "game_type": "REG",
                "gameday": "2097-09-07",
                "gametime": "13:00",
                "away_team": "KC",
                "home_team": "BAL",
                "away_score": 24,
                "home_score": 17,
                "spread_line": 2.5,
                "total_line": 45.0,
                "overtime": 0,
            }
        ]

    def player_stats(self, season):
        return []


class _FailingPlayerStatsSource:
    """Valid schedules, but player_stats blows up — used to prove a
    mid-run failure rolls back everything from this ingest_season call,
    including the games that were inserted just before the failure."""

    def schedules(self, season):
        return [
            {
                "game_id": f"{season}_01_CIN_BAL",
                "season": season,
                "week": 1,
                "game_type": "REG",
                "gameday": "2096-09-07",
                "gametime": "13:00",
                "away_team": "CIN",
                "home_team": "BAL",
                "away_score": 20,
                "home_score": 17,
                "spread_line": 1.0,
                "total_line": 44.0,
                "overtime": 0,
            }
        ]

    def player_stats(self, season):
        raise RuntimeError("boom: the feed fell over")


def test_aggregate_team_seasons_derives_bal_record_from_played_games(
    isolated_db: Session,
) -> None:
    ingest_games(isolated_db, _AGG_SEASON, _AggFakeSource())
    aggregate_team_seasons(isolated_db, _AGG_SEASON)

    bal = isolated_db.get(TeamSeasonStat, (_AGG_SEASON, "BAL"))
    assert bal.wins == 1 and bal.losses == 0
    assert bal.form == "W"
    assert bal.streak == "W1"
    assert bal.points_for == 31 and bal.points_against == 24


def test_aggregate_team_seasons_is_a_pure_re_derivation(
    isolated_db: Session,
) -> None:
    ingest_games(isolated_db, _AGG_SEASON, _AggFakeSource())
    aggregate_team_seasons(isolated_db, _AGG_SEASON)
    aggregate_team_seasons(isolated_db, _AGG_SEASON)  # run twice - no duplicates

    rows = isolated_db.exec(
        select(TeamSeasonStat).where(TeamSeasonStat.season == _AGG_SEASON)
    ).all()
    teams = {r.team for r in rows}
    assert teams == {"CIN", "BAL", "WAS", "PHI", "KC", "LV"}
    bal = isolated_db.get(TeamSeasonStat, (_AGG_SEASON, "BAL"))
    assert bal.wins == 1  # unchanged by the second run


def _purge_season(session: Session, season: int) -> None:
    """`ingest_season` commits for real — that's its actual job, and the
    only correct behaviour for a production run. So unlike the
    non-committing calls above (safe to wrap in `isolated_db` and roll
    back), a test that calls `ingest_season` directly must clean up with
    an explicit delete instead, or its throwaway fake season lingers in
    the shared dev DB past this test."""
    session.exec(delete(Game).where(Game.season == season))
    session.exec(delete(PlayerSeasonStat).where(PlayerSeasonStat.season == season))
    session.exec(delete(TeamSeasonStat).where(TeamSeasonStat.season == season))
    session.exec(delete(IngestRun).where(IngestRun.season == season))
    session.exec(delete(Season).where(Season.year == season))
    session.commit()


def test_ingest_season_records_an_ok_run_and_stamps_season_freshness(
    db: Session,
) -> None:
    try:
        run = ingest_season(db, _OK_SEASON, _OkSource())
        assert run.status == "ok"
        assert run.rows > 0
        assert run.finished_at is not None

        season = db.get(Season, _OK_SEASON)
        assert season is not None
        assert season.last_ingested_at is not None

        stored = db.get(IngestRun, run.id)
        assert stored.status == "ok"
    finally:
        _purge_season(db, _OK_SEASON)


def test_ingest_season_failure_leaves_status_failed_and_no_partial_rows(
    db: Session,
) -> None:
    try:
        run = ingest_season(db, _FAIL_SEASON, _FailingPlayerStatsSource())

        assert run.status == "failed"
        assert "boom" in run.error

        games = db.exec(select(Game).where(Game.season == _FAIL_SEASON)).all()
        assert games == []  # the game inserted before the failure rolled back
    finally:
        _purge_season(db, _FAIL_SEASON)


def test_parse_args_reads_a_single_season() -> None:
    args = parse_args(["--season", "2024"])
    assert _season_range(args) == range(2024, 2025)


def test_parse_args_reads_a_from_to_range() -> None:
    args = parse_args(["--from", "2016", "--to", "2025"])
    assert _season_range(args) == range(2016, 2026)
