"""Seed the end-to-end stack's database with the committed backfill slice.

The Playwright job builds its stack with `docker compose down -v` and
`prestart.sh`, which migrates an EMPTY volume and creates the superuser —
and nothing else. Every one of the seven screens therefore rendered its
empty state, and the whole browser suite quietly stopped testing the thing
it exists to test:

  * `keyboard.spec.ts`'s roving-tabindex check timed out for 30s waiting on
    a differential-grid cell, because the grid had no cells;
  * `a11y.spec.ts` never saw the card rail on the week screen, so the
    `scrollable-region-focusable` violation there shipped unnoticed;
  * it never saw a diverging `DiffCell` either, so the whole positive half
    of the diverging scale went unmeasured for contrast;
  * the freshness pill only ever appeared in its transient "Checking…"
    state, so its contrast failure was reported by RACE — four screens saw
    it and three did not, on the same run.

`backend/tests/conftest.py::_ensure_reference_data` already solved exactly
this problem for pytest. This is the same three steps for the browser
suite, run from the CI runner against the published `5434` port rather than
from inside the container, because the backend image deliberately ships
`app/` and `scripts/` but no `tests/`.

Safe to re-run: both seeders upsert and the slice loads only when there is
no `TeamSeasonStat` at all, so this is a no-op against a database that
already has a backfill.
"""

import logging

from sqlmodel import Session, select

from app.core.db import engine
from app.ingest.history import seed_history
from app.ingest.teams import seed_teams
from app.models import TeamSeasonStat
from tests.fixtures import load_backfill

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> None:
    with Session(engine) as session:
        seed_teams(session)
        seed_history(session)
        if session.exec(select(TeamSeasonStat).limit(1)).first() is None:
            load_backfill(session)
            session.commit()
            logger.info("Loaded the backfill slice")
        else:
            logger.info("Backfill already present; nothing to load")


if __name__ == "__main__":
    main()
