from sqlmodel import Session, select

from app.ingest.games import ingest_games
from app.models import Game


class FakeSource:
    def schedules(self, season):
        return [
            {
                "game_id": "2025_15_CIN_BAL",
                "season": 2025,
                "week": 15,
                "game_type": "REG",
                "gameday": "2025-12-11",
                "gametime": "20:15",
                "away_team": "CIN",
                "home_team": "BAL",
                "away_score": 24,
                "home_score": 31,
                "spread_line": 3.5,
                "total_line": 47.5,
                "overtime": 0,
            },
            {
                "game_id": "2025_15_WAS_PHI",
                "season": 2025,
                "week": 15,
                "game_type": "REG",
                "gameday": "2025-12-14",
                "gametime": "13:00",
                "away_team": "WAS",
                "home_team": "PHI",
                "away_score": 27,
                "home_score": 30,
                "spread_line": 4.0,
                "total_line": 49.0,
                "overtime": 1,
            },
            {
                "game_id": "2025_16_KC_LV",
                "season": 2025,
                "week": 16,
                "game_type": "REG",
                "gameday": "2025-12-21",
                "gametime": "16:25",
                "away_team": "KC",
                "home_team": "LV",
                "away_score": None,
                "home_score": None,
                "spread_line": 10.5,
                "total_line": 44.0,
                "overtime": 0,
            },
        ]

    def player_stats(self, season):
        return []


def test_ingest_games_maps_the_feed_onto_the_model(db: Session) -> None:
    ingest_games(db, 2025, FakeSource())
    game = db.get(Game, "2025_15_CIN_BAL")
    assert game.away_team == "CIN" and game.home_team == "BAL"
    assert game.away_score == 24 and game.home_score == 31
    assert game.status == "final"


def test_overtime_games_get_the_final_ot_status(db: Session) -> None:
    ingest_games(db, 2025, FakeSource())
    assert db.get(Game, "2025_15_WAS_PHI").status == "final_ot"


def test_unplayed_games_stay_scheduled_with_null_scores(db: Session) -> None:
    ingest_games(db, 2025, FakeSource())
    game = db.get(Game, "2025_16_KC_LV")
    assert game.status == "scheduled"
    assert game.away_score is None and game.home_score is None
    assert game.spread_line == 10.5  # the line exists before the game does


def test_ingest_games_is_idempotent_and_updates_scores_in_place(db: Session) -> None:
    ingest_games(db, 2025, FakeSource())
    ingest_games(db, 2025, FakeSource())
    assert len(db.exec(select(Game)).all()) == 3


def test_ingest_preserves_an_editorial_recap_across_reruns(db: Session) -> None:
    ingest_games(db, 2025, FakeSource())
    game = db.get(Game, "2025_15_CIN_BAL")
    game.recap = "Baltimore controlled the second half."
    db.commit()
    ingest_games(db, 2025, FakeSource())
    assert (
        db.get(Game, "2025_15_CIN_BAL").recap == "Baltimore controlled the second half."
    )
