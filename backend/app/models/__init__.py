"""Domain models package.

Re-exports auth models from `user.py` (moved here from the former flat
`app/models.py`) so existing imports like `from app.models import User`
keep working unchanged, alongside the new NFL domain models.
"""

from sqlmodel import SQLModel

from app.models.game import Game
from app.models.season import IngestRun, Season
from app.models.stats import (
    Champion,
    DynastyRun,
    Player,
    PlayerSeasonStat,
    TeamSeasonStat,
)
from app.models.team import Team
from app.models.user import (
    Message,
    NewPassword,
    Token,
    TokenPayload,
    UpdatePassword,
    User,
    UserBase,
    UserCreate,
    UserPublic,
    UserRegister,
    UsersPublic,
    UserUpdate,
    UserUpdateMe,
)

__all__ = [
    "SQLModel",
    # auth
    "Message",
    "NewPassword",
    "Token",
    "TokenPayload",
    "UpdatePassword",
    "User",
    "UserBase",
    "UserCreate",
    "UserPublic",
    "UserRegister",
    "UserUpdate",
    "UserUpdateMe",
    "UsersPublic",
    # nfl domain
    "Team",
    "Season",
    "IngestRun",
    "Game",
    "TeamSeasonStat",
    "Player",
    "PlayerSeasonStat",
    "Champion",
    "DynastyRun",
]
