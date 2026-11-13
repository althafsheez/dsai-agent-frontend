from __future__ import annotations

import os
from uuid import uuid4

import pytest

from app.agent.sandbox import E2BSandboxPool
from app.config import Settings


@pytest.mark.live
@pytest.mark.skipif(os.getenv("DSAI_LIVE_E2B") != "1", reason="Set DSAI_LIVE_E2B=1 to run")
async def test_real_e2b_upload_execute_and_download() -> None:
    settings = Settings()
    if not settings.e2b_api_key:
        pytest.skip("DSAI_E2B_API_KEY or E2B_API_KEY is not configured")
    pool = E2BSandboxPool(settings.e2b_api_key)
    run_id = f"smoke-{uuid4()}"
    try:
        path = await pool.upload_input(run_id, "values.csv", b"value\n20\n22\n")
        result = await pool.execute(run_id, (
            "import csv\n"
            f"with open({path!r}) as source:\n"
            "    total = sum(int(row['value']) for row in csv.DictReader(source))\n"
            "with open('/home/user/outputs/total.csv', 'w') as target:\n"
            "    target.write(f'total\\n{total}\\n')\n"
            "print(total)\n"
            "total\n"
        ), 30)
        assert result["success"], result
        assert result["stdout"].strip() == "42"
        assert result["text"].strip() == "42"
        assert any(item["name"] == "total.csv" for item in result["generated_files"])
        assert await pool.read_output_bytes(run_id, "/home/user/outputs/total.csv") == b"total\n42\n"
    finally:
        await pool.close(run_id)
