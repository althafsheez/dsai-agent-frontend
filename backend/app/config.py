from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


BACKEND_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_prefix="DSAI_",
        extra="ignore",
    )

    app_name: str = "DSAI API"
    environment: str = "development"
    database_url: str = f"sqlite:///{BACKEND_ROOT / 'dsai.db'}"
    storage_root: Path = BACKEND_ROOT / "storage"
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )
    auto_create_schema: bool = True
    gemini_api_key: str | None = None
    gemini_models: str = ""
    default_model_id: str | None = None

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
