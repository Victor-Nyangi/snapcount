"""Seeds the 32 NFL teams from the tracked app/data/teams.json file.

Team colour is design data, not a feed value — see app/models/team.py and
app/data/teams.json for why this is seeded from the repo rather than
ingested. This module is idempotent: re-running it never duplicates rows,
and it refreshes existing rows in place so a repo-file edit (e.g. a
rebrand) is picked up on the next seed run.
"""

import json
from pathlib import Path

from sqlmodel import Session, select

from app.models import Team

TEAMS_JSON_PATH = Path(__file__).resolve().parent.parent / "data" / "teams.json"


def seed_teams(session: Session, path: Path = TEAMS_JSON_PATH) -> None:
    """Load teams.json and upsert each row into the `team` table."""
    rows = json.loads(path.read_text())

    existing = {t.abbr: t for t in session.exec(select(Team)).all()}

    for row in rows:
        team = existing.get(row["abbr"])
        if team is None:
            session.add(Team(**row))
        else:
            for field, value in row.items():
                setattr(team, field, value)

    session.commit()
