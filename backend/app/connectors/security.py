from __future__ import annotations

import ipaddress
import re
import socket
from collections.abc import Iterable
from urllib.parse import urlsplit

from fastapi import Request
from pglast import ast, parse_sql
from pglast.parser import ParseError
from pglast.stream import RawStream

from ..config import Settings
from ..errors import APIError
from .schemas import PostgresSettings

SAFE_FUNCTIONS = frozenset("""
    abs avg btrim ceil ceiling char_length coalesce concat concat_ws count date_part
    date_trunc dense_rank extract first_value floor greatest initcap lag last_value lead
    least left length lower ltrim max min mod now nullif percentile_cont percentile_disc
    power rank regexp_replace replace right round row_number rtrim split_part sqrt
    stddev stddev_pop stddev_samp strpos substring sum to_char trim trunc upper variance
    var_pop var_samp
""".split())
SAFE_TYPES = frozenset("""
    bool int2 int4 int8 float4 float8 numeric text varchar bpchar date time timetz
    timestamp timestamptz interval uuid
""".split())
SAFE_NODES = frozenset("""
    A_ArrayExpr A_Const A_Expr A_Indices A_Indirection A_Star Alias Boolean
    BooleanTest CaseExpr CaseWhen CoalesceExpr ColumnRef CommonTableExpr Float FuncCall
    GroupingFunc GroupingSet Integer JoinExpr MinMaxExpr NullTest RangeSubselect RangeVar
    ResTarget RowExpr SelectStmt SortBy SQLValueFunction String SubLink TypeCast TypeName
    WindowDef WithClause BoolExpr
""".split())
SAFE_OPERATORS = frozenset("= <> != < > <= >= + - * / % ^ || ~~ !~~ ~~* !~~*".split())
SYSTEM_SCHEMAS = {"information_schema"}
LOCAL_ENVIRONMENTS = {"development", "test"}
LOCAL_CONNECTOR_OWNER = "user-you"


def require_local_postgres(settings: Settings, user_id: str) -> None:
    if settings.environment not in LOCAL_ENVIRONMENTS or user_id != LOCAL_CONNECTOR_OWNER:
        raise APIError(403, "postgres_local_only", "PostgreSQL is available only to the local demo user.")


def _loopback(host: str | None) -> bool:
    try:
        address = ipaddress.ip_address(host or "")
    except ValueError:
        return False
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        return address.ipv4_mapped.is_loopback
    return address.is_loopback


def _local_host(url: str) -> bool:
    try:
        parsed = urlsplit(url)
        host = parsed.hostname
    except ValueError:
        return False
    return parsed.username is None and (host == "localhost" or _loopback(host))


async def protect_local_connector_api(request: Request) -> None:
    settings: Settings = request.app.state.settings
    path = request.scope["path"]
    is_connector = path == "/api/connectors/postgresql" or path.startswith("/api/connectors/postgresql/")
    # Local chat history and persisted run IDs also grant access to connector data.
    local_backend = settings.environment in LOCAL_ENVIRONMENTS and settings.connector_encryption_key
    if not is_connector and not (local_backend and path.startswith("/api/")):
        return
    if (
        settings.environment not in LOCAL_ENVIRONMENTS
        or request.client is None
        or not _loopback(request.client.host)
        or not _local_host("//" + request.headers.get("host", ""))
        or "forwarded" in request.headers
        or any(not _loopback(host.strip()) for value in request.headers.getlist("x-forwarded-for") for host in value.split(","))
        or any(not _local_host("//" + host.strip()) for value in request.headers.getlist("x-forwarded-host") for host in value.split(","))
        or any(not _local_host(origin) for origin in request.headers.getlist("origin"))
    ):
        raise APIError(403, "postgres_local_only", "Use PostgreSQL from a local development or test backend.")


def application_schema(name: str) -> bool:
    return name not in SYSTEM_SCHEMAS and not name.startswith("pg_")


def resolve_target(data: PostgresSettings, settings: Settings) -> str:
    host = data.host.lower()
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is None and not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", host):
        raise APIError(422, "invalid_postgres_host", "Enter one PostgreSQL hostname or IP address.")
    target = f"{host}:{data.port}"
    private_ranges = settings.postgres_private_targets.get(target, [])
    local_fixture = (
        settings.environment == "test" and literal is not None and literal.is_loopback
        and target in settings.postgres_allowed_targets
    )
    if data.ssl_mode != "verify-full" and not local_fixture:
        raise APIError(422, "postgres_tls_required", "PostgreSQL connections require verified TLS.")
    try:
        addresses = {ipaddress.ip_address(info[4][0]) for info in socket.getaddrinfo(
            host, data.port, type=socket.SOCK_STREAM
        )}
    except OSError:
        raise APIError(502, "postgres_unreachable", "The PostgreSQL host could not be resolved.") from None
    if not addresses:
        raise APIError(502, "postgres_unreachable", "The PostgreSQL host could not be resolved.")

    def permitted(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
        if isinstance(address, ipaddress.IPv6Address):
            if address.ipv4_mapped or address.sixtofour or address.teredo or address.scope_id:
                return False
        if address.is_loopback:
            return local_fixture
        if address.is_link_local or address.is_multicast or address.is_unspecified or address.is_reserved:
            return False
        if private_ranges:
            return any(address in network for network in private_ranges)
        return address.is_global

    if not all(permitted(address) for address in addresses):
        raise APIError(403, "postgres_target_forbidden", "The PostgreSQL host resolved to an unapproved network.")
    # libpq connects to this exact address while verifying the certificate against host.
    return str(sorted(addresses, key=lambda address: (address.version, int(address)))[0])


def _reject() -> None:
    raise APIError(422, "unsafe_postgres_query", "Use one supported read-only SELECT with schema-qualified tables and approved built-in functions.")


def _strings(values: Iterable[ast.String] | None) -> tuple[str, ...]:
    return tuple(value.sval for value in values or ())


def validate_sql(sql: str, schemas: set[str]) -> tuple[str, set[tuple[str, str]]]:
    try:
        statements = parse_sql(sql)
    except (ParseError, ValueError, UnicodeError):
        raise APIError(422, "invalid_postgres_sql", "Enter valid PostgreSQL SELECT syntax.") from None
    if len(statements) != 1 or not isinstance(statements[0].stmt, ast.SelectStmt):
        _reject()

    relations: set[tuple[str, str]] = set()

    def visit(node: object, ctes: frozenset[str]) -> None:
        if isinstance(node, tuple):
            for child in node:
                visit(child, ctes)
            return
        if not isinstance(node, ast.Node):
            return
        if type(node).__name__ not in SAFE_NODES:
            _reject()
        if isinstance(node, ast.SelectStmt):
            if node.intoClause or node.lockingClause:
                _reject()
            if node.withClause:
                if node.withClause.recursive:
                    _reject()
                for cte in node.withClause.ctes:
                    visit(cte, ctes)
                    ctes = ctes | {cte.ctename}
        if isinstance(node, ast.RangeVar):
            if node.catalogname or (not node.schemaname and node.relname not in ctes):
                _reject()
            if node.schemaname:
                if node.schemaname not in schemas or not application_schema(node.schemaname):
                    raise APIError(403, "postgres_schema_forbidden", "The query references a schema outside this connection.")
                relations.add((node.schemaname, node.relname))
                node.inh = False
        if isinstance(node, ast.FuncCall):
            name = _strings(node.funcname)
            if len(name) not in (1, 2) or name[-1] not in SAFE_FUNCTIONS or (len(name) == 2 and name[0] != "pg_catalog"):
                _reject()
        if isinstance(node, ast.TypeName):
            name = _strings(node.names)
            if len(name) not in (1, 2) or name[-1] not in SAFE_TYPES or (len(name) == 2 and name[0] != "pg_catalog"):
                _reject()
        if isinstance(node, ast.A_Expr) and any(op not in SAFE_OPERATORS for op in _strings(node.name)):
            _reject()
        if isinstance(node, ast.SortBy) and node.useOp:
            _reject()
        if isinstance(node, ast.CommonTableExpr) and not isinstance(node.ctequery, ast.SelectStmt):
            _reject()
        for attr in node:
            if attr != "withClause":
                visit(getattr(node, attr), ctes)

    try:
        visit(statements[0].stmt, frozenset())
        return RawStream()(statements[0].stmt), relations
    except RecursionError:
        raise APIError(422, "invalid_postgres_sql", "The query is too deeply nested.") from None
