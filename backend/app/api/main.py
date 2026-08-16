from fastapi import APIRouter

from app.api.routes import (
    leaders,
    login,
    meta,
    private,
    standings,
    teams,
    users,
    utils,
    weeks,
)
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(meta.router)
api_router.include_router(standings.router)
api_router.include_router(weeks.router)
api_router.include_router(leaders.router)
api_router.include_router(teams.router)


if settings.FASTAPI_ENV == "development":
    api_router.include_router(private.router)
