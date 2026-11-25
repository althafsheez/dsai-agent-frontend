"""Google Drive connector: OAuth, token storage, browsing and import against a fake Google."""
from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.config import Settings
from app.main import create_app
from app.models import ConnectorConnection
from app.services import google_drive as drive
from conftest import FakeProvider

CSV = b"region,revenue\nnorth,10\nsouth,20\n"
SHEET_MIME = "application/vnd.google-apps.spreadsheet"


class FakeGoogle:
    """Answers the handful of Google endpoints the connector calls and records every request."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.refresh_error: str | None = None
        self.files = {
            "csv1": {"id": "csv1", "name": "sales.csv", "mimeType": "text/csv", "size": str(len(CSV)), "modifiedTime": "2026-11-01T10:00:00Z"},
            "folder1": {"id": "folder1", "name": "Reports", "mimeType": drive.FOLDER_MIME},
            "exe1": {"id": "exe1", "name": "setup.exe", "mimeType": "application/octet-stream", "size": "10"},
            "sheet1": {"id": "sheet1", "name": "Budget", "mimeType": SHEET_MIME},
            "big1": {"id": "big1", "name": "huge.csv", "mimeType": "text/csv", "size": str(drive.MAX_IMPORT_BYTES + 1)},
        }

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        url = request.url
        if url.host == "oauth2.googleapis.com" and url.path == "/token":
            form = parse_qs(request.content.decode())
            if form["grant_type"] == ["refresh_token"]:
                if self.refresh_error:
                    return httpx.Response(400, json={"error": self.refresh_error})
                return httpx.Response(200, json={"access_token": "access-refreshed", "expires_in": 3600})
            if form["code"] == ["bad-code"]:
                return httpx.Response(400, json={"error": "invalid_grant"})
            return httpx.Response(200, json={
                "access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 3600,
                "scope": "openid email https://www.googleapis.com/auth/drive.readonly"})
        if url.path == "/v1/userinfo":
            return httpx.Response(200, json={"email": "analyst@example.com"})
        if url.path == "/revoke":
            return httpx.Response(200, json={})
        if url.path == "/drive/v3/files":
            return httpx.Response(200, json={"files": list(self.files.values()), "nextPageToken": "page-2"})
        file_id = url.path.removeprefix("/drive/v3/files/").removesuffix("/export")
        entry = self.files.get(file_id)
        if entry is None:
            return httpx.Response(404, json={})
        if url.path.endswith("/export"):
            return httpx.Response(200, content=b"PK-not-a-real-xlsx")
        if url.params.get("alt") == "media":
            return httpx.Response(200, content=CSV)
        return httpx.Response(200, json=entry)

    def calls(self, path: str) -> list[httpx.Request]:
        return [request for request in self.requests if request.url.path == path]


@pytest.fixture
def google() -> FakeGoogle:
    return FakeGoogle()


def make_settings(tmp_path, *, configured: bool) -> Settings:
    extra = {"google_client_id": "client-id", "google_client_secret": "client-secret", "connector_secret": "test-secret"} if configured else {"google_client_id": "", "google_client_secret": ""}
    return Settings(
        database_url=f"sqlite:///{tmp_path / 'drive.db'}", storage_root=tmp_path / "storage",
        auto_create_schema=True, cors_origins=["http://localhost:3000"], frontend_url="http://app.test", **extra)


@pytest_asyncio.fixture
async def drive_client(tmp_path, google: FakeGoogle) -> AsyncIterator[tuple[AsyncClient, object]]:
    http = httpx.AsyncClient(transport=httpx.MockTransport(google.handler))
    app = create_app(settings=make_settings(tmp_path, configured=True), provider=FakeProvider(), connector_http=http)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client, app


async def connect(client: AsyncClient, headers: dict[str, str]) -> httpx.Response:
    started = await client.post("/api/connectors/google-drive/authorize", headers=headers)
    assert started.status_code == 200, started.text
    state = parse_qs(urlparse(started.json()["authorization_url"]).query)["state"][0]
    return await client.get("/api/connectors/google-drive/callback", params={"code": "good", "state": state})


async def test_unconfigured_server_reports_unavailable(tmp_path, demo_headers) -> None:
    app = create_app(settings=make_settings(tmp_path, configured=False), provider=FakeProvider())
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            listing = (await client.get("/api/connectors/google-drive/status", headers=demo_headers)).json()["items"][0]
            assert listing["status"] == "unavailable" and listing["configured"] is False
            blocked = await client.post("/api/connectors/google-drive/authorize", headers=demo_headers)
            assert blocked.status_code == 503 and blocked.json()["error"]["code"] == "connector_not_configured"


async def test_authorize_url_carries_scope_and_signed_state(drive_client, demo_headers) -> None:
    client, app = drive_client
    response = await client.post("/api/connectors/google-drive/authorize", headers=demo_headers)
    url = urlparse(response.json()["authorization_url"])
    query = parse_qs(url.query)
    assert url.netloc == "accounts.google.com"
    assert query["client_id"] == ["client-id"] and query["access_type"] == ["offline"]
    assert "https://www.googleapis.com/auth/drive.readonly" in query["scope"][0]
    assert drive.verify_state(app.state.settings, query["state"][0]) == "user-you"


async def test_callback_stores_encrypted_tokens_and_marks_connected(drive_client, demo_headers, google) -> None:
    client, app = drive_client
    redirect = await connect(client, demo_headers)
    assert redirect.status_code == 303
    assert redirect.headers["location"] == "http://app.test/connectors?connected=google-drive"

    item = (await client.get("/api/connectors/google-drive/status", headers=demo_headers)).json()["items"][0]
    assert item["status"] == "connected" and item["account_email"] == "analyst@example.com"
    assert "access-1" not in json.dumps(item) and "refresh-1" not in json.dumps(item)

    with app.state.session_factory() as session:
        row = session.scalar(select(ConnectorConnection))
        assert row.access_token_enc != "access-1" and "refresh-1" not in (row.refresh_token_enc or "")
        assert drive.decrypt(app.state.settings, row.access_token_enc) == "access-1"
        assert drive.decrypt(app.state.settings, row.refresh_token_enc) == "refresh-1"


async def test_callback_rejects_forged_state_and_denied_consent(drive_client, demo_headers) -> None:
    client, _ = drive_client
    forged = await client.get("/api/connectors/google-drive/callback", params={"code": "good", "state": "abc.def"})
    assert forged.headers["location"] == "http://app.test/connectors?error=invalid_state"
    denied = await client.get("/api/connectors/google-drive/callback", params={"error": "access_denied"})
    assert denied.headers["location"] == "http://app.test/connectors?error=access_denied"
    started = await client.post("/api/connectors/google-drive/authorize", headers=demo_headers)
    state = parse_qs(urlparse(started.json()["authorization_url"]).query)["state"][0]
    bad = await client.get("/api/connectors/google-drive/callback", params={"code": "bad-code", "state": state})
    assert bad.headers["location"] == "http://app.test/connectors?error=connector_reauth_required"
    assert (await client.get("/api/connectors/google-drive/status", headers=demo_headers)).json()["items"][0]["status"] == "disconnected"


async def test_expired_state_is_rejected(drive_client) -> None:
    _, app = drive_client
    state = drive.sign_state(app.state.settings, "user-you")
    original = drive.time.time
    drive.time.time = lambda: original() + drive.STATE_TTL_SECONDS + 5
    try:
        with pytest.raises(drive.APIError) as caught:
            drive.verify_state(app.state.settings, state)
    finally:
        drive.time.time = original
    assert caught.value.code == "state_expired"


async def test_files_require_a_connection(drive_client, demo_headers) -> None:
    client, _ = drive_client
    response = await client.get("/api/connectors/google-drive/files", headers=demo_headers)
    assert response.status_code == 409 and response.json()["error"]["code"] == "connector_not_connected"


async def test_browse_marks_importable_files_and_scopes_query(drive_client, demo_headers, google) -> None:
    client, _ = drive_client
    await connect(client, demo_headers)
    root = (await client.get("/api/connectors/google-drive/files", headers=demo_headers)).json()
    flags = {item["name"]: item["importable"] for item in root["items"]}
    assert flags == {"sales.csv": True, "Reports": False, "setup.exe": False, "Budget": True, "huge.csv": False}
    assert next(item for item in root["items"] if item["name"] == "Reports")["is_folder"] is True
    assert root["next_page_token"] == "page-2"
    assert "'root' in parents" in google.calls("/drive/v3/files")[-1].url.params["q"]

    await client.get("/api/connectors/google-drive/files", headers=demo_headers, params={"folder_id": "folder1", "page_token": "p"})
    last = google.calls("/drive/v3/files")[-1].url.params
    assert "'folder1' in parents" in last["q"] and last["pageToken"] == "p"

    await client.get("/api/connectors/google-drive/files", headers=demo_headers, params={"q": "it's"})
    assert "name contains 'it\\'s'" in google.calls("/drive/v3/files")[-1].url.params["q"]
    assert "in parents" not in google.calls("/drive/v3/files")[-1].url.params["q"]


async def test_expired_access_token_is_refreshed(drive_client, demo_headers, google) -> None:
    client, app = drive_client
    await connect(client, demo_headers)
    with app.state.session_factory() as session:
        row = session.scalar(select(ConnectorConnection))
        row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        session.commit()
    assert (await client.get("/api/connectors/google-drive/files", headers=demo_headers)).status_code == 200
    assert google.calls("/drive/v3/files")[-1].headers["authorization"] == "Bearer access-refreshed"


async def test_revoked_refresh_token_forces_reconnect(drive_client, demo_headers, google) -> None:
    client, app = drive_client
    await connect(client, demo_headers)
    google.refresh_error = "invalid_grant"
    with app.state.session_factory() as session:
        session.scalar(select(ConnectorConnection)).expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        session.commit()
    response = await client.get("/api/connectors/google-drive/files", headers=demo_headers)
    assert response.status_code == 401 and response.json()["error"]["code"] == "connector_reauth_required"
    assert (await client.get("/api/connectors/google-drive/status", headers=demo_headers)).json()["items"][0]["status"] == "disconnected"


async def test_import_registers_dataset_and_is_idempotent(drive_client, demo_headers) -> None:
    client, _ = drive_client
    await connect(client, demo_headers)
    workspace = (await client.post("/api/workspaces", headers=demo_headers, json={"name": "Ops"})).json()
    body = {"file_ids": ["csv1"], "scope_type": "workspace", "scope_id": workspace["id"]}

    first = (await client.post("/api/connectors/google-drive/import", headers=demo_headers, json=body)).json()
    resource = first["imported"][0]["resource"]
    assert first["failed"] == [] and first["imported"][0]["already_imported"] is False
    assert resource["name"] == "sales.csv" and resource["resource_type"] == "dataset"

    again = (await client.post("/api/connectors/google-drive/import", headers=demo_headers, json=body)).json()
    assert again["imported"][0]["already_imported"] is True and again["imported"][0]["resource"]["id"] == resource["id"]

    datasets = (await client.get("/api/datasets", headers=demo_headers, params={"workspace_id": workspace["id"]})).json()
    assert [item["name"] for item in datasets["items"]] == ["sales.csv"]


async def test_import_reports_each_unimportable_file(drive_client, demo_headers) -> None:
    client, _ = drive_client
    await connect(client, demo_headers)
    workspace = (await client.post("/api/workspaces", headers=demo_headers, json={"name": "Ops"})).json()
    response = await client.post("/api/connectors/google-drive/import", headers=demo_headers, json={
        "file_ids": ["csv1", "folder1", "exe1", "big1", "missing"], "scope_type": "workspace", "scope_id": workspace["id"]})
    assert response.status_code == 200, response.text
    body = response.json()
    assert [item["file_id"] for item in body["imported"]] == ["csv1"]
    assert {item["file_id"]: item["code"] for item in body["failed"]} == {
        "folder1": "drive_folder", "exe1": "unsupported_file", "big1": "file_too_large", "missing": "drive_file_not_found"}


async def test_google_sheet_is_exported_as_xlsx(drive_client, demo_headers, google) -> None:
    client, _ = drive_client
    await connect(client, demo_headers)
    workspace = (await client.post("/api/workspaces", headers=demo_headers, json={"name": "Ops"})).json()
    response = await client.post("/api/connectors/google-drive/import", headers=demo_headers, json={
        "file_ids": ["sheet1"], "scope_type": "workspace", "scope_id": workspace["id"]})
    assert response.status_code == 200, response.text
    assert response.json()["imported"][0]["resource"]["name"] == "Budget.xlsx"
    assert "spreadsheetml" in google.calls("/drive/v3/files/sheet1/export")[0].url.params["mimeType"]


async def test_import_validates_scope_and_ownership(drive_client, demo_headers) -> None:
    client, _ = drive_client
    await connect(client, demo_headers)
    bad_scope = await client.post("/api/connectors/google-drive/import", headers=demo_headers, json={
        "file_ids": ["csv1"], "scope_type": "team", "scope_id": "x"})
    assert bad_scope.status_code == 422
    missing = await client.post("/api/connectors/google-drive/import", headers=demo_headers, json={
        "file_ids": ["csv1"], "scope_type": "workspace", "scope_id": "nope"})
    assert missing.status_code == 404
    empty = await client.post("/api/connectors/google-drive/import", headers=demo_headers, json={
        "file_ids": [], "scope_type": "workspace", "scope_id": "x"})
    assert empty.status_code == 422


async def test_connections_are_per_user(drive_client, demo_headers) -> None:
    client, _ = drive_client
    await connect(client, demo_headers)
    other = {"X-Demo-User-Id": "user-shared"}
    assert (await client.get("/api/connectors/google-drive/status", headers=other)).json()["items"][0]["status"] == "disconnected"
    assert (await client.get("/api/connectors/google-drive/files", headers=other)).status_code == 409


async def test_disconnect_removes_link_and_revokes_at_google(drive_client, demo_headers, google) -> None:
    client, app = drive_client
    await connect(client, demo_headers)
    assert (await client.delete("/api/connectors/google-drive", headers=demo_headers)).status_code == 204
    assert parse_qs(google.calls("/revoke")[0].content.decode())["token"] == ["refresh-1"]
    with app.state.session_factory() as session:
        assert session.scalar(select(ConnectorConnection)) is None
    assert (await client.delete("/api/connectors/google-drive", headers=demo_headers)).status_code == 204
