from pathlib import Path

import sentry_sdk
from fastapi import FastAPI
from fastapi.routing import APIRoute
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware

from app.api.main import api_router
from app.core.config import settings
from app.core.static_cache import FrontendCacheControlMiddleware

FRONTEND_DIR = Path(__file__).parent / "frontend"


def custom_generate_unique_id(route: APIRoute) -> str:
    return f"{route.tags[0]}-{route.name}"


if settings.SENTRY_DSN and settings.FASTAPI_ENV != "development":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)

# Swagger UI, ReDoc and the schema are development tools. In production they
# were a public, FastAPI-branded page on snapcount.nyangi.dev that nothing
# needs: the frontend client is generated at build time from a schema that
# scripts/generate-client.sh dumps locally, never fetched at runtime. Same
# switch as Sentry above and the private router: compose.override.yml and
# `fastapi dev` set FASTAPI_ENV, the production compose files do not.
_serve_docs = settings.FASTAPI_ENV == "development"

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json" if _serve_docs else None,
    docs_url="/docs" if _serve_docs else None,
    redoc_url="/redoc" if _serve_docs else None,
    generate_unique_id_function=custom_generate_unique_id,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_HOST],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Hashed /assets/* for a year, index.html revalidated every time. The API is
# left alone. See app/core/static_cache.py.
app.add_middleware(FrontendCacheControlMiddleware, api_prefix=settings.API_V1_STR)

# Compression lives here rather than in a Traefik `compress` middleware so it
# travels with the app: one layer, proven by pytest (tests/test_http_delivery.py),
# identical behind Traefik, on :8000 in dev, and on any other host. Added last
# so it is outermost and sees every response, the frontend's and the API's.
# Level 6 rather than Starlette's default 9: near-identical size on minified
# JS, noticeably less CPU per request on a small shared box.
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=6)

app.include_router(api_router, prefix=settings.API_V1_STR)
app.frontend("/", directory=FRONTEND_DIR)
