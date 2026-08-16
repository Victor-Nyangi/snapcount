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
they accumulate across separate `pytest` invocations and silently break
test_games.py's exact-count assertions (`len(db.exec(select(Game)).all())
== 3`) on the second and later runs, since that assertion counts the whole
table, not season-2025 rows specifically.

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
