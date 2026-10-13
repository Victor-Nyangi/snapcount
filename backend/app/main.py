from pathlib import Path

import sentry_sdk
from fastapi import FastAPI
from fastapi.routing import APIRoute
from starlette.middleware.cors import CORSMiddleware

from app.api.main import api_router
from app.core.config import settings

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

app.include_router(api_router, prefix=settings.API_V1_STR)
app.frontend("/", directory=FRONTEND_DIR)
