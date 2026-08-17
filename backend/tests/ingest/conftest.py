"""Ingest-test-local fixture.

`db` (tests/conftest.py) is session-scoped and shared across the *entire*
backend test suite, with no rollback between tests — by design, since
seed_teams/seed_history's whole point is for their fixtures to persist.

Ingest's own mapper tests (test_players.py, and the aggregate-only tests in
test_runner.py) manufacture throwaway seasons/players that must NOT persist
that way: `ingest_games`, `ingest_players`, and `aggregate_team_seasons`
never call `session.commit()` themselves (that's `ingest_season`'s job), so
whatever *any later* test in the shared session commits — any
seed_teams/seed_history call, or the session fixture's own final commit —
durably writes these fake rows into the real dev database. Left unchecked,
they accumulate across separate `pytest` invocations.

Note there are two distinct hazards this package's tests guard against:
(1) fake data leaking between test runs (this fixture), and (2) a fake
fixture's *season number* colliding with the real 2016-2025 backfill this
same database holds — the reason every ingestion test fixture uses a
sentinel season (2099) instead of a real-range one; see test_games.py's
`_SEASON` comment for the incident that made that the rule. Player-table
count assertions additionally can't be scoped by season at all (Player has
no `season` column — it's a cross-season entity), so they filter by the
fixture's own known IDs instead of counting the whole table.

`isolated_db` wraps a test in a SAVEPOINT and rolls it back once the test
finishes, so its writes vanish regardless of what any later test commits.
It only works for code paths that never call `session.commit()` internally
— `ingest_season` does call commit() (that's the actual transaction
boundary it owns), so tests that call `ingest_season` directly clean up
with an explicit purge instead; see test_runner.py's `_purge_season`.
"""

from collections.abc import Generator

import pytest
from sqlmodel import Session


@pytest.fixture
def isolated_db(db: Session) -> Generator[Session]:
    nested = db.begin_nested()
    yield db
    nested.rollback()
