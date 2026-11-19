"""Compression and Cache-Control on what production actually serves.

Production serves the SPA from FastAPI itself (`app.frontend("/")` in
app/main.py, the build copied into the backend image), so the headers a
browser sees are decided here, not by a separate web server. Measured before
this existed: no Content-Encoding and no Cache-Control on any of the ~18
JS/CSS files or on the API.

The suite never builds the frontend, so each test points the real
`app/main.py` — middleware stack, frontend route and all — at a tiny fake
build in `tmp_path`. A fresh module is executed per test (as test_main.py
does) because `app.frontend` is called at import time.
"""

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.main
from app.core.config import settings

IMMUTABLE = "public, max-age=31536000, immutable"

# Big enough to clear GZipMiddleware's minimum_size, and compressible, like
# real minified JS.
_JS = "export const x = () => 'snapcount';\n" * 200
_CSS = ".card { color: var(--fg); }\n" * 200
_SVG = '<svg xmlns="http://www.w3.org/2000/svg">' + "<g/>" * 400 + "</svg>"
_INDEX = (
    "<!doctype html><html><head>"
    '<script type="module" src="/assets/index-abc123.js"></script>'
    "</head><body>" + "<div></div>" * 200 + "</body></html>"
)

_HTML = {"accept": "text/html,application/xhtml+xml"}


def _fake_build(root: Path) -> Path:
    (root / "assets").mkdir()
    (root / "index.html").write_text(_INDEX)
    (root / "assets" / "index-abc123.js").write_text(_JS)
    (root / "assets" / "index-abc123.css").write_text(_CSS)
    (root / "assets" / "logo-abc123.svg").write_text(_SVG)
    return root


@pytest.fixture
def served(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> TestClient:
    build = _fake_build(tmp_path)
    original = FastAPI.frontend

    def frontend_at_fake_build(self: FastAPI, path: str, **kwargs: object) -> None:
        kwargs["directory"] = build
        original(self, path, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(FastAPI, "frontend", frontend_at_fake_build)
    monkeypatch.setattr(settings, "SENTRY_DSN", None)

    spec = importlib.util.spec_from_file_location("_main_http", app.main.__file__)
    assert spec is not None and spec.loader is not None
    module: ModuleType = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return TestClient(module.app)


# --- compression -----------------------------------------------------------


@pytest.mark.parametrize(
    ("path", "content_type"),
    [
        ("/assets/index-abc123.js", "text/javascript"),
        ("/assets/index-abc123.css", "text/css"),
        ("/assets/logo-abc123.svg", "image/svg+xml"),
        ("/", "text/html"),
    ],
)
def test_frontend_files_are_gzipped(
    served: TestClient, path: str, content_type: str
) -> None:
    response = served.get(path, headers={"accept-encoding": "gzip"})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith(content_type)
    assert response.headers["content-encoding"] == "gzip"
    assert "accept-encoding" in response.headers["vary"].lower()


def test_no_compression_without_accept_encoding(served: TestClient) -> None:
    response = served.get(
        "/assets/index-abc123.js", headers={"accept-encoding": "identity"}
    )

    assert response.status_code == 200
    assert "content-encoding" not in response.headers
    assert response.text == _JS


def test_api_json_is_gzipped_and_keeps_its_caching(served: TestClient) -> None:
    response = served.get(
        f"{settings.API_V1_STR}/standings/2024", headers={"accept-encoding": "gzip"}
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.headers["content-encoding"] == "gzip"
    # API caching is the routes' business; the frontend policy must not leak.
    assert "cache-control" not in response.headers


# --- cache-control ---------------------------------------------------------


@pytest.mark.parametrize(
    "path",
    ["/assets/index-abc123.js", "/assets/index-abc123.css", "/assets/logo-abc123.svg"],
)
def test_hashed_assets_are_immutable(served: TestClient, path: str) -> None:
    response = served.get(path)

    assert response.status_code == 200
    assert response.headers["cache-control"] == IMMUTABLE


def test_asset_304_keeps_immutable(served: TestClient) -> None:
    etag = served.get("/assets/index-abc123.js").headers["etag"]

    response = served.get("/assets/index-abc123.js", headers={"if-none-match": etag})

    assert response.status_code == 304
    assert response.headers["cache-control"] == IMMUTABLE


@pytest.mark.parametrize("path", ["/", "/index.html"])
def test_index_html_is_revalidated(served: TestClient, path: str) -> None:
    response = served.get(path, headers=_HTML)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-cache"


@pytest.mark.parametrize("path", ["/leaders", "/team/KC", "/player/00-0033873"])
def test_spa_fallback_is_revalidated(served: TestClient, path: str) -> None:
    response = served.get(path, headers=_HTML)

    assert response.status_code == 200
    assert response.text == _INDEX
    assert response.headers["cache-control"] == "no-cache"


def test_index_304_keeps_no_cache(served: TestClient) -> None:
    etag = served.get("/", headers=_HTML).headers["etag"]

    response = served.get("/", headers={**_HTML, "if-none-match": etag})

    assert response.status_code == 304
    assert response.headers["cache-control"] == "no-cache"


def test_fallback_under_assets_is_never_pinned(served: TestClient) -> None:
    # A navigation to an asset that does not exist gets index.html from the
    # SPA fallback. Pinning THAT for a year would strand the URL forever.
    response = served.get("/assets/index-gone999.js", headers=_HTML)

    assert response.status_code == 200
    assert response.text == _INDEX
    assert "cache-control" not in response.headers


def test_missing_asset_404_is_not_cached(served: TestClient) -> None:
    response = served.get("/assets/index-gone999.js", headers={"accept": "*/*"})

    assert response.status_code == 404
    assert "cache-control" not in response.headers
