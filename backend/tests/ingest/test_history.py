from collections import Counter

from sqlmodel import Session, select

from app.ingest.history import seed_history
from app.ingest.teams import seed_teams
from app.models import Champion, DynastyRun, Team


def test_seed_history_loads_25_super_bowls_covering_2000_to_2024(db: Session) -> None:
    seed_teams(db)
    seed_history(db)
    champs = db.exec(select(Champion)).all()
    assert len(champs) == 25
    assert {c.season for c in champs} == set(range(2000, 2025))


def test_every_champion_resolves_to_a_current_team(db: Session) -> None:
    seed_teams(db)
    seed_history(db)
    abbrs = {t.abbr for t in db.exec(select(Team)).all()}
    assert all(c.team in abbrs for c in db.exec(select(Champion)).all())


def test_title_counts_match_the_known_record(db: Session) -> None:
    seed_teams(db)
    seed_history(db)
    counts = Counter(c.team for c in db.exec(select(Champion)).all())
    assert counts["NE"] == 6  # 2001, 2003, 2004, 2014, 2016, 2018
    assert counts["KC"] == 3  # 2019, 2022, 2023
    assert counts["PIT"] == 2 and counts["NYG"] == 2

    # Consistency check: every seeded DynastyRun.titles must agree with the
    # actual count of Champion rows for that team. A dynasty note and the
    # champions table are two independently-edited files; a typo in one
    # would otherwise go unnoticed until it's on screen.
    runs = db.exec(select(DynastyRun)).all()
    assert runs, "expected dynasty runs to be seeded"
    for run in runs:
        assert run.titles == counts[run.team], (
            f"DynastyRun.titles for {run.team} ({run.titles}) does not match "
            f"the Champion table count ({counts[run.team]})"
        )


def test_seed_history_is_idempotent(db: Session) -> None:
    seed_teams(db)
    seed_history(db)
    seed_history(db)
    assert len(db.exec(select(Champion)).all()) == 25
