"""Runs a short Python script that computes a chart nobody predefined.

When a request does not fit a preset chart type, the AI writes a script. The script gets the dataset rows as plain data, computes
whatever is asked, and sets `result` to a small chart description that the dashboard draws with its normal chart components.

How it is contained (this is a safety net for model-written code, not a general sandbox):
- the script is parsed first; imports are limited to a few pure standard-library modules, dunder access and dangerous names are refused;
- it runs in a separate `python -I` process with an empty environment, a temp working directory, CPU, memory and file-size limits and a
  wall-clock timeout, and its output is size-limited;
- the process gets the data on stdin and prints one JSON result; it never touches the app's database, files or secrets.
"""
from __future__ import annotations

import ast
import json
import subprocess
import sys
import tempfile
from typing import Any

ALLOWED_IMPORTS = {"math", "statistics", "collections", "datetime", "itertools", "re", "json", "functools", "heapq", "bisect", "decimal", "fractions", "string", "random"}
BLOCKED_NAMES = {"eval", "exec", "compile", "open", "input", "__import__", "globals", "locals", "vars", "getattr", "setattr", "delattr", "breakpoint", "exit", "quit", "help", "memoryview", "type", "dir", "super", "classmethod", "staticmethod", "property"}
BLOCKED_ATTRS = {"format", "format_map", "mro", "gi_frame", "f_globals", "f_locals", "tb_frame", "cr_frame", "ag_frame"}
KINDS = {"bar", "hbar", "line", "area", "pie", "radar", "funnel", "treemap", "histogram", "scatter", "table", "kpi", "gauge"}
MAX_SCRIPT = 6000
MAX_OUTPUT = 400_000
TIMEOUT_SECONDS = 8


class ScriptError(Exception):
    """The script was refused or failed; the message is safe to show and to feed back to the AI."""


def validate_script(script: str) -> None:
    if not script.strip():
        raise ScriptError("The script is empty.")
    if len(script) > MAX_SCRIPT:
        raise ScriptError(f"The script is longer than {MAX_SCRIPT} characters.")
    try:
        tree = ast.parse(script)
    except SyntaxError as exc:
        raise ScriptError(f"Syntax error on line {exc.lineno}: {exc.msg}") from exc
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] not in ALLOWED_IMPORTS:
                    raise ScriptError(f"Importing {alias.name} is not allowed. Allowed: {', '.join(sorted(ALLOWED_IMPORTS))}.")
        elif isinstance(node, ast.ImportFrom):
            if node.level or (node.module or "").split(".")[0] not in ALLOWED_IMPORTS:
                raise ScriptError(f"Importing from {node.module} is not allowed. Allowed: {', '.join(sorted(ALLOWED_IMPORTS))}.")
        elif isinstance(node, ast.Name) and (node.id in BLOCKED_NAMES or node.id.startswith("__")):
            raise ScriptError(f"Using {node.id} is not allowed.")
        elif isinstance(node, ast.Attribute) and (node.attr.startswith("_") or node.attr in BLOCKED_ATTRS):
            raise ScriptError(f"Accessing .{node.attr} is not allowed.")
        elif isinstance(node, (ast.Global, ast.Nonlocal)):
            raise ScriptError("global and nonlocal are not allowed.")


# Runs inside the child process. The script's builtins are a short allow-list; `import` only reaches the allowed modules.
_HARNESS = r'''
import sys, json, resource, builtins
resource.setrlimit(resource.RLIMIT_CPU, (6, 6))
resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
resource.setrlimit(resource.RLIMIT_NPROC, (1, 1)) if hasattr(resource, "RLIMIT_NPROC") else None
payload = json.loads(sys.stdin.read())
allowed = set(payload["allowed"])
real_import = builtins.__import__
def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    if level or name.split(".")[0] not in allowed:
        raise ImportError("import not allowed: " + name)
    return real_import(name, globals, locals, fromlist, level)
names = "abs all any bool dict divmod enumerate filter float frozenset int isinstance iter len list map max min next pow print range repr reversed round set slice sorted str sum tuple zip chr ord hex bin oct hash id callable ValueError TypeError KeyError IndexError ZeroDivisionError Exception StopIteration True False None".split()
safe = {n: getattr(builtins, n) for n in names if hasattr(builtins, n)}
safe["__import__"] = safe_import
safe["__build_class__"] = builtins.__build_class__
safe["__name__"] = "script"
def num(value):
    try:
        number = float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return number if number == number else None
datasets = payload["datasets"]
def col(dataset, name):
    index = dataset["columns"].index(name)
    return [row[index] if index < len(row) else None for row in dataset["rows"]]
scope = {"__builtins__": safe, "data": {item["id"]: item for item in datasets}, "datasets": datasets, "num": num, "col": col, "result": None}
exec(compile(payload["script"], "<dashboard script>", "exec"), scope)
sys.stdout.write(json.dumps(scope.get("result"), default=str))
'''


def _shape(raw: Any) -> dict[str, Any]:
    """Check and trim what the script returned so the dashboard can always draw it."""
    if not isinstance(raw, dict):
        raise ScriptError("The script must set `result` to a dict like {\"kind\": \"bar\", \"labels\": [...], \"series\": [...]}.")
    kind = str(raw.get("kind", "")).lower()
    if kind not in KINDS:
        raise ScriptError(f"`kind` must be one of {sorted(KINDS)}, got {raw.get('kind')!r}.")
    out: dict[str, Any] = {"kind": kind, "title": str(raw.get("title") or "")[:80]}

    def number(value: Any) -> float:
        try:
            result = float(value)
        except (TypeError, ValueError) as exc:
            raise ScriptError(f"Expected a number, got {value!r}.") from exc
        if result != result or result in (float("inf"), float("-inf")):
            raise ScriptError("Numbers must be finite.")
        return round(result, 4)

    if kind in ("kpi", "gauge"):
        if "value" not in raw:
            raise ScriptError(f"A {kind} result needs `value`.")
        out["value"] = number(raw["value"])
        if kind == "gauge":
            out["max"] = number(raw.get("max", 100))
        if raw.get("label"):
            out["label"] = str(raw["label"])[:60]
    elif kind == "scatter":
        points = raw.get("points")
        if not isinstance(points, list) or len(points) < 2:
            raise ScriptError("A scatter result needs `points`: a list of [x, y] pairs.")
        out["points"] = [[number(point[0]), number(point[1])] for point in points[:400]]
    elif kind == "table":
        columns, rows = raw.get("columns"), raw.get("rows")
        if not isinstance(columns, list) or not isinstance(rows, list):
            raise ScriptError("A table result needs `columns` (names) and `rows` (lists of cells).")
        out["columns"] = [str(column)[:40] for column in columns[:8]]
        out["rows"] = [[str(cell)[:60] for cell in row[:8]] for row in rows[:50] if isinstance(row, list)]
    else:
        labels, series = raw.get("labels"), raw.get("series")
        if not isinstance(labels, list) or not isinstance(series, list) or len(labels) != len(series) or len(series) < 2:
            raise ScriptError("A chart result needs `labels` and `series` lists of the same length (at least 2).")
        out["labels"] = [str(label)[:30] for label in labels[:60]]
        out["series"] = [number(value) for value in series[:60]]
    return out


def run_script(script: str, datasets: list[dict[str, Any]]) -> dict[str, Any]:
    """`datasets`: [{"id", "name", "columns": [names], "rows": [[...]]}]. Returns the shaped result or raises ScriptError."""
    validate_script(script)
    payload = json.dumps({"script": script, "datasets": datasets, "allowed": sorted(ALLOWED_IMPORTS)}, default=str)
    with tempfile.TemporaryDirectory(prefix="dsai-script-") as workdir:
        try:
            done = subprocess.run(
                [sys.executable, "-I", "-S", "-c", _HARNESS], input=payload, capture_output=True, text=True,
                timeout=TIMEOUT_SECONDS, cwd=workdir, env={},
            )
        except subprocess.TimeoutExpired as exc:
            raise ScriptError(f"The script took longer than {TIMEOUT_SECONDS} seconds.") from exc
    if done.returncode != 0:
        last = (done.stderr.strip().splitlines() or ["The script failed."])[-1]
        raise ScriptError(f"The script failed: {last[:300]}")
    if len(done.stdout) > MAX_OUTPUT:
        raise ScriptError("The script returned too much data.")
    try:
        return _shape(json.loads(done.stdout))
    except json.JSONDecodeError as exc:
        raise ScriptError("The script did not set `result` to JSON-friendly data.") from exc
