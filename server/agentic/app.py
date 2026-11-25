import json
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agentic.agent.react_loop import ReActAgent
from agentic.config import get_gemini_api_key, get_gemini_model
from agentic.engine.duckdb_engine import DuckDBEngine
from agentic.engine.python_worker import WarmPythonWorker

app = FastAPI(
    title="DSAI Agentic Sub-5s Engine",
    description="Phase 0 Agentic Architecture for sub-5s analytical latency",
    version="0.1.0",
)

# Enable CORS for local Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global warm worker and DuckDB instances for persistent session state
global_duckdb = DuckDBEngine()
global_worker = WarmPythonWorker()


class QueryRequest(BaseModel):
    query: str = Field(..., description="The natural language data query to execute")
    dataset_path: Optional[str] = Field(None, description="Local path to dataset file (CSV/Parquet)")


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "phase": 0,
        "duckdb": "in-process",
        "python_worker": "warm",
        "turn_budget": 2,
        "gemini_configured": bool(get_gemini_api_key()),
        "gemini_model": get_gemini_model(),
    }


@app.post("/api/query")
async def query_endpoint(req: QueryRequest):
    """
    Executes an analytical query through the 2-turn ReAct loop
    and streams progress, tool execution events, and final response via SSE.
    """
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    agent = ReActAgent(
        duckdb_engine=global_duckdb,
        python_worker=global_worker,
    )

    async def event_generator():
        try:
            async for event in agent.stream_query(query=req.query, dataset_path=req.dataset_path):
                yield f"data: {json.dumps(event, default=str)}\n\n"
        except Exception as e:
            err_event = {"type": "error", "content": f"Streaming failure: {str(e)}"}
            yield f"data: {json.dumps(err_event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("agentic.app:app", host="0.0.0.0", port=8000, reload=True)
