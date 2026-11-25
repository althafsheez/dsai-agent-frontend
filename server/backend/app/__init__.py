"""DSAI backend package."""

import sys
from pathlib import Path

# Uvicorn's app.main:app entry point adds server/backend/ to the import path.
# Include its parent so this entry point can also import the shared agentic package.
if __name__ == "app":
    server_root = str(Path(__file__).resolve().parents[2])
    if server_root not in sys.path:
        sys.path.insert(0, server_root)
