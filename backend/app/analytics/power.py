def power_score(
    *, wins: int, losses: int, points_for: int, points_against: int, sos: float
) -> float:
    """Composite power score, ported verbatim from the standings mockup.

    Stated on the Standings screen as
      0.55 x point differential per game + 0.30 x strength of schedule
      + 0.15 x win rate, scaled to 100.
    The scaling constants (2.6, 120, 62) spread each input across a comparable
    range around a base of 50. Every input is exposed as its own sortable
    column, so the score is never a black box.

    A team with zero games played (wins == losses == 0) has no rate to
    compute a differential or win-rate from, so it is pinned to the scale's
    midpoint rather than dividing by zero.
    """
    games = wins + losses
    if games == 0:
        return 50.0

    differential_per_game = (points_for - points_against) / games
    return round(
        50.0
        + 0.55 * (differential_per_game * 2.6)
        + 0.30 * ((sos - 0.5) * 120)
        + 0.15 * ((wins / games - 0.5) * 62),
        1,
    )
