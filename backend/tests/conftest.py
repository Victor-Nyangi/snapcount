from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, delete, select

from app.core.config import settings
from app.core.db import engine, init_db
from app.ingest.history import seed_history
from app.ingest.teams import seed_teams
from app.main import app
from app.models import TeamSeasonStat, User
from tests.fixtures import load_backfill
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import get_superuser_token_headers


def _ensure_reference_data(session: Session) -> None:
    """Guarantee the data the suite reads but never creates.

    Almost everything below `tests/api/` reads real ingested rows, and the
    ingest tests insert `TeamSeasonStat`s whose `team` is a foreign key.
    On a developer's machine that data is already there from an earlier
    backfill, so the suite passed while establishing none of it; on CI,
    which migrates a database that `docker compose down -v` just emptied,
    the same suite lost 51 tests to missing teams and absent seasons.

    Establishing it here, once per session, is what keeps the two honest.
    All three steps are safe against a database that already has the data:
    the seeders upsert, and the backfill slice loads only when there is no
    team-season row at all — so this is a no-op against the dev database
    and the real fixture load in CI.
    """
    seed_teams(session)
    seed_history(session)
    if session.exec(select(TeamSeasonStat).limit(1)).first() is None:
        load_backfill(session)
        session.commit()


@pytest.fixture(scope="session", autouse=True)
def db() -> Generator[Session]:
    with Session(engine) as session:
        init_db(session)
        _ensure_reference_data(session)
        yield session
        statement = delete(User)
        session.execute(statement)
        session.commit()


@pytest.fixture(scope="module")
def client() -> Generator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def superuser_token_headers(client: TestClient) -> dict[str, str]:
    return get_superuser_token_headers(client)


@pytest.fixture(scope="module")
def normal_user_token_headers(client: TestClient, db: Session) -> dict[str, str]:
    return authentication_token_from_email(
        client=client, email=settings.EMAIL_TEST_USER, db=db
    )
