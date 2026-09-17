"""Settings failures must name fields without printing their values.

The incident: the container crash-looped on a missing variable, and every
loop logged pydantic's `input_value={'DATABASE_URL': 'postgre...'}`, putting
part of the Postgres password into four days of container logs.
"""

from collections.abc import Iterator

import pytest
from pydantic import ValidationError

from app.core.config import (
    Settings,
    SettingsError,
    describe_settings_error,
    load_settings,
)

# Short enough that the canary survives pydantic's middle-truncation of the
# repr, so `test_pydantics_own_message_still_leaks` below genuinely bites.
# This mirrors the incident, where the truncated TAIL of the DSN — the part
# holding the password — is exactly what reached the logs.
_CANARY_PASSWORD = "pw-leak-canary"
_FAKE_DSN = f"postgresql://u:{_CANARY_PASSWORD}@h/d"

# Every variable `Settings` requires. Cleared so the failure below is the
# real one from the incident: DATABASE_URL present, the rest absent.
_REQUIRED_VARS = (
    "SECRET_KEY",
    "PROJECT_NAME",
    "DATABASE_URL",
    "FIRST_SUPERUSER",
    "FIRST_SUPERUSER_PASSWORD",
)


@pytest.fixture
def settings_failure(monkeypatch: pytest.MonkeyPatch) -> ValidationError:
    """A real `Settings` validation failure carrying a fake connection string."""
    for var in _REQUIRED_VARS:
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("DATABASE_URL", _FAKE_DSN)

    with pytest.raises(ValidationError) as exc_info:
        # `_env_file=None` so the repo's real .env cannot supply the values
        # this test needs to be missing — or its secrets to this process.
        Settings(_env_file=None)  # type: ignore
    return exc_info.value


def test_pydantics_own_message_still_leaks_the_connection_string(
    settings_failure: ValidationError,
) -> None:
    """Guards the guard.

    If pydantic ever stops echoing `input_value`, the redaction assertions
    below would pass for the wrong reason. This fails the day that happens,
    which is the day the redaction can be reconsidered.
    """
    assert _CANARY_PASSWORD in str(settings_failure)


def test_describe_settings_error_names_every_missing_field(
    settings_failure: ValidationError,
) -> None:
    message = describe_settings_error(settings_failure)

    for field in ("SECRET_KEY", "PROJECT_NAME", "FIRST_SUPERUSER_PASSWORD"):
        assert field in message
    assert "Field required" in message


def test_describe_settings_error_prints_no_secret_values(
    settings_failure: ValidationError,
) -> None:
    message = describe_settings_error(settings_failure)

    assert _CANARY_PASSWORD not in message
    assert _FAKE_DSN not in message
    assert "postgresql" not in message
    assert "input_value" not in message


def test_load_settings_reraises_redacted_and_suppresses_the_original(
    monkeypatch: pytest.MonkeyPatch, settings_failure: ValidationError
) -> None:
    def explode(*_args: object, **_kwargs: object) -> Iterator[None]:
        raise settings_failure

    monkeypatch.setattr("app.core.config.Settings", explode)

    with pytest.raises(SettingsError) as exc_info:
        load_settings()

    raised = exc_info.value
    assert "SECRET_KEY" in str(raised)
    assert _CANARY_PASSWORD not in str(raised)
    # `raise ... from None`: without this the traceback would print the
    # unredacted ValidationError as the cause, one line below the redaction.
    assert raised.__suppress_context__ is True
    assert raised.__cause__ is None
