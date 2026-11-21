from __future__ import annotations
import json
import os
import time
import urllib.parse
import urllib.request
from typing import Any, Dict
from backend.tools.base import BaseTool


class WebSearchTool(BaseTool):
    """
    Search tool providing live web information retrieval.
    Prefers Tavily API if configured, with an automatic Wikipedia API fallback.
    """

    @property
    def name(self) -> str:
        return "web_search"

    @property
    def description(self) -> str:
        return "Search the web for external information, facts, definitions, or public references."

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query string",
                }
            },
            "required": ["query"],
        }

    def execute(self, query: str = "", **kwargs: Any) -> Dict[str, Any]:
        t0 = time.perf_counter()
        tavily_key = os.getenv("TAVILY_API_KEY") or os.getenv("DSAI_TAVILY_API_KEY")
        if tavily_key:
            try:
                req = urllib.request.Request(
                    "https://api.tavily.com/search",
                    data=json.dumps({"api_key": tavily_key, "query": query, "max_results": 3}).encode(),
                    headers={"Content-Type": "application/json"},
                )
                with urllib.request.urlopen(req, timeout=4) as resp:
                    data = json.loads(resp.read().decode())
                    elapsed = round((time.perf_counter() - t0) * 1000, 2)
                    return {"results": data.get("results", []), "execution_time_ms": elapsed}
            except Exception:
                pass

        try:
            encoded = urllib.parse.quote(query)
            search_url = f"https://en.wikipedia.org/w/api.php?action=opensearch&search={encoded}&limit=3&namespace=0&format=json"
            req = urllib.request.Request(search_url, headers={"User-Agent": "DSAIAgent/1.0"})
            with urllib.request.urlopen(req, timeout=4) as resp:
                data = json.loads(resp.read().decode())
                titles = data[1] if len(data) > 1 else []
                descriptions = data[2] if len(data) > 2 else []
                urls = data[3] if len(data) > 3 else []
                results = [{"title": t, "snippet": d, "url": u} for t, d, u in zip(titles, descriptions, urls)]
                if titles:
                    try:
                        sum_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(titles[0])}"
                        with urllib.request.urlopen(
                            urllib.request.Request(sum_url, headers={"User-Agent": "DSAIAgent/1.0"}), timeout=3
                        ) as s_resp:
                            s_data = json.loads(s_resp.read().decode())
                            if "extract" in s_data:
                                results[0]["extract"] = s_data["extract"]
                    except Exception:
                        pass
                elapsed = round((time.perf_counter() - t0) * 1000, 2)
                return {"results": results, "query": query, "execution_time_ms": elapsed}
        except Exception as e:
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            return {"error": str(e), "results": [], "execution_time_ms": elapsed}
