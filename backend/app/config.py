from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_prefix="DSAI_",
        extra="ignore",
        populate_by_name=True,
    )

    app_name: str = "DSAI API"
    environment: str = "development"
    database_url: str = f"sqlite:///{BACKEND_ROOT / 'dsai.db'}"
    storage_root: Path = BACKEND_ROOT / "storage"
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )
    auto_create_schema: bool = True
    # A fresh database loads the committed snapshot in shared-data/ so every clone starts with the same history and files.
    import_shared_data: bool = True
    shared_data_dir: Path = BACKEND_ROOT.parent / "shared-data"
    # How often the server checks for dashboards whose Google Drive files are due a re-sync (0 turns the background check off).
    dashboard_sync_seconds: int = 60
    workflow_tick_seconds: int = 30
    gemini_api_key: str | None = None
    gemini_models: str = ""
    default_model_id: str | None = None
    tavily_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DSAI_TAVILY_API_KEY", "TAVILY_API_KEY"),
    )
    e2b_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DSAI_E2B_API_KEY", "E2B_API_KEY"),
    )
    max_agent_steps: int = Field(default=8, ge=1)
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:8000/api/connectors/google-drive/callback"
    frontend_url: str = "http://localhost:3000"
    # Encrypts stored connector tokens and signs OAuth state. Generate one with `python -c "import secrets;print(secrets.token_urlsafe(32))"`.
    connector_secret: str | None = None

    @property
    def google_drive_configured(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret and self.connector_secret)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
