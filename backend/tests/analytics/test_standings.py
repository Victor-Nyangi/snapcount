import pytest

from app.analytics.standings import derive_records, strength_of_schedule
from tests.analytics.helpers import (
    game,
    games_for,
    scheduled_game,
    seven_alternating_games_for,
)


def test_derive_records_counts_wins_losses_and_points():
    games = [
        game("BAL", 31, "CIN", 24),
        game("BUF", 34, "NYJ", 13),
        game("CIN", 20, "BUF", 27),
    ]
    records = derive_records(games)
    assert records["BUF"].wins == 2 and records["BUF"].losses == 0
    assert records["CIN"].wins == 0 and records["CIN"].losses == 2
    assert records["BUF"].points_for == 61 and records["BUF"].points_against == 33


def test_form_is_newest_last_and_capped_at_five():
    # seven games, alternating; the design renders the most recent at the right
    records = derive_records(seven_alternating_games_for("CHI"))
    assert len(records["CHI"].form) == 5
    assert records["CHI"].form == "LWLWL"


def test_streak_counts_only_the_current_run():
    records = derive_records(games_for("KC", results="LLWWWWW"))
    assert records["KC"].streak == "W5"


def test_ties_break_a_streak_and_count_separately():
    records = derive_records(games_for("NYG", results="WWT"))
    assert records["NYG"].ties == 1
    assert records["NYG"].streak == "T1"


def test_unplayed_games_are_ignored():
    records = derive_records([scheduled_game("SF", "SEA")])
    assert "SF" not in records or records["SF"].wins + records["SF"].losses == 0


def test_strength_of_schedule_is_mean_opponent_win_rate():
    # BUF played two opponents, one 3-1 and one 1-3 -> (0.75 + 0.25) / 2
    games = [
        game("BUF", 27, "NE", 20, week=1),  # BUF beats NE
        game("NE", 24, "AAA", 10, week=2),  # NE win
        game("NE", 30, "BBB", 14, week=3),  # NE win
        game("NE", 21, "CCC", 17, week=4),  # NE win
        # NE: 3-1 overall (one loss to BUF above)
        game("MIA", 20, "BUF", 27, week=1),  # BUF beats MIA
        game("MIA", 24, "DDD", 10, week=2),  # MIA win
        game("EEE", 28, "MIA", 14, week=3),  # MIA loses
        game("FFF", 31, "MIA", 20, week=4),  # MIA loses
        # MIA: 1-3 overall (one loss to BUF above)
    ]
    records = derive_records(games)
    assert records["NE"].wins == 3 and records["NE"].losses == 1
    assert records["MIA"].wins == 1 and records["MIA"].losses == 3
    assert strength_of_schedule("BUF", records) == pytest.approx(0.5)


def test_strength_of_schedule_counts_a_rival_played_twice_twice():
    # BUF plays NE (division rival, undefeated) twice and MIA (winless) once.
    # Counting each meeting -> (1.0 + 1.0 + 0.0) / 3 = 2/3.
    # Deduplicating opponents first would instead give (1.0 + 0.0) / 2 = 0.5.
    games = [
        game("NE", 24, "BUF", 10, week=1),  # NE beats BUF
        game("NE", 27, "BUF", 13, week=2),  # NE beats BUF again
        game("NE", 30, "AAA", 14, week=3),  # NE win
        game("NE", 21, "BBB", 17, week=4),  # NE win
        game("BUF", 24, "MIA", 10, week=5),  # BUF beats MIA
        game("DDD", 28, "MIA", 14, week=6),  # MIA loses again
    ]
    records = derive_records(games)
    assert records["NE"].wins == 4 and records["NE"].losses == 0
    assert records["MIA"].wins == 0 and records["MIA"].losses == 2
    assert records["BUF"].opponents == ["NE", "NE", "MIA"]
    assert strength_of_schedule("BUF", records) == pytest.approx(2 / 3)
