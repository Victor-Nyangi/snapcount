import pytest

from app.analytics.leaders import (
    SUPPORTED_METRICS,
    baseline,
    is_qualified,
    metric_value,
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
