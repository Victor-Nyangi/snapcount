from collections import Counter

from sqlmodel import Session, select

from app.ingest.teams import seed_teams
from app.models import Team


def test_seed_teams_loads_all_32_with_valid_colors(db: Session) -> None:
    seed_teams(db)
    teams = db.exec(select(Team)).all()
    assert len(teams) == 32
    assert {t.conference for t in teams} == {"AFC", "NFC"}
    assert all(len(t.color) == 7 and t.color.startswith("#") for t in teams)
    # four divisions of four in each conference
    afc = [t for t in teams if t.conference == "AFC"]
    assert sorted(Counter(t.division for t in afc).values()) == [4, 4, 4, 4]


def test_seed_teams_is_idempotent(db: Session) -> None:
    seed_teams(db)
    seed_teams(db)
    assert len(db.exec(select(Team)).all()) == 32
