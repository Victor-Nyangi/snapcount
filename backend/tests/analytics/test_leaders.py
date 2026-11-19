import pytest

from app.analytics.leaders import (
    SUPPORTED_METRICS,
    SeasonProgress,
    baseline,
    is_qualified,
    metric_value,
    qualifier_threshold,
)
from app.models import PlayerSeasonStat


def stat_with(
    position: str,
    *,
    player_id="p1",
    team="BUF",
    games=17,
    seasons_played=1,
    **overrides,
):
    defaults = {
        "season": 2024,
        "player_id": player_id,
        "team": team,
        "position": position,
        "games": games,
        "seasons_played": seasons_played,
    }
    defaults.update(overrides)
    return PlayerSeasonStat(**defaults)


def test_metric_value_derives_per_play_epa_not_total():
    stat = stat_with("QB", attempts=600, passing_epa=120.6)
    assert metric_value(stat, "epa") == pytest.approx(0.201)


def test_metric_value_returns_zero_epa_when_a_player_has_no_attempts():
    stat = stat_with("QB", attempts=0, passing_epa=0.0)
    assert metric_value(stat, "epa") == 0.0


def test_metric_source_column_depends_on_position():
    # WR/TE read receiving_*, RB reads rushing_*, QB reads passing_*
    wr_stat = stat_with("WR", receiving_yards=1200)
    rb_stat = stat_with("RB", rushing_yards=1300)
    qb_stat = stat_with("QB", passing_yards=4000)
    assert metric_value(wr_stat, "yds") == wr_stat.receiving_yards
    assert metric_value(rb_stat, "yds") == rb_stat.rushing_yards
    assert metric_value(qb_stat, "yds") == qb_stat.passing_yards


def test_metric_value_reads_the_position_appropriate_touchdown_count():
    # proves the prefix switch works for "td" the same way it does for "yds"
    qb_stat = stat_with("QB", passing_tds=35)
    rb_stat = stat_with("RB", rushing_tds=12)
    wr_stat = stat_with("WR", receiving_tds=9)
    assert metric_value(qb_stat, "td") == qb_stat.passing_tds
    assert metric_value(rb_stat, "td") == rb_stat.rushing_tds
    assert metric_value(wr_stat, "td") == wr_stat.receiving_tds


def test_metric_value_derives_rate_as_yards_per_volume():
    # QB: yards/attempt, RB: yards/carry, WR/TE: yards/target
    qb_stat = stat_with("QB", attempts=500, passing_yards=4000)
    rb_stat = stat_with("RB", carries=250, rushing_yards=1250)
    wr_stat = stat_with("WR", targets=100, receiving_yards=1400)
    assert metric_value(qb_stat, "rate") == pytest.approx(8.0)
    assert metric_value(rb_stat, "rate") == pytest.approx(5.0)
    assert metric_value(wr_stat, "rate") == pytest.approx(14.0)


def test_metric_value_returns_zero_rate_when_a_player_has_no_volume():
    stat = stat_with("QB", attempts=0, passing_yards=0)
    assert metric_value(stat, "rate") == 0.0


def test_metric_value_raises_on_an_unknown_metric():
    with pytest.raises(ValueError, match="unknown metric"):
        metric_value(stat_with("QB"), "not-a-real-metric")


def test_supported_metrics_matches_the_frontend_enum():
    # keeps app.analytics.leaders from drifting from the frontend search
    # schema's z.enum(['epa', 'yds', 'td', 'rate'])
    assert SUPPORTED_METRICS == {"epa", "yds", "td", "rate"}


def test_baseline_is_the_mean_across_qualified_players_only():
    # an unqualified outlier must not drag the positional baseline
    qualified_a = stat_with(
        "RB", player_id="a", carries=200, rushing_epa=40.0
    )  # 0.2/play
    qualified_b = stat_with(
        "RB", player_id="b", carries=150, rushing_epa=45.0
    )  # 0.3/play
    unqualified_outlier = stat_with(
        "RB", player_id="c", carries=3, rushing_epa=15.0
    )  # 5.0/play, only 3 carries
    assert baseline(
        [qualified_a, qualified_b, unqualified_outlier], "epa"
    ) == pytest.approx(
        (metric_value(qualified_a, "epa") + metric_value(qualified_b, "epa")) / 2
    )


@pytest.mark.parametrize(
    ("position", "field", "value", "qualified"),
    [
        ("QB", "games", 14, True),
        ("QB", "games", 13, False),
        ("RB", "carries", 120, True),
        ("RB", "carries", 119, False),
        ("WR", "targets", 50, True),
        ("WR", "targets", 49, False),
        ("TE", "targets", 50, True),
        ("TE", "targets", 49, False),
    ],
)
def test_qualifier_thresholds_come_from_the_design(position, field, value, qualified):
    assert is_qualified(stat_with(position, **{field: value})) is qualified


# --- Pro-rated qualifiers -------------------------------------------------
#
# The thresholds above are FULL-SEASON numbers. Applied at week 10 of 18
# they emptied the 2026 QB board outright: nobody can have played 14 games
# in ten weeks. They now scale with the share of the regular season played.

MID_SEASON = SeasonProgress(weeks_played=10, weeks_total=18)


@pytest.mark.parametrize(
    ("position", "expected"),
    [
        # 14 x 10/18 = 7.8 -> 8; 120 x 10/18 = 66.7 -> 67; 50 x 10/18 = 27.8 -> 28.
        # Rounded UP: a fractional game cannot be played, and rounding down
        # would let a player in on less than the pro-rated share.
        ("QB", 8),
        ("RB", 67),
        ("WR", 28),
        ("TE", 28),
    ],
)
def test_mid_season_thresholds_scale_with_weeks_played(position, expected):
    assert qualifier_threshold(position, MID_SEASON) == expected


@pytest.mark.parametrize(
    "progress",
    [
        None,  # progress unknown (no schedule ingested): full season
        SeasonProgress(weeks_played=18, weeks_total=18),
        SeasonProgress(weeks_played=17, weeks_total=17),  # 2016-2020 seasons
    ],
)
def test_a_completed_season_keeps_the_full_season_thresholds(progress):
    assert {
        position: qualifier_threshold(position, progress)
        for position in ("QB", "RB", "WR", "TE")
    } == {"QB": 14, "RB": 120, "WR": 50, "TE": 50}


def test_thresholds_never_fall_to_zero_before_a_week_is_played():
    # Preseason: the schedule is in, nothing is final. Zero would qualify
    # every row in the table, which is a board of noise, not leaders.
    preseason = SeasonProgress(weeks_played=0, weeks_total=18)
    assert qualifier_threshold("QB", preseason) == 1
    assert qualifier_threshold("RB", preseason) == 1


def test_a_mid_season_qb_on_eight_games_qualifies_only_when_pro_rated():
    qb = stat_with("QB", games=8)
    assert is_qualified(qb, MID_SEASON) is True
    assert is_qualified(qb) is False  # the full-season 14 still applies


def test_the_baseline_pool_uses_the_same_pro_rated_qualifier():
    starter = stat_with("QB", player_id="a", games=9, attempts=300, passing_epa=30.0)
    backup = stat_with("QB", player_id="b", games=2, attempts=40, passing_epa=20.0)
    # Mid-season the starter is the whole pool; at full-season thresholds
    # there is no pool at all and the baseline is 0.0.
    assert baseline([starter, backup], "epa", MID_SEASON) == pytest.approx(0.1)
    assert baseline([starter, backup], "epa") == 0.0
