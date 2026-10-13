"""API docs are a development tool, not part of the public site.

Production served Swagger UI at /docs, ReDoc at /redoc and the schema at
/api/v1/openapi.json: FastAPI-branded pages on snapcount.nyangi.dev that no
visitor and no part of the frontend needs. They mount only when
`FASTAPI_ENV` is "development".

The suite itself always runs with FASTAPI_ENV=development (scripts/test.sh,
and CI's .env), so the already-imported `app.main.app` can only ever show the
development half. Each test therefore builds a fresh copy of `app/main.py`
under the environment it is about, which makes the production half testable
in CI too.
"""

import importlib.util
from types import ModuleType

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.main
from app.core.config import settings

_OPENAPI_PATH = f"{settings.API_V1_STR}/openapi.json"
_DOCS_PATHS = ("/docs", "/redoc", _OPENAPI_PATH)


def _main_under(monkeypatch: pytest.MonkeyPatch, fastapi_env: str | None) -> ModuleType:
    """Execute app/main.py afresh, as a separate module, under `fastapi_env`."""
    monkeypatch.setattr(settings, "FASTAPI_ENV", fastapi_env)
    # Building the app must not initialise Sentry from a test.
    monkeypatch.setattr(settings, "SENTRY_DSN", None)
    # Outside development, `app.frontend` insists the built frontend exists,
    # and the backend suite never builds it. The docs routes do not depend
    # on it: FastAPI checks its own routes before any frontend file.
    monkeypatch.setattr(FastAPI, "frontend", lambda *_args, **_kwargs: None)

    spec = importlib.util.spec_from_file_location(
        f"_main_under_{fastapi_env}", app.main.__file__
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("path", _DOCS_PATHS)
def test_docs_are_not_served_in_production(
    monkeypatch: pytest.MonkeyPatch, path: str
) -> None:
    # Production is FASTAPI_ENV unset: compose.yml and compose.deploy.yml
    # never set it, only compose.override.yml and `fastapi dev` do.
    production = _main_under(monkeypatch, None)

    response = TestClient(production.app).get(path)

    assert response.status_code == 404


def test_docs_are_served_in_development(monkeypatch: pytest.MonkeyPatch) -> None:
    development = _main_under(monkeypatch, "development")
    client = TestClient(development.app)

    schema = client.get(_OPENAPI_PATH)
    assert schema.status_code == 200
    assert schema.json()["info"]["title"] == settings.PROJECT_NAME

    swagger = client.get("/docs")
    assert swagger.status_code == 200
    assert "swagger-ui" in swagger.text
    assert _OPENAPI_PATH in swagger.text

    redoc = client.get("/redoc")
    assert redoc.status_code == 200
    assert "redoc" in redoc.text
    assert _OPENAPI_PATH in redoc.text
