import os
from pathlib import Path
from dotenv import load_dotenv

# Resolution roots
AGENTIC_ROOT = Path(__file__).resolve().parent
SERVER_ROOT = AGENTIC_ROOT.parent
PROJECT_ROOT = SERVER_ROOT.parent

# Load environment configuration in priority order:
# 1. server/agentic/.env (local agentic workspace)
# 2. server/backend/.env (project backend config)
# 3. .env (repository root)
for env_path in [
    AGENTIC_ROOT / ".env",
    SERVER_ROOT / "backend" / ".env",
    PROJECT_ROOT / ".env",
]:
    if env_path.is_file():
        load_dotenv(env_path, override=False)


def get_gemini_api_key() -> str | None:
    """
    Resolve Gemini API key from environment or .env files.
    Supports GEMINI_API_KEY and DSAI_GEMINI_API_KEY aliases.
    """
    return os.getenv("GEMINI_API_KEY") or os.getenv("DSAI_GEMINI_API_KEY")


def get_gemini_model() -> str:
    """
    Resolve default Gemini model. Defaults to gemini-3.1-flash-lite for sub-5s ultra-low latency.
    """
    return os.getenv("GEMINI_MODEL") or os.getenv("DSAI_DEFAULT_MODEL_ID") or "gemini-3.1-flash-lite"
