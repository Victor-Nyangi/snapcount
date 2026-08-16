from sqlmodel import Session, select

from app.ingest.players import ingest_players
from app.models import Player, PlayerSeasonStat

# A season far outside the real 2016-2025 backfill window, so these
# fabricated rows can never collide with a real nflverse game/player.
_SEASON = 2099


def _row(**overrides):
    base = {
        "player_id": "00-FAKE001",
        "player_name": "P.Fake",
        "player_display_name": "Pat Fakemann",
        "position": "QB",
        "team": "KC",
        "week": 1,
        "season": _SEASON,
        "season_type": "REG",
        "game_id": f"{_SEASON}_01_KC_BAL",
        "attempts": 0,
        "carries": 0,
        "targets": 0,
        "receptions": 0,
        "passing_yards": 0,
        "passing_tds": 0,
        "passing_epa": 0.0,
        "rushing_yards": 0,
        "rushing_tds": 0,
        "rushing_epa": 0.0,
        "receiving_yards": 0,
        "receiving_tds": 0,
        "receiving_epa": 0.0,
    }
    base.update(overrides)
    return base


class FakeSource:
    def schedules(self, season):
        return []

    def player_stats(self, season):
        return [
            # FAKE001: two regular-season weeks, one postseason week that
            # must NOT be folded into the season totals.
            _row(
                week=1,
                attempts=30,
                passing_yards=250,
                passing_tds=2,
                passing_epa=5.0,
                rushing_yards=10,
                rushing_epa=0.5,
            ),
            _row(
                week=2,
                attempts=28,
                passing_yards=300,
                passing_tds=3,
                passing_epa=6.0,
                rushing_yards=4,
                rushing_tds=1,
                rushing_epa=0.2,
                game_id=f"{_SEASON}_02_KC_DEN",
            ),
            _row(
                week=19,
                season_type="POST",
                attempts=999,
                passing_yards=9999,
                passing_tds=9,
                passing_epa=99.0,
                game_id=f"{_SEASON}_19_KC_XXX",
            ),
            # A team-total placeholder row with no player identity — must
            # be dropped, not crash the ingest.
            _row(
                player_id=None,
                player_name=None,
                player_display_name=None,
                position=None,
                week=1,
            ),
            # FAKE002: traded mid-season, DEN in week 1, BAL in week 2 — the
            # season-ending team (BAL) should win.
            _row(
                player_id="00-FAKE002",
                player_name="R.Fake",
                player_display_name="Rick Fakerson",
                position="WR",
                team="DEN",
                week=1,
                targets=5,
                receptions=3,
                receiving_yards=40,
                receiving_epa=1.0,
                game_id=f"{_SEASON}_01_DEN_LAC",
            ),
            _row(
                player_id="00-FAKE002",
                player_name="R.Fake",
                player_display_name="Rick Fakerson",
                position="WR",
                team="BAL",
                week=2,
                targets=7,
                receptions=5,
                receiving_yards=80,
                receiving_tds=1,
                receiving_epa=2.0,
                game_id=f"{_SEASON}_02_BAL_CIN",
            ),
        ]


def test_ingest_players_maps_the_feed_onto_player_and_season_stat(
    db: Session,
) -> None:
    ingest_players(db, _SEASON, FakeSource())
    player = db.get(Player, "00-FAKE001")
    assert player.name == "Pat Fakemann"
    assert player.position == "QB"
    assert player.team == "KC"


def test_weekly_rows_are_summed_to_season_totals_regular_season_only(
    db: Session,
) -> None:
    ingest_players(db, _SEASON, FakeSource())
    stat = db.get(PlayerSeasonStat, (_SEASON, "00-FAKE001"))
    assert stat.games == 2  # POST week excluded
    assert stat.attempts == 58  # 30 + 28, not +999
    assert stat.passing_yards == 550  # 250 + 300, not +9999
    assert stat.passing_tds == 5
    assert stat.passing_epa == 11.0
    assert stat.rushing_yards == 14
    assert stat.rushing_tds == 1


def test_rows_with_no_player_id_are_dropped(db: Session) -> None:
    ingest_players(db, _SEASON, FakeSource())
    assert len(db.exec(select(Player)).all()) == 2


def test_a_traded_player_is_credited_to_their_season_ending_team(
    db: Session,
) -> None:
    ingest_players(db, _SEASON, FakeSource())
    player = db.get(Player, "00-FAKE002")
    assert player.team == "BAL"
    stat = db.get(PlayerSeasonStat, (_SEASON, "00-FAKE002"))
    assert stat.team == "BAL"
    assert stat.games == 2
    assert stat.targets == 12
    assert stat.receiving_yards == 120


def test_ingest_players_is_idempotent(db: Session) -> None:
    ingest_players(db, _SEASON, FakeSource())
    ingest_players(db, _SEASON, FakeSource())
    assert len(db.exec(select(Player)).all()) == 2
    assert (
        len(
            db.exec(
                select(PlayerSeasonStat).where(PlayerSeasonStat.season == _SEASON)
            ).all()
        )
        == 2
    )


def test_seasons_played_counts_prior_ingested_seasons_for_the_player(
    db: Session,
) -> None:
    ingest_players(db, _SEASON, FakeSource())
    db.commit()
    first = db.get(PlayerSeasonStat, (_SEASON, "00-FAKE001"))
    assert first.seasons_played == 1

    next_season_source = FakeSource()

    def player_stats(season):
        return [
            _row(season=season, week=1, attempts=20, passing_yards=200)
        ]

    next_season_source.player_stats = player_stats  # type: ignore[method-assign]
    ingest_players(db, _SEASON + 1, next_season_source)
    second = db.get(PlayerSeasonStat, (_SEASON + 1, "00-FAKE001"))
    assert second.seasons_played == 2
