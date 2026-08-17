from app.analytics.trends import team_schedule
from tests.analytics.helpers import game, scheduled_game


def test_team_schedule_is_ordered_by_kickoff_and_marks_home_away():
    games = [
        game("DAL", 20, "DET", 24, week=3),
        game("DET", 10, "GB", 17, week=1),
        game("MIN", 14, "DET", 28, week=2),
    ]
    rows = team_schedule("DET", games)
    assert [r.week for r in rows] == sorted(r.week for r in rows)
    assert rows[0].is_home in (True, False)
    assert [r.is_home for r in rows] == [True, False, False]


def test_cumulative_differential_is_a_running_total_of_margins():
    # DET wins by 7, loses by 3, wins by 14
    games = [
        game("DET", 24, "OPP1", 17, week=1),  # DET home, +7
        game("OPP2", 20, "DET", 17, week=2),  # DET away, -3
        game("DET", 30, "OPP3", 16, week=3),  # DET home, +14
    ]
    rows = team_schedule("DET", games)
    assert [r.margin for r in rows] == [7, -3, 14]
    assert [r.cumulative for r in rows] == [7, 4, 18]


def test_margin_is_signed_from_the_subject_teams_perspective():
    # the same game read from either side flips sign
    shared_game = game("DET", 38, "GB", 34, week=1)
    det = team_schedule("DET", [shared_game])[0]
    gb = team_schedule("GB", [shared_game])[0]
    assert det.margin == 4 and gb.margin == -4


def test_unplayed_games_appear_in_the_schedule_with_no_margin():
    rows = team_schedule("SF", [scheduled_game("SF", "SEA")])
    assert rows[0].margin is None and rows[0].cumulative is None


def test_cumulative_stops_at_the_last_played_game_not_zero_padded():
    # an in-progress season must plot played games and stop, not plot
    # zeros out to week 18.
    games = [
        game("DET", 24, "OPP1", 17, week=1),  # +7
        scheduled_game("DET", "OPP2", week=2),
        scheduled_game("DET", "OPP3", week=3),
    ]
    rows = team_schedule("DET", games)
    assert [r.cumulative for r in rows] == [7, None, None]
