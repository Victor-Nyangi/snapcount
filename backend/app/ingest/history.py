"""Seeds Super Bowl champions and dynasty runs from the tracked
app/data/champions.json and app/data/dynasties.json files.

Both tables are settled history / editorial commentary, not feed data —
see app/models/stats.py (Champion, DynastyRun) — so they are seeded from
the repo rather than ingested. This module follows the same idempotency
pattern as app/ingest/teams.py: re-running it never duplicates rows, and
it refreshes existing rows in place so a repo-file edit is picked up on
the next seed run.

seed_teams(session) must run first: Champion.team and DynastyRun.team are
foreign keys into team.abbr.
"""

import json
from pathlib import Path

from sqlmodel import Session, select

from app.models import Champion, DynastyRun

CHAMPIONS_JSON_PATH = Path(__file__).resolve().parent.parent / "data" / "champions.json"
DYNASTIES_JSON_PATH = Path(__file__).resolve().parent.parent / "data" / "dynasties.json"


def seed_history(
    session: Session,
    champions_path: Path = CHAMPIONS_JSON_PATH,
    dynasties_path: Path = DYNASTIES_JSON_PATH,
) -> None:
    """Load champions.json and dynasties.json and upsert each row."""
    champion_rows = json.loads(champions_path.read_text())
    dynasty_rows = json.loads(dynasties_path.read_text())

    existing_champions = {c.season: c for c in session.exec(select(Champion)).all()}
    for row in champion_rows:
        champion = existing_champions.get(row["season"])
        if champion is None:
            session.add(Champion(**row))
        else:
            for field, value in row.items():
                setattr(champion, field, value)

    # DynastyRun's primary key is a surrogate `id`, not `team` — upsert on
    # `team` (the natural key: one run per franchise) so re-seeding
    # refreshes in place instead of inserting duplicates.
    existing_dynasties = {d.team: d for d in session.exec(select(DynastyRun)).all()}
    for row in dynasty_rows:
        dynasty = existing_dynasties.get(row["team"])
        if dynasty is None:
            session.add(DynastyRun(**row))
        else:
            for field, value in row.items():
                setattr(dynasty, field, value)

    session.commit()
