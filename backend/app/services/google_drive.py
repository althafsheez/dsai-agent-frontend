"""Google Drive connector: OAuth (authorization-code flow), encrypted token storage, listing and import."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import Settings
from ..errors import APIError
from ..models import ConnectorConnection
from .resource_uploads import ALLOWED_EXTENSIONS

PROVIDER = "google-drive"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
FILES_URL = "https://www.googleapis.com/drive/v3/files"
SCOPES = ("openid", "email", "https://www.googleapis.com/auth/drive.readonly")
STATE_TTL_SECONDS = 600
MAX_IMPORT_BYTES = 25 * 1024 * 1024
FOLDER_MIME = "application/vnd.google-apps.folder"

# Google-native files cannot be downloaded as-is; they are exported to an equivalent normal file.
EXPORTS = {
    "application/vnd.google-apps.spreadsheet": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"),
    "application/vnd.google-apps.document": ("application/pdf", ".pdf"),
    "application/vnd.google-apps.presentation": ("application/pdf", ".pdf"),
}


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _require_configured(settings: Settings) -> str:
    if not settings.google_drive_configured:
        raise APIError(503, "connector_not_configured",
                       "Google Drive is not configured on the server. Set the Google client ID, secret and connector secret.")
    return settings.connector_secret or ""


def _cipher(secret: str) -> Fernet:
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest()))


def encrypt(settings: Settings, value: str) -> str:
    return _cipher(_require_configured(settings)).encrypt(value.encode()).decode()


def decrypt(settings: Settings, value: str) -> str:
    try:
        return _cipher(_require_configured(settings)).decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise APIError(409, "connector_reauth_required", "Stored credentials can no longer be read. Reconnect Google Drive.") from exc


def sign_state(settings: Settings, user_id: str) -> str:
    secret = _require_configured(settings)
    payload = _b64(json.dumps({"u": user_id, "n": secrets.token_hex(8), "e": int(time.time()) + STATE_TTL_SECONDS}).encode())
    signature = _b64(hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}"


def verify_state(settings: Settings, state: str) -> str:
    """Return the user id bound to a state value, or raise if it was forged or expired."""
    secret = _require_configured(settings)
    payload, _, signature = state.partition(".")
    expected = _b64(hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest())
    if not payload or not hmac.compare_digest(signature, expected):
        raise APIError(400, "invalid_state", "The sign-in request could not be verified. Start again.")
    try:
        data = json.loads(_unb64(payload))
    except ValueError as exc:
        raise APIError(400, "invalid_state", "The sign-in request could not be verified. Start again.") from exc
    if data.get("e", 0) < time.time():
        raise APIError(400, "state_expired", "The sign-in request expired. Start again.")
    return str(data["u"])


def authorization_url(settings: Settings, user_id: str) -> str:
    _require_configured(settings)
    query = urlencode({
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": sign_state(settings, user_id),
    })
    return f"{AUTH_URL}?{query}"


def get_connection(session: Session, user_id: str) -> ConnectorConnection | None:
    return session.scalar(select(ConnectorConnection).where(
        ConnectorConnection.user_id == user_id, ConnectorConnection.provider == PROVIDER))


def require_connection(session: Session, user_id: str) -> ConnectorConnection:
    connection = get_connection(session, user_id)
    if connection is None:
        raise APIError(409, "connector_not_connected", "Connect Google Drive first.")
    return connection


async def _token_request(client: httpx.AsyncClient, data: dict[str, str]) -> dict:
    try:
        response = await client.post(TOKEN_URL, data=data)
    except httpx.HTTPError as exc:
        raise APIError(502, "google_unreachable", "Could not reach Google. Try again.") from exc
    body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
    if response.status_code >= 400:
        if body.get("error") == "invalid_grant":
            raise APIError(401, "connector_reauth_required", "Google access was revoked or expired. Reconnect Google Drive.")
        raise APIError(502, "google_auth_failed", "Google rejected the sign-in request.")
    return body


async def complete_authorization(
    session: Session, settings: Settings, client: httpx.AsyncClient, *, user_id: str, code: str,
) -> ConnectorConnection:
    tokens = await _token_request(client, {
        "code": code,
        "client_id": settings.google_client_id or "",
        "client_secret": settings.google_client_secret or "",
        "redirect_uri": settings.google_redirect_uri,
        "grant_type": "authorization_code",
    })
    access = tokens.get("access_token")
    if not access:
        raise APIError(502, "google_auth_failed", "Google did not return an access token.")
    granted = str(tokens.get("scope", ""))
    if "drive.readonly" not in granted:
        raise APIError(403, "connector_scope_missing", "Google Drive read access was not granted.")
    email = None
    try:
        info = await client.get(USERINFO_URL, headers={"Authorization": f"Bearer {access}"})
        if info.status_code == 200:
            email = info.json().get("email")
    except httpx.HTTPError:
        pass  # The email is only a display label.
    connection = get_connection(session, user_id)
    refresh = tokens.get("refresh_token")
    if connection is None:
        if not refresh:
            raise APIError(502, "google_auth_failed", "Google did not return a refresh token. Remove the app from your Google account permissions and connect again.")
        connection = ConnectorConnection(user_id=user_id, provider=PROVIDER, access_token_enc="")
        session.add(connection)
    connection.account_email = email
    connection.scopes = granted
    connection.access_token_enc = encrypt(settings, access)
    if refresh:  # Google only sends a refresh token on first consent.
        connection.refresh_token_enc = encrypt(settings, refresh)
    connection.expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(tokens.get("expires_in", 3600)))
    session.commit()
    return connection


async def access_token(session: Session, settings: Settings, client: httpx.AsyncClient, connection: ConnectorConnection) -> str:
    expires = connection.expires_at
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires is not None and expires > datetime.now(timezone.utc) + timedelta(seconds=60):
        return decrypt(settings, connection.access_token_enc)
    if not connection.refresh_token_enc:
        session.delete(connection)
        session.commit()
        raise APIError(401, "connector_reauth_required", "Google access expired. Reconnect Google Drive.")
    try:
        tokens = await _token_request(client, {
            "refresh_token": decrypt(settings, connection.refresh_token_enc),
            "client_id": settings.google_client_id or "",
            "client_secret": settings.google_client_secret or "",
            "grant_type": "refresh_token",
        })
    except APIError as exc:
        if exc.code == "connector_reauth_required":
            session.delete(connection)
            session.commit()
        raise
    connection.access_token_enc = encrypt(settings, tokens["access_token"])
    connection.expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(tokens.get("expires_in", 3600)))
    session.commit()
    return tokens["access_token"]


async def disconnect(session: Session, settings: Settings, client: httpx.AsyncClient, connection: ConnectorConnection) -> None:
    token = None
    try:
        token = decrypt(settings, connection.refresh_token_enc or connection.access_token_enc)
    except APIError:
        pass
    session.delete(connection)
    session.commit()
    if token:
        try:  # Best effort: the local link is already gone either way.
            await client.post(REVOKE_URL, data={"token": token})
        except httpx.HTTPError:
            pass


async def _drive_get(client: httpx.AsyncClient, token: str, url: str, params: dict[str, str]) -> httpx.Response:
    try:
        response = await client.get(url, params=params, headers={"Authorization": f"Bearer {token}"})
    except httpx.HTTPError as exc:
        raise APIError(502, "google_unreachable", "Could not reach Google Drive. Try again.") from exc
    if response.status_code == 401:
        raise APIError(401, "connector_reauth_required", "Google access expired. Reconnect Google Drive.")
    if response.status_code == 404:
        raise APIError(404, "drive_file_not_found", "That Drive file or folder is not available.")
    if response.status_code == 403:
        raise APIError(403, "drive_forbidden", "Google Drive denied access to that item.")
    if response.status_code >= 400:
        raise APIError(502, "google_error", "Google Drive returned an error.")
    return response


def importable(mime_type: str, name: str, size: int | None) -> bool:
    if mime_type == FOLDER_MIME:
        return False
    if size is not None and size > MAX_IMPORT_BYTES:
        return False
    if mime_type in EXPORTS:
        return True
    if mime_type.startswith("application/vnd.google-apps."):
        return False
    return Path(name).suffix.lower() in ALLOWED_EXTENSIONS


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


async def list_files(
    client: httpx.AsyncClient, token: str, *, folder_id: str | None, query: str | None, page_token: str | None, page_size: int = 50,
) -> dict:
    clauses = ["trashed = false"]
    if query:
        clauses.append(f"name contains '{_escape(query)}'")  # Searches every folder.
    else:
        clauses.append(f"'{_escape(folder_id or 'root')}' in parents")
    params = {
        "q": " and ".join(clauses),
        "pageSize": str(page_size),
        "orderBy": "folder,name",
        "fields": "nextPageToken,files(id,name,mimeType,size,modifiedTime)",
        "supportsAllDrives": "true",
        "includeItemsFromAllDrives": "true",
    }
    if page_token:
        params["pageToken"] = page_token
    body = (await _drive_get(client, token, FILES_URL, params)).json()
    items = []
    for entry in body.get("files", []):
        size = int(entry["size"]) if entry.get("size") else None
        mime = entry.get("mimeType", "")
        items.append({
            "id": entry["id"],
            "name": entry.get("name", "Untitled"),
            "mime_type": mime,
            "is_folder": mime == FOLDER_MIME,
            "size_bytes": size,
            "modified_at": entry.get("modifiedTime"),
            "importable": importable(mime, entry.get("name", ""), size),
        })
    return {"items": items, "next_page_token": body.get("nextPageToken")}


async def download_file(client: httpx.AsyncClient, token: str, file_id: str) -> tuple[str, str, bytes, dict]:
    """Fetch a Drive file as ``(filename, content_type, bytes, drive_metadata)`` ready for ``register_upload``."""
    meta = (await _drive_get(client, token, f"{FILES_URL}/{file_id}", {
        "fields": "id,name,mimeType,size,modifiedTime", "supportsAllDrives": "true"})).json()
    name, mime = meta.get("name", "drive-file"), meta.get("mimeType", "")
    size = int(meta["size"]) if meta.get("size") else None
    if mime == FOLDER_MIME:
        raise APIError(422, "drive_folder", "Folders cannot be imported. Pick the files inside it.")
    if mime in EXPORTS:
        export_mime, suffix = EXPORTS[mime]
        filename = name if name.lower().endswith(suffix) else f"{name}{suffix}"
        response = await _drive_get(client, token, f"{FILES_URL}/{file_id}/export", {"mimeType": export_mime})
        content_type = export_mime
    elif mime.startswith("application/vnd.google-apps."):
        raise APIError(415, "unsupported_file", "This Google file type cannot be imported.")
    else:
        if Path(name).suffix.lower() not in ALLOWED_EXTENSIONS:
            raise APIError(415, "unsupported_file", "This file type is not supported.")
        if size is not None and size > MAX_IMPORT_BYTES:
            raise APIError(413, "file_too_large", "Files are limited to 25 MB.")
        response = await _drive_get(client, token, f"{FILES_URL}/{file_id}", {"alt": "media", "supportsAllDrives": "true"})
        filename, content_type = name, mime or "application/octet-stream"
    content = response.content
    if len(content) > MAX_IMPORT_BYTES:
        raise APIError(413, "file_too_large", "Files are limited to 25 MB.")
    return Path(filename).name, content_type, content, {"drive_file_id": file_id, "drive_modified_at": meta.get("modifiedTime")}
