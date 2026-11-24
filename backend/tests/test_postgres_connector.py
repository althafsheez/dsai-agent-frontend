from __future__ import annotations

import asyncio
import json
import os
import secrets
import socket
from contextlib import asynccontextmanager
from types import SimpleNamespace

import psycopg
import pytest
from cryptography.fernet import Fernet
from httpx import ASGITransport, AsyncClient
from psycopg import sql
from sqlalchemy.exc import DBAPIError

from agentic.runtime.events import ProviderEvent
from app.config import Settings
from app.connectors.postgres import PostgresConnector
from app.connectors.schemas import PostgresSettings
from app.connectors.security import resolve_target, validate_sql
from app.errors import APIError
from app.main import create_app
from app.models import DataConnection
from conftest import FakeProvider, parse_sse


@pytest.mark.parametrize("query", [
    "SELECT 1; SELECT 2",
    "DELETE FROM public.orders",
    "SELECT * INTO public.orders_copy FROM public.orders",
    "WITH d AS (DELETE FROM public.orders RETURNING *) SELECT * FROM d",
    "SELECT * FROM public.orders FOR UPDATE",
    "SELECT pg_catalog.pg_sleep(30)",
    "SELECT pg_catalog.set_config('search_path', 'public', false)",
    "SELECT * FROM pg_catalog.pg_roles",
    "SELECT * FROM orders",
    "SELECT * FROM public.orders WHERE total OPERATOR(public.=) 1",
    "SELECT 'value'::public.custom_type",
    "SELECT * FROM generate_series(1,100)",
])
def test_parser_blocks_unsafe_postgres_sql(query):
    with pytest.raises(APIError):
        validate_sql(query, {"public"})


def test_parser_preserves_analytic_queries_and_scopes_ctes():
    sql_text, tables = validate_sql("""
        WITH orders AS (SELECT date_trunc('month', ordered_at) AS month, total FROM public.orders)
        SELECT month, SUM(total) AS revenue FROM orders GROUP BY month ORDER BY month;
    """, {"public"})
    assert tables == {("public", "orders")}
    assert "ONLY public.orders" in sql_text
    assert "SUM" in sql_text.upper()
    with pytest.raises(APIError):
        validate_sql("SELECT * FROM missing UNION ALL (WITH missing AS (SELECT 1) SELECT * FROM missing)", {"public"})


def test_public_hostname_without_allowlist_pins_the_address_and_preserves_tls(monkeypatch):
    settings = Settings(environment="development", postgres_allowed_targets=[], postgres_private_targets={})
    data = PostgresSettings(
        name="Example", host="db.example.test", port=6543, database="demo", username="reader", password="pw",
    )
    calls = iter(["8.8.8.8", "169.254.169.254"])

    def dns(host, port, **kwargs):
        assert (host, port) == ("db.example.test", 6543)
        return [(socket.AF_INET, 0, 0, "", (next(calls), port))]

    def engine(url, *, connect_args, **kwargs):
        assert url.host == data.host and url.port == data.port
        assert connect_args["hostaddr"] == "8.8.8.8"
        assert connect_args["sslmode"] == "verify-full"
        assert connect_args["sslrootcert"] == "/etc/ssl/certs/host-ca.pem"
        assert connect_args["connect_timeout"] == 5

    monkeypatch.setattr(socket, "getaddrinfo", dns)
    monkeypatch.setattr("app.connectors.postgres.ssl.get_default_verify_paths", lambda: SimpleNamespace(cafile="/etc/ssl/certs/host-ca.pem"))
    monkeypatch.setattr("app.connectors.postgres.create_engine", engine)
    PostgresConnector(data, settings)
    with pytest.raises(APIError, match="unapproved network"):
        resolve_target(data, settings)
    with pytest.raises(APIError, match="require verified TLS"):
        resolve_target(data.model_copy(update={"ssl_mode": "disable"}), settings)


@pytest.mark.parametrize(("custom_ca", "system_ca", "expected"), [
    ("/tmp/custom-ca.pem", "/etc/ssl/certs/host-ca.pem", "/tmp/custom-ca.pem"),
    (None, None, "system"),
])
def test_postgres_ca_override_and_fallback(monkeypatch, custom_ca, system_ca, expected):
    settings = Settings(postgres_ca_file=custom_ca)
    data = PostgresSettings(name="Reader", host="db.example.test", database="demo", username="reader", password="pw")
    monkeypatch.setattr("app.connectors.postgres.resolve_target", lambda *_: "8.8.8.8")
    monkeypatch.setattr("app.connectors.postgres.ssl.get_default_verify_paths", lambda: SimpleNamespace(cafile=system_ca))

    def engine(url, *, connect_args, **kwargs):
        assert str(connect_args["sslrootcert"]) == expected
        assert connect_args["sslmode"] == "verify-full"

    monkeypatch.setattr("app.connectors.postgres.create_engine", engine)
    PostgresConnector(data, settings)


@pytest.mark.parametrize("addresses", [
    ["127.0.0.1"],
    ["10.0.0.5"],
    ["::1"],
    ["::ffff:127.0.0.1"],
    ["8.8.8.8", "169.254.169.254"],
    ["8.8.8.8", "fd00::1"],
])
def test_unconfigured_hostname_denies_any_unsafe_dns_result(monkeypatch, addresses):
    settings = Settings(environment="development", postgres_allowed_targets=[], postgres_private_targets={})
    data = PostgresSettings(name="Example", host="db.example.test", database="demo", username="reader", password="pw")
    monkeypatch.setattr(socket, "getaddrinfo", lambda *args, **kwargs: [
        (socket.AF_INET, 0, 0, "", (address, data.port)) for address in addresses
    ])
    with pytest.raises(APIError, match="unapproved network"):
        resolve_target(data, settings)


def test_literal_loopback_still_requires_explicit_test_configuration():
    settings = Settings(environment="test", postgres_allowed_targets=[], postgres_private_targets={})
    data = PostgresSettings(name="Fixture", host="127.0.0.1", database="demo", username="reader", password="pw")
    with pytest.raises(APIError, match="unapproved network"):
        resolve_target(data, settings)
    allowlisted = settings.model_copy(update={"postgres_allowed_targets": ["127.0.0.1:5432"]})
    assert resolve_target(data, allowlisted) == "127.0.0.1"
    with pytest.raises(APIError, match="unapproved network"):
        resolve_target(data, allowlisted.model_copy(update={"environment": "development"}))


@pytest.fixture
def postgres():
    dsn = os.environ.get("DSAI_TEST_POSTGRES_ADMIN_DSN")
    if not dsn:
        pytest.skip("Set DSAI_TEST_POSTGRES_ADMIN_DSN to an isolated PostgreSQL test instance.")
    password = secrets.token_urlsafe(24)
    suffix = secrets.token_hex(5)
    schema, other, role = (f"{prefix}_{suffix}" for prefix in ("sales", "outside", "reader"))
    with psycopg.connect(dsn, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE ROLE {} LOGIN PASSWORD {}").format(sql.Identifier(role), sql.Literal(password)))
        try:
            for name in (schema, other):
                admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(name)))
                admin.execute(sql.SQL("""
                    CREATE TABLE {}.orders (
                        id integer PRIMARY KEY, product text NOT NULL, total numeric, ordered_at date
                    )
                """).format(sql.Identifier(name)))
                admin.execute(sql.SQL("GRANT USAGE ON SCHEMA {} TO {}").format(sql.Identifier(name), sql.Identifier(role)))
                admin.execute(sql.SQL("GRANT SELECT ON ALL TABLES IN SCHEMA {} TO {}").format(sql.Identifier(name), sql.Identifier(role)))
            admin.execute(sql.SQL("""
                INSERT INTO {}.orders VALUES
                    (1, 'Pump', 30.50, '2026-09-01'), (2, 'Pump', 52.25, '2026-10-01'),
                    (3, 'Valve', 71.25, '2026-11-01'), (4, repeat('x', 130000), 0.00, '2026-11-02');
                CREATE TABLE {}.stress AS SELECT i AS id FROM generate_series(1, 5000) AS t(i);
                GRANT SELECT ON {}.stress TO {};
                CREATE VIEW {}.hidden_view AS SELECT * FROM {}.orders;
                GRANT SELECT ON {}.hidden_view TO {};
            """).format(*(sql.Identifier(value) for value in (schema, schema, schema, role, schema, other, schema, role))))
            yield {
                "schema": schema, "outside": other, "role": role, "password": password,
                "database": admin.info.dbname, "port": admin.info.port,
                "ca_file": os.environ.get("DSAI_TEST_POSTGRES_CA_FILE"),
            }
        finally:
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(other)))
            admin.execute(sql.SQL("DROP ROLE {}").format(sql.Identifier(role)))


class DatabaseToolProvider(FakeProvider):
    attempts: list[dict] | None = None

    async def stream_with_tools(self, messages, model_id, effort, tools, execute_tool, max_steps, *, tool_context):
        inventory = tool_context.get("database_connections", [])
        declared = {tool.name for tool in tools}
        assert {"list_database_tables", "describe_database_table", "query_database"} <= declared
        if messages[-1].content == "Hold the first analysis":
            self.started.set()
            await asyncio.wait_for(self.release.wait(), timeout=8)
            yield ProviderEvent("message.delta", {"text": "First analysis finished."})
            return
        if not inventory:
            result = await execute_tool("query_database", {"connection_id": self.connection_id, "sql": "SELECT 1"})
            assert result["code"] == "postgres_not_selected"
            yield ProviderEvent("message.delta", {"text": "No database selected."})
            return
        connection = inventory[0]
        assert set(connection) == {"connection_id", "name", "provider", "schemas"}
        assert connection["connection_id"] == self.connection_id
        connection_id, schema = connection["connection_id"], connection["schemas"][0]
        common = {"connection_id": connection_id}
        tables = await execute_tool("list_database_tables", common)
        assert {"schema_name": schema, "name": "orders"} in tables["items"]
        table = await execute_tool("describe_database_table", {**common, "schema": schema, "table": "orders"})
        assert table["columns"][0]["primary_key"] is True
        result = await execute_tool("query_database", {
            **common, "sql": f'SELECT pg_catalog.sum(total) AS revenue FROM "{schema}".orders',
        })
        assert result["rows"] == [["154.00"]], result
        self.attempts.append(result)
        yield ProviderEvent("message.delta", {"text": "Live PostgreSQL revenue was " + result["rows"][0][0]})


def integration_settings(tmp_path, postgres):
    settings = Settings(
        environment="test", database_url=f"sqlite:///{tmp_path / 'app.db'}", storage_root=tmp_path / "storage",
        connector_encryption_key=Fernet.generate_key().decode(), postgres_ca_file=postgres["ca_file"],
        postgres_allowed_targets=[f'127.0.0.1:{postgres["port"]}', "127.0.0.1:1"],
        postgres_statement_timeout_ms=300,
    )
    headers = {"owner": {"X-Demo-User-Id": "user-you"}, "other": {"X-Demo-User-Id": "user-shared"}}
    form = {
        "name": "Sales test", "host": "127.0.0.1", "port": postgres["port"], "database": postgres["database"],
        "username": postgres["role"], "password": postgres["password"],
        "ssl_mode": "verify-full" if postgres["ca_file"] else "disable", "schema_filter": [postgres["schema"]],
    }
    return settings, headers, form


@asynccontextmanager
async def client_for(app, *, peer="127.0.0.1"):
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app, client=(peer, 1234)), base_url="http://localhost") as client:
            yield client


async def create_connection(client, headers, form):
    response = await client.post("/api/connectors/postgresql", headers=headers, json=form)
    assert response.status_code == 201, response.text
    payload = response.json()
    assert "password" not in payload and "encrypted_credentials" not in payload
    return payload["id"]


@pytest.mark.parametrize(("driver_message", "http_status", "code"), [
    ("SSL error: certificate verify failed", 502, "postgres_tls_failed"),
    ("connection timeout expired", 504, "postgres_connect_timeout"),
    ("fe_sendauth: no password supplied", 422, "postgres_auth_failed"),
    ("connection refused", 502, "postgres_unreachable"),
])
async def test_connection_failure_reports_safe_development_details(tmp_path, monkeypatch, driver_message, http_status, code):
    settings = Settings(
        environment="development", database_url=f"sqlite:///{tmp_path / 'app.db'}", storage_root=tmp_path / "storage",
        connector_encryption_key=Fernet.generate_key().decode(),
    )
    secret = "do-not-expose-driver-content"

    def connect():
        raise DBAPIError(None, None, psycopg.OperationalError(f"{driver_message}: {secret}"))

    monkeypatch.setattr("app.connectors.postgres.resolve_target", lambda *_: "8.8.8.8")
    monkeypatch.setattr("app.connectors.postgres.create_engine", lambda *args, **kwargs: SimpleNamespace(
        connect=connect, dispose=lambda: None,
    ))
    app = create_app(settings, FakeProvider())
    async with client_for(app) as client:
        response = await client.post("/api/connectors/postgresql/test", json={
            "name": "Example", "host": "db.example.test", "database": "demo", "username": "reader", "password": secret,
        })
    assert response.status_code == http_status
    assert secret not in response.text
    error = response.json()["error"]
    assert error["code"] == code
    assert error["details"] == {"stage": "connect", "driver_error": "OperationalError", "sqlstate": None}


async def test_demo_postgres_is_local_only(tmp_path):
    settings = Settings(
        environment="development", database_url=f"sqlite:///{tmp_path / 'app.db'}", storage_root=tmp_path / "storage",
        connector_encryption_key=Fernet.generate_key().decode(),
    )
    app = create_app(settings, FakeProvider())
    async with client_for(app) as client:
        assert (await client.get("/api/connectors/postgresql")).json() == {"items": []}
        assert (await client.get("/api/connectors/postgresql", headers={"X-Demo-User-Id": "user-shared"})).status_code == 403
        assert (await client.get("/api/auth/verified")).status_code == 404
        local_forwarding = {"X-Forwarded-Host": "localhost:3100", "X-Forwarded-For": "127.0.0.1"}
        assert (await client.get("/api/connectors/postgresql", headers=local_forwarding)).status_code == 200
        for headers in (
            {"Host": "public.example.test"},
            {"Origin": "https://public.example.test"},
            {"X-Forwarded-For": "203.0.113.2, 127.0.0.1"},
            {"X-Forwarded-Host": "public.example.test"},
        ):
            assert (await client.get("/api/connectors/postgresql", headers=headers)).status_code == 403
            assert (await client.post("/api/runs/example/retry/stream", headers=headers)).status_code == 403
    async with client_for(app, peer="203.0.113.2") as client:
        assert (await client.get("/api/connectors/postgresql")).status_code == 403
        assert (await client.get("/api/chats")).status_code == 403
    production = create_app(settings.model_copy(update={"environment": "production"}), FakeProvider())
    async with client_for(production) as client:
        assert (await client.get("/api/connectors/postgresql")).status_code == 403
        assert (await client.get("/api/chats")).status_code == 200


async def test_real_postgres_connection_to_chat(tmp_path, postgres):
    settings, headers, form = integration_settings(tmp_path, postgres)
    owner, other = headers["owner"], headers["other"]
    provider = DatabaseToolProvider()
    provider.attempts = []
    app = create_app(settings, provider)
    async with client_for(app) as client:
        invalid = await client.post("/api/connectors/postgresql/test", headers=owner, json={**form, "port": -1})
        assert invalid.status_code == 422 and form["password"] not in invalid.text
        wrong = await client.post("/api/connectors/postgresql/test", headers=owner, json={**form, "password": "incorrect"})
        assert wrong.status_code == 422 and wrong.json()["error"]["code"] == "postgres_auth_failed"
        unreachable = await client.post("/api/connectors/postgresql/test", headers=owner, json={**form, "port": 1})
        assert unreachable.status_code == 502
        tested = await client.post("/api/connectors/postgresql/test", headers=owner, json=form)
        assert tested.status_code == 200, tested.text
        assert set(tested.json()["schemas"]["items"]) == {postgres["schema"], postgres["outside"]}
        connection_id = await create_connection(client, owner, form)
        provider.connection_id = connection_id
        with app.state.session_factory() as session:
            saved = session.get(DataConnection, connection_id)
            assert form["password"] not in saved.encrypted_credentials
            assert saved.encrypted_credentials.startswith("gAAAA")
            assert saved.created_by == "user-you"
        assert (await client.get(f"/api/connectors/postgresql/{connection_id}", headers=other)).status_code == 403

    async with client_for(create_app(settings, provider)) as client:
        path = f"/api/connectors/postgresql/{connection_id}"
        reload = await client.get(path, headers=owner)
        assert reload.json()["name"] == form["name"]
        visible = await client.get(f"{path}/schemas", headers=owner)
        assert visible.json()["items"] == [postgres["schema"]]
        tables = await client.get(f"{path}/tables", headers=owner, params={"search": "ORDER"})
        assert tables.json()["items"] == [{"schema_name": postgres["schema"], "name": "orders"}]
        table = f'{path}/tables/{postgres["schema"]}/orders'
        metadata = (await client.get(table, headers=owner, params={"preview": True, "limit": 1})).json()
        assert metadata["columns"][0] == {"name": "id", "data_type": "integer", "nullable": False, "primary_key": True}
        assert metadata["preview"]["rows"][0][:3] == [1, "Pump", "30.50"]

        async def query(statement, **kwargs):
            return await client.post(f"{path}/query", headers=owner, json={"sql": statement, **kwargs})

        schema = postgres["schema"]
        amount = await query(f"SELECT sum(total) AS revenue FROM {schema}.orders")
        assert amount.json()["rows"] == [["154.00"]]
        bounded = await query(f"SELECT id FROM {schema}.orders ORDER BY id", limit=2)
        assert bounded.json()["rows"] == [[1], [2]] and bounded.json()["truncated"] is True
        large = await query(f"SELECT product FROM {schema}.orders WHERE id=4")
        assert large.json()["rows"] == [] and large.json()["truncated"] is True
        window = await query(f"SELECT id % 3, row_number() OVER (ORDER BY id) FROM {schema}.orders ORDER BY id", limit=1)
        assert window.json()["rows"] == [[1, 1]]
        exact = await query("SELECT 99999999999999999999999999 AS amount")
        assert exact.json()["rows"] == [["99999999999999999999999999"]]
        assert (await query(f'SELECT * FROM {postgres["outside"]}.orders')).status_code == 403
        assert (await query(f"SELECT * FROM {schema}.hidden_view")).status_code == 404
        assert (await query(f"SELECT * FROM {schema}.orders FOR UPDATE")).status_code == 422
        timeout = await query(f"SELECT count(*) FROM {schema}.stress a CROSS JOIN {schema}.stress b CROSS JOIN {schema}.stress c")
        assert timeout.status_code == 504, timeout.text
        with psycopg.connect(os.environ["DSAI_TEST_POSTGRES_ADMIN_DSN"], autocommit=True) as admin:
            role = sql.Identifier(postgres["role"])
            table_id = sql.Identifier(schema, "orders")
            admin.execute(sql.SQL("GRANT UPDATE ON {} TO {}").format(table_id, role))
            try:
                too_permissive = await query(f"SELECT id FROM {schema}.orders")
                assert too_permissive.json()["error"]["code"] == "postgres_reader_required"
            finally:
                admin.execute(sql.SQL("REVOKE UPDATE ON {} FROM {}").format(table_id, role))

        edited = await client.patch(path, headers=owner, json={"enable_previews": False})
        assert edited.status_code == 200, edited.text
        assert (await client.get(table, headers=owner, params={"preview": True})).status_code == 403

        created = (await client.post("/api/chats", headers=owner, json={
            "content": "Calculate my sales revenue", "client_request_id": "bulk-sales", "connection_ids": [connection_id],
        })).json()
        assert created["message"]["connection_refs"] == [{"id": connection_id, "name": form["name"]}]
        chat = created["chat"]["id"]
        message = created["message"]["id"]
        steal = await client.post("/api/chats", headers=other, json={
            "content": "Calculate their revenue", "client_request_id": "steal-sales", "connection_ids": [connection_id],
        })
        assert steal.status_code == 404
        streamed = await client.post(f"/api/chats/{chat}/messages/stream", headers=owner, json={
            "model_id": provider.default_model_id, "user_message_id": message, "client_request_id": "sales-run",
        })
        assert "Live PostgreSQL revenue was 154.00" in streamed.text
        run_id = parse_sse(streamed.text)[0]["run_id"]
        retried = await client.post(f"/api/runs/{run_id}/retry/stream", headers=owner, json={"client_request_id": "sales-retry"})
        assert "Live PostgreSQL revenue was 154.00" in retried.text
        assert len(provider.attempts) == 2

        followup = (await client.post(f"/api/chats/{chat}/messages", headers=owner, json={
            "content": "Run again without a database", "client_request_id": "no-source",
        })).json()
        unselected = await client.post(f"/api/chats/{chat}/messages/stream", headers=owner, json={
            "model_id": provider.default_model_id, "user_message_id": followup["id"], "client_request_id": "no-source-run",
        })
        assert "No database selected." in unselected.text

        workspace = (await client.post("/api/workspaces", headers=owner, json={"name": "Sales workspace"})).json()
        workspace_connection = await create_connection(client, owner, {**form, "workspace_id": workspace["id"]})
        standalone = await client.get("/api/connectors/postgresql", headers=owner, params={"for_analysis": True})
        assert [item["id"] for item in standalone.json()["items"]] == [connection_id]
        permitted = await client.get("/api/connectors/postgresql", headers=owner, params={"for_analysis": True, "workspace_id": workspace["id"]})
        assert {item["id"] for item in permitted.json()["items"]} == {connection_id, workspace_connection}
        wrong_scope = await client.post(f"/api/chats/{chat}/messages", headers=owner, json={
            "content": "Attempt outside the saved workspace",
            "client_request_id": "wrong-workspace",
            "connection_ids": [workspace_connection],
        })
        assert wrong_scope.status_code == 403

        provider.started, provider.release = asyncio.Event(), asyncio.Event()
        next_message = (await client.post(f"/api/chats/{chat}/messages", headers=owner, json={
            "content": "Hold the first analysis", "client_request_id": "holding-message",
        })).json()
        stream = asyncio.create_task(client.post(f"/api/chats/{chat}/messages/stream", headers=owner, json={
            "model_id": provider.default_model_id, "user_message_id": next_message["id"], "client_request_id": "holding-run",
        }))
        try:
            await asyncio.wait_for(provider.started.wait(), timeout=5)
            runs = (await client.get(f"/api/chats/{chat}/runs", headers=owner)).json()["items"]
            running = next(run for run in runs if run["status"] == "running")
            queued = await client.post(f"/api/runs/{running['id']}/queue/with-files", headers=owner, data={
                "model_id": provider.default_model_id, "client_request_id": "postgres-queue",
                "content": "Summarize the original sales", "connection_ids": connection_id,
            }, files={"files": ("input.csv", b"sample\n1\n", "text/csv")})
            assert queued.status_code == 201, queued.text
            queued_record = queued.json()
            update_queue = await client.patch(f"/api/runs/{queued_record['run']['id']}/queue", headers=owner, json={
                "content": "Summarize all sales",
            })
            assert update_queue.json()["connection_ids"] == [connection_id]
        finally:
            provider.release.set()
            streamed_queue = await asyncio.wait_for(stream, timeout=10)
        assert "Live PostgreSQL revenue was 154.00" in streamed_queue.text
        assert len(provider.attempts) == 3

        assert (await client.post(f"{path}/refresh-schema", headers=owner)).status_code == 200
        assert (await client.delete(path, headers=owner)).status_code == 204
        assert (await client.get(path, headers=owner)).status_code == 404


@pytest.mark.live
async def test_live_gemini_postgres_and_chart(tmp_path, postgres):
    if os.environ.get("DSAI_TEST_LIVE_POSTGRES_AGENT") != "1":
        pytest.skip("Set DSAI_TEST_LIVE_POSTGRES_AGENT=1 to use Gemini and E2B credentials.")
    settings, headers, form = integration_settings(tmp_path, postgres)
    if not settings.gemini_api_key or not settings.e2b_api_key:
        pytest.skip("Gemini and E2B credentials are required.")
    headers = headers["owner"]
    async with client_for(create_app(settings)) as client:
        connection_id = await create_connection(client, headers, form)
        models = await client.get("/api/models", headers=headers)
        model = models.json()["default_model_id"]
        assert model, "An allowlisted Gemini model is required."
        created = await client.post("/api/chats", headers=headers, json={
            "content": (
                "Use the attached live PostgreSQL orders table. Discover the table and inspect its columns. "
                "Then use SQL to compute total revenue and monthly revenue. Report the precise total, "
                "and use the monthly totals to create a PNG bar chart saved under /home/user/outputs/."
            ),
            "client_request_id": "live-postgres-chat",
            "connection_ids": [connection_id],
        })
        assert created.status_code == 201, created.text
        ids = created.json()
        response = await client.post(f"/api/chats/{ids['chat']['id']}/messages/stream", headers=headers, json={
            "user_message_id": ids["message"]["id"], "model_id": model, "client_request_id": "live-postgres-run",
        }, timeout=100)
        events = parse_sse(response.text)
        completed_tools = {event["data"].get("name") for event in events if event["type"] == "tool.completed"}
        errors = [(event["type"], event["data"].get("error"))
                  for event in events if event["type"] in {"agent.failed", "tool.failed"}]
        assert {"list_database_tables", "describe_database_table", "query_database"} <= completed_tools, errors
        assert any(event["type"] == "artifact.created" for event in events), errors
        assert any(event["type"] == "agent.completed" for event in events), errors
        answer = next(event["data"]["content"] for event in events if event["type"] == "message.completed")
        assert "154" in answer


async def test_postgres_tool_auth_failure_is_persisted_at_its_step(tmp_path, postgres):
    from pydantic import SecretStr

    from app.connectors.service import ConnectionService
    from app.models import User

    class AuthFailureProvider(FakeProvider):
        async def stream_with_tools(self, messages, model_id, effort, tools, execute_tool, max_steps, *, tool_context):
            connection = tool_context["database_connections"][0]
            name = "query_database"
            args = {"connection_id": connection["connection_id"], "sql": f'SELECT count(*) FROM "{postgres["schema"]}".orders'}
            step = {"name": name, "tool_call_id": "postgres-auth-test", "turn": 2}
            yield ProviderEvent("tool.started", {**step, "arguments": args})
            result = await execute_tool(name, args)
            yield ProviderEvent("tool.failed", {**step, "output": result})
            yield ProviderEvent("message.delta", {"text": "The saved PostgreSQL login was refused."})

    settings, headers, form = integration_settings(tmp_path, postgres)
    owner = headers["owner"]
    app = create_app(settings, AuthFailureProvider())
    incorrect_password = secrets.token_urlsafe(24)
    async with client_for(app) as client:
        connection_id = await create_connection(client, owner, form)
        # Simulate stale saved credentials without changing any PostgreSQL role.
        service = ConnectionService(settings)
        with app.state.session_factory() as session:
            saved = session.get(DataConnection, connection_id)
            user = session.get(User, saved.created_by)
            credentials = service.credentials(saved).model_copy(update={"password": SecretStr(incorrect_password)})
            service.save(session, user, credentials, saved)

        created = (await client.post("/api/chats", headers=owner, json={
            "content": "Count orders", "client_request_id": "postgres-auth-chat", "connection_ids": [connection_id],
        })).json()
        response = await client.post(f"/api/chats/{created['chat']['id']}/messages/stream", headers=owner, json={
            "model_id": "gemini-test", "user_message_id": created["message"]["id"], "client_request_id": "postgres-auth-run",
        })
        assert response.status_code == 200
        events = parse_sse(response.text)
        started = next(event for event in events if event["type"] == "tool.started")
        failed = next(event for event in events if event["type"] == "tool.failed")
        error = failed["data"]["diagnostic"]
        assert error["component"] == "PostgreSQL" and error["category"] == "authentication"
        assert error["code"] == "postgres_auth_failed" and error["message"] == "Authentication failed"
        assert error["stage"] == "connect" and error["turn"] == 2 and error["retryable"] is False
        assert error["step_id"] == started["data"]["step_id"]
        assert incorrect_password not in response.text and postgres["password"] not in response.text
        persisted = (await client.get(f"/api/runs/{failed['run_id']}/events", headers=owner)).json()["items"]
        assert failed in persisted


@pytest.mark.asyncio
async def test_workflow_action_sql_validation_execution_and_reuse(tmp_path, postgres):
    settings, headers, form = integration_settings(tmp_path, postgres)
    provider = FakeProvider()
    app = create_app(settings=settings, provider=provider)
    root = "/api/workflow-store"
    async with client_for(app) as client:
        connection_id = await create_connection(client, headers["owner"], form)
        request = {"provider": "postgresql", "connection_id": connection_id, "instructions": "Find orders for Pump"}
        query = f'SELECT id, total FROM "{postgres["schema"]}".orders WHERE product = $1::text ORDER BY id'
        provider.chunks = [json.dumps({"status": "supported", "message": "Find matching orders.",
                                      "arguments": {"sql": query, "bindings": ["Pump"], "limit": 10}})]
        generated = (await client.post(f"{root}/actions/generate", headers=headers["owner"], json=request)).json()
        assert generated["status"] == "supported", generated
        assert postgres["password"] not in provider.calls[-1][0][0].content
        assert "ordered_at" in provider.calls[-1][0][0].content

        action = generated["action"]
        result = (await client.post(f"{root}/actions/test", headers=headers["owner"], json=action)).json()
        assert result["status"] == "passed", result
        assert result["result"]["column_types"] == ["integer", "numeric"]
        assert result["result"]["rows"] == [[1, "30.50"], [2, "52.25"]]
        applied = (await client.post(f"{root}/actions/apply", headers=headers["owner"],
                                     json={"action": action, "test_receipt": result["receipt"]})).json()
        assert applied["test_status"] == "passed"
        stale = {**action, "arguments": {**action["arguments"], "bindings": ["Valve"]}}
        assert (await client.post(f"{root}/actions/apply", headers=headers["owner"],
                                  json={"action": stale, "test_receipt": result["receipt"]})).json()["test_status"] == "untested"

        provider.chunks = [json.dumps({"status": "supported", "arguments": {"sql": "CREATE TABLE rogue (id int)"}})]
        denied = (await client.post(f"{root}/actions/generate", headers=headers["owner"], json=request)).json()
        assert denied["status"] == "unsupported" and denied["action"] is None
        direct = (await client.post(f"{root}/actions/generate", headers=headers["owner"],
                                    json={**request, "instructions": "SELECT 1", "model_id": "invalid-model"})).json()
        assert direct["status"] == "supported"
        unauthorized = (await client.post(f"{root}/actions/test", headers=headers["other"], json=action)).json()
        assert unauthorized["status"] == "failed"
        model_calls = len(provider.calls)
        body = {"name": "PostgreSQL workflow", "trigger": {"kind": "manual"}, "steps": [
            {"id": "query", "kind": "data", "title": "Orders", "detail": request["instructions"],
             "config": {"connection_id": connection_id, "connection_provider": "postgresql", "action": applied}},
        ]}
        saved = (await client.put(root, headers=headers["owner"], json=body)).json()
        assert (await client.get(f"{root}/{saved['id']}", headers=headers["owner"])).json()["steps"] == body["steps"]
        for suffix, payload in (("run", None), ("test", {"steps": body["steps"]})):
            run = (await client.post(f"{root}/{saved['id']}/{suffix}", headers=headers["owner"], json=payload)).json()
            for _ in range(100):
                run = (await client.get(f"{root}/runs/{run['id']}", headers=headers["owner"])).json()
                if run["status"] != "running":
                    break
                await asyncio.sleep(0.05)
            assert run["status"] == "success", run
            assert run["results"][0]["output"]["rows"] == result["result"]["rows"]
        assert len(provider.calls) == model_calls
