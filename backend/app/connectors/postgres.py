from __future__ import annotations

import json
import logging
import ssl
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import URL, bindparam, create_engine, text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import DBAPIError
from sqlalchemy.pool import NullPool

from ..config import Settings
from ..errors import APIError
from .schemas import Column, PostgresSettings, QueryResult, SchemaList, TableDetails, TableList, TableSummary
from .security import application_schema, resolve_target, validate_sql

CATALOG = """
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND NOT c.relrowsecurity
      AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      AND pg_catalog.has_schema_privilege(n.oid, 'USAGE')
      AND pg_catalog.has_table_privilege(c.oid, 'SELECT')
      AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_attribute a
          JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
          JOIN pg_catalog.pg_namespace tn ON tn.oid = t.typnamespace
          WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
            AND (tn.nspname <> 'pg_catalog' OR t.oid >= 16384)
      )
"""
REQUIRE_READER = """
    SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles r
      WHERE pg_catalog.pg_has_role(current_user, r.oid, 'MEMBER')
        AND (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
             OR r.rolname IN ('pg_write_all_data', 'pg_execute_server_program', 'pg_read_server_files', 'pg_write_server_files'))
    ) OR pg_catalog.has_database_privilege(current_database(), 'CREATE')
      OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_namespace n
        WHERE n.nspname !~ '^pg_' AND pg_catalog.has_schema_privilege(n.oid, 'CREATE')
      )
      OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f') AND n.nspname !~ '^pg_'
          AND pg_catalog.has_table_privilege(c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER')
      )
"""
MAX_RESULT_BYTES = 96_000
MAX_ROW_BYTES = 24_000


def _exact_integer(value: str) -> int | str:
    if len(value.lstrip("-")) > 16:
        return value
    integer = int(value)
    return integer if abs(integer) < 2**53 else value


class PostgresConnector:
    def __init__(self, credentials: PostgresSettings, settings: Settings) -> None:
        if not all(application_schema(name) for name in credentials.schema_filter):
            raise APIError(422, "invalid_postgres_schema", "Select application schemas for this connection.")
        self.schemas = set(credentials.schema_filter)
        self._development = settings.environment == "development"
        address = resolve_target(credentials, settings)
        options = {
            "hostaddr": address,
            "sslmode": credentials.ssl_mode,
            "client_encoding": "UTF8",
            "gssencmode": "disable",
            "connect_timeout": 5,
            "options": (
                "-c default_transaction_read_only=on -c search_path=pg_catalog "
                f"-c statement_timeout={settings.postgres_statement_timeout_ms} "
                "-c lock_timeout=1500 -c idle_in_transaction_session_timeout=15000 "
                "-c max_parallel_workers_per_gather=0 -c work_mem=4096 -c jit=off "
                "-c row_security=off -c standard_conforming_strings=on"
            ),
        }
        if credentials.ssl_mode == "verify-full":
            # psycopg[binary] can use OpenSSL built with a different default trust path.
            options["sslrootcert"] = settings.postgres_ca_file or ssl.get_default_verify_paths().cafile or "system"
        self.engine = create_engine(
            URL.create("postgresql+psycopg", host=credentials.host, port=credentials.port,
                       database=credentials.database, username=credentials.username,
                       password=credentials.password.get_secret_value()),
            connect_args=options, poolclass=NullPool, hide_parameters=True,
        )

    def close(self) -> None:
        self.engine.dispose()

    def _connection_error(self, exc: DBAPIError, stage: str) -> APIError | None:
        sqlstate = getattr(exc.orig, "sqlstate", None)
        reason = str(exc.orig).lower()
        if (sqlstate and sqlstate.startswith("28")) or any(
            text in reason for text in ("password authentication failed", "no password supplied")
        ):
            status, code, message = 422, "postgres_auth_failed", "PostgreSQL rejected the database credentials."
        elif exc.connection_invalidated or sqlstate is None or sqlstate.startswith("08"):
            if any(text in reason for text in ("certificate verify failed", "root certificate", "does not match host name")):
                status, code, message = 502, "postgres_tls_failed", "PostgreSQL TLS verification failed. Check the hostname and trusted CA bundle."
            elif "timeout expired" in reason or "connection timed out" in reason:
                status, code, message = 504, "postgres_connect_timeout", "Timed out connecting to PostgreSQL. Check network access to the host and port."
            elif "connection refused" in reason or "network is unreachable" in reason:
                status, code, message = 502, "postgres_unreachable", "The PostgreSQL host and port could not be reached."
            else:
                status, code, message = 502, "postgres_connection_failed", "Could not connect to PostgreSQL. Check the host, credentials and TLS certificate."
        else:
            return None

        details = None
        if self._development:
            driver_error = type(exc.orig).__name__
            details = {"stage": stage, "driver_error": driver_error, "sqlstate": sqlstate}
            logging.getLogger(__name__).warning(
                "PostgreSQL failure code=%s stage=%s driver_error=%s sqlstate=%s",
                code, stage, driver_error, sqlstate,
            )
        return APIError(status, code, message, details)

    @contextmanager
    def _reader(self) -> Iterator[Connection]:
        stage = "connect"
        try:
            with self.engine.connect() as connection, connection.begin():
                stage = "session_setup"
                connection.exec_driver_sql("SET TRANSACTION READ ONLY")
                connection.exec_driver_sql("SET LOCAL search_path TO pg_catalog")
                if connection.execute(text(REQUIRE_READER)).scalar_one():
                    raise APIError(422, "postgres_reader_required", "Use a dedicated PostgreSQL role with SELECT access only.")
                stage = "query"
                yield connection
        except DBAPIError as exc:
            code = getattr(exc.orig, "sqlstate", None)
            if code in {"57014", "55P03"}:
                raise APIError(504, "postgres_timeout", "PostgreSQL timed out. Try a smaller query.") from None
            if failure := self._connection_error(exc, stage):
                raise failure from None
            raise APIError(422, "postgres_query_failed", "PostgreSQL could not execute this query. Check the table names, columns and data types.") from None

    def _schemas(self, allowed_only: bool) -> SchemaList:
        query = "SELECT DISTINCT n.nspname " + CATALOG
        if allowed_only:
            query += " AND n.nspname IN :schemas"
        statement = text(query + " ORDER BY n.nspname LIMIT 101")
        if allowed_only:
            statement = statement.bindparams(bindparam("schemas", expanding=True))
        with self._reader() as connection:
            names = list(connection.execute(statement, {"schemas": sorted(self.schemas)} if allowed_only else {}).scalars())
        return SchemaList(items=names[:100], truncated=len(names) > 100)

    def test_connection(self) -> SchemaList:
        return self._schemas(allowed_only=False)

    def list_schemas(self) -> SchemaList:
        return self._schemas(allowed_only=True)

    def list_tables(self, schema: str | None = None, search: str = "") -> TableList:
        if schema is not None and schema not in self.schemas:
            raise APIError(403, "postgres_schema_forbidden", "This schema is outside the connection filter.")
        statement = text(
            "SELECT n.nspname, c.relname " + CATALOG + """
            AND n.nspname IN :schemas
            AND pg_catalog.strpos(pg_catalog.lower(c.relname), pg_catalog.lower(:search)) > 0
            ORDER BY n.nspname, c.relname LIMIT 501
            """
        ).bindparams(bindparam("schemas", expanding=True))
        # strpos(name, '') is 1, so the same bound statement serves an empty filter.
        with self._reader() as connection:
            rows = connection.execute(statement, {"schemas": [schema] if schema else sorted(self.schemas), "search": search}).all()
        return TableList(items=[TableSummary(schema_name=s, name=t) for s, t in rows[:500]], truncated=len(rows) > 500)

    def _table_oid(self, connection: Connection, schema: str, table: str) -> int:
        if schema not in self.schemas:
            raise APIError(403, "postgres_schema_forbidden", "This schema is outside the connection filter.")
        oid = connection.execute(text(
            "SELECT c.oid " + CATALOG + " AND n.nspname = :schema AND c.relname = :table"
        ), {"schema": schema, "table": table}).scalar_one_or_none()
        if oid is None:
            raise APIError(404, "postgres_table_not_found", "This table is unavailable to the connection's PostgreSQL role.")
        return oid

    def describe_table(self, schema: str, table: str) -> TableDetails:
        with self._reader() as connection:
            oid = self._table_oid(connection, schema, table)
            rows = connection.execute(text("""
                SELECT a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod),
                       NOT a.attnotnull, EXISTS (
                         SELECT 1 FROM pg_catalog.pg_index i
                         CROSS JOIN LATERAL pg_catalog.unnest(i.indkey) WITH ORDINALITY AS key(attnum, position)
                         WHERE i.indrelid = a.attrelid AND i.indisprimary
                           AND key.attnum = a.attnum AND key.position <= i.indnkeyatts
                       )
                FROM pg_catalog.pg_attribute a
                WHERE a.attrelid = :oid AND a.attnum > 0 AND NOT a.attisdropped
                ORDER BY a.attnum LIMIT 501
            """), {"oid": oid}).all()
        if len(rows) > 500:
            raise APIError(422, "postgres_table_too_wide", "This table exceeds the 500-column metadata limit.")
        return TableDetails(schema_name=schema, name=table, columns=[
            Column(name=name, data_type=kind, nullable=nullable, primary_key=primary)
            for name, kind, nullable, primary in rows
        ])

    def preview_table(self, schema: str, table: str, limit: int) -> QueryResult:
        quote = self.engine.dialect.identifier_preparer.quote_identifier
        return self.execute_readonly_query(f"SELECT * FROM {quote(schema)}.{quote(table)}", limit)

    def export_table(self, schema: str, table: str, max_rows: int, max_bytes: int = 20_000_000) -> QueryResult:
        """A whole table over one read-only connection, for importing it as a dataset (row and size capped)."""
        quote = self.engine.dialect.identifier_preparer.quote_identifier
        with self._reader() as connection:
            self._table_oid(connection, schema, table)
            raw = connection.execution_options(no_parameters=True)
            source = f"SELECT * FROM {quote(schema)}.{quote(table)}"
            with raw.exec_driver_sql(f"{source} LIMIT 0") as result:
                columns = list(result.keys())
            rows: list[list[object]] = []
            size = 0
            query = f"SELECT pg_catalog.row_to_json(t)::pg_catalog.text FROM ({source} LIMIT {int(max_rows) + 1}) AS t"
            with raw.execution_options(stream_results=True, max_row_buffer=500).exec_driver_sql(query) as result:
                for encoded in result.scalars():
                    size += len(encoded)
                    if len(rows) == max_rows or size > max_bytes:
                        return QueryResult(columns=columns, rows=rows, truncated=True)
                    rows.append(list(json.loads(encoded, parse_float=str, parse_int=_exact_integer).values()))
            return QueryResult(columns=columns, rows=rows, truncated=False)

    def execute_readonly_query(self, sql: str, limit: int) -> QueryResult:
        normalized, tables = validate_sql(sql, self.schemas)
        with self._reader() as connection:
            for schema, table in sorted(tables):
                self._table_oid(connection, schema, table)
            raw = connection.execution_options(no_parameters=True)
            with raw.exec_driver_sql(f"SELECT * FROM ({normalized}) AS dsai_result LIMIT 0") as result:
                columns = list(result.keys())
            size = len(json.dumps(columns, ensure_ascii=True))
            if len(columns) > 500 or size > MAX_RESULT_BYTES // 2:
                raise APIError(422, "postgres_result_too_wide", "Select fewer columns.")
            aliases = ", ".join(f"c{i}" for i in range(len(columns)))
            alias_clause = f"({aliases})" if aliases else ""
            query = f"""
                SELECT CASE WHEN pg_catalog.octet_length(encoded) <= {MAX_ROW_BYTES} THEN encoded END
                FROM (
                    SELECT pg_catalog.row_to_json(dsai_result)::pg_catalog.text AS encoded
                    FROM ({normalized}) AS dsai_result{alias_clause}
                    LIMIT {int(limit) + 1}
                ) AS dsai_rows
            """
            rows: list[list[object]] = []
            with raw.execution_options(stream_results=True, max_row_buffer=8).exec_driver_sql(query) as result:
                for encoded in result.scalars():
                    if encoded is None or len(rows) == limit:
                        return QueryResult(columns=columns, rows=rows, truncated=True)
                    # Preserve fractional precision and column order, including duplicate output names.
                    row = list(json.loads(encoded, parse_float=str, parse_int=_exact_integer).values())
                    size += len(json.dumps(row, ensure_ascii=True)) + 2
                    if size > MAX_RESULT_BYTES:
                        return QueryResult(columns=columns, rows=rows, truncated=True)
                    rows.append(row)
            return QueryResult(columns=columns, rows=rows, truncated=False)
