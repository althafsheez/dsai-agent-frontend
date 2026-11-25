"""The AI side of workflows: rephrase a prompt into a runnable plan, and write the Python for steps that need it."""
from __future__ import annotations

import logging
import uuid
from typing import Any

from agentic.runtime.contracts import LLMProvider, ProviderError

from .dashboard_ai import _ask, _schema_text
from .dashboard_script import ScriptError
from .dashboard_ai import write_script
from .workflow_engine import STEP_KINDS

log = logging.getLogger(__name__)

PLAN_RULES = (
    "You design small automations that run on a schedule against uploaded datasets. Reply with ONLY a JSON object: "
    '{"name": str (max 6 words), "description": str (one sentence), "prompt": str (the request rewritten clearly and specifically, '
    'naming the real columns), "steps": [step, ...]}. '
    'A step is {"kind": "data"|"script"|"ai"|"condition"|"notify", "title": str (max 5 words), "detail": str (what it does, one sentence), "config": object}. '
    "Use 2 to 6 steps. Start with one data step (config.dataset_ids is chosen later, leave it out). "
    "script = compute numbers or rankings with Python on the data; ai = write a short plain-language summary or recommendation; "
    'condition = continue only if the previous number passes a test (config {"operator": "greater"|"less"|"equals", "value": "<number>"}); '
    'notify = deliver the result to the owner (config {"recipient": "me"}). '
    "Prefer a script step for any number, an ai step for any wording, and end with notify. Never invent column names."
)


def _clean_steps(raw: Any) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict) or item.get("kind") not in STEP_KINDS:
            continue
        config = item.get("config") if isinstance(item.get("config"), dict) else {}
        steps.append({"id": f"s-{uuid.uuid4().hex[:8]}", "kind": item["kind"], "title": str(item.get("title") or item["kind"]).strip()[:60],
                      "detail": str(item.get("detail") or "").strip()[:800], "config": config})
    return steps[:8]


async def plan(provider: LLMProvider, prompt: str, datasets: list[dict[str, Any]], model_id: str, effort: str | None) -> dict[str, Any]:
    request = f"{PLAN_RULES}\n\nDatasets:\n{_schema_text(datasets)}\n\nUser request: {prompt}"
    try:
        data = await _ask(provider, request, model_id, effort)
    except (ProviderError, ValueError) as exc:
        raise ProviderError("workflow_ai_failed", f"The AI could not plan this workflow: {exc}") from exc
    steps = _clean_steps(data.get("steps"))
    if not steps:
        raise ProviderError("workflow_ai_failed", "The AI returned no usable steps. Try rephrasing the request.")
    if steps[0]["kind"] != "data":
        steps.insert(0, {"id": f"s-{uuid.uuid4().hex[:8]}", "kind": "data", "title": "Read the data", "detail": "Load the chosen datasets.", "config": {}})
    return {"name": str(data.get("name") or "New workflow")[:80], "description": str(data.get("description") or "")[:300],
            "prompt": str(data.get("prompt") or prompt)[:2000], "steps": steps}


async def rephrase(provider: LLMProvider, prompt: str, datasets: list[dict[str, Any]], model_id: str, effort: str | None) -> str:
    request = (
        'Rewrite this scheduled-task request so a data analyst could run it unattended: specific, naming the real columns, one short paragraph, no preamble. '
        'Reply with ONLY a JSON object {"prompt": str}.\n\n'
        f"Datasets:\n{_schema_text(datasets)}\n\nRequest: {prompt}"
    )
    try:
        data = await _ask(provider, request, model_id, effort)
    except (ProviderError, ValueError) as exc:
        raise ProviderError("workflow_ai_failed", f"The AI could not rephrase this: {exc}") from exc
    return str(data.get("prompt") or prompt)[:2000]


async def build_scripts(provider: LLMProvider, steps: list[dict[str, Any]], loaded: list[dict[str, Any]], model_id: str, effort: str | None) -> tuple[list[dict[str, Any]], list[str]]:
    """Writes (and test-runs on the real rows) a Python script for every script step that has none or whose description changed."""
    notes: list[str] = []
    built: list[dict[str, Any]] = []
    for step in steps:
        config = dict(step.get("config") or {})
        if step.get("kind") == "script" and (not config.get("script") or config.get("script_for") != step.get("detail")):
            try:
                script, result = await write_script(provider, step.get("detail") or step.get("title") or "Compute the key figures", step.get("title") or "Result", loaded, model_id, effort)
            except ScriptError as exc:
                notes.append(f"“{step.get('title')}”: {exc}")
            else:
                config.update(script=script, script_for=step.get("detail"))
                notes.append(f"“{step.get('title')}”: wrote a script ({result.get('kind')} result), tested on {sum(len(d['rows']) for d in loaded):,} rows")
        built.append({**step, "config": config})
    return built, notes
