from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, StringConstraints, field_validator

from ..schemas import APIModel

Identifier = Annotated[str, StringConstraints(min_length=1, max_length=63, pattern=r"^[^\x00]+$")]
ConnectionID = Annotated[str, StringConstraints(min_length=36, max_length=36)]


class PostgresSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    description: str = Field(default="", max_length=2000)
    host: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=253)]
    port: int = Field(default=5432, ge=1, le=65535)
    database: Identifier
    username: Identifier
    password: SecretStr = Field(min_length=1, max_length=1024)
    ssl_mode: Literal["verify-full", "disable"] = "verify-full"
    workspace_id: str | None = Field(default=None, max_length=36)
    include_schema_for_ai: bool = True
    enable_previews: bool = True
    schema_filter: list[Identifier] = Field(default_factory=lambda: ["public"], min_length=1, max_length=32)

    @field_validator("schema_filter")
    @classmethod
    def unique_schemas(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))


class ConnectionCreate(PostgresSettings):
    provider: Literal["postgresql"] = "postgresql"


class ConnectionResponse(APIModel):
    id: str
    provider: Literal["postgresql"]
    name: str
    description: str
    owner: str
    created_by: str
    workspace_id: str | None
    host: str
    port: int
    database: str
    username: str
    ssl_mode: Literal["verify-full", "disable"]
    status: Literal["connected", "failed"]
    include_schema_for_ai: bool
    enable_previews: bool
    schema_filter: list[str]
    created_at: datetime
    updated_at: datetime
    last_tested_at: datetime


class ConnectionList(BaseModel):
    items: list[ConnectionResponse]


class SchemaList(BaseModel):
    items: list[str]
    truncated: bool = False


class ConnectionTest(BaseModel):
    status: Literal["connected"] = "connected"
    schemas: SchemaList


class TableSummary(BaseModel):
    schema_name: str
    name: str


class TableList(BaseModel):
    items: list[TableSummary]
    truncated: bool = False


class Column(BaseModel):
    name: str
    data_type: str
    nullable: bool
    primary_key: bool


class QueryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sql: str = Field(min_length=1, max_length=16_000)
    limit: int = Field(default=100, ge=1, le=200)


class QueryResult(BaseModel):
    columns: list[str]
    rows: list[list[object]]
    truncated: bool


class TableDetails(TableSummary):
    columns: list[Column]
    preview: QueryResult | None = None


class ConnectionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    host: str | None = Field(default=None, max_length=253)
    port: int | None = Field(default=None, ge=1, le=65535)
    database: Identifier | None = None
    username: Identifier | None = None
    password: SecretStr | None = Field(default=None, min_length=1, max_length=1024)
    ssl_mode: Literal["verify-full", "disable"] | None = None
    workspace_id: str | None = Field(default=None, max_length=36)
    include_schema_for_ai: bool | None = None
    enable_previews: bool | None = None
    schema_filter: list[Identifier] | None = Field(default=None, min_length=1, max_length=32)
