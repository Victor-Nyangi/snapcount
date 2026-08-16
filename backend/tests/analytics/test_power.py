import pytest

from app.analytics.power import power_score


@pytest.mark.parametrize(
    ("wins", "losses", "pf", "pa", "sos", "expected"),
    [
        (13, 4, 472, 341, 0.512, 63.9),  # BUF
        (13, 4, 481, 326, 0.492, 65.2),  # PHI — best in the league
        (3, 14, 262, 447, 0.527, 32.4),  # CLE — worst in the league
    ],
)
def test_power_score_matches_the_design_formula(wins, losses, pf, pa, sos, expected):
    assert power_score(
        wins=wins, losses=losses, points_for=pf, points_against=pa, sos=sos
    ) == pytest.approx(expected, abs=0.05)


def test_power_score_is_50_for_a_perfectly_average_team():
    # .500 record, zero differential, average schedule -> the scale's midpoint
    assert power_score(
        wins=8, losses=8, points_for=350, points_against=350, sos=0.5
    ) == pytest.approx(50.0)


def test_power_score_handles_a_team_with_no_games_played():
    assert (
        power_score(wins=0, losses=0, points_for=0, points_against=0, sos=0.5) == 50.0
    )
