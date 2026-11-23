from agentic.agent.react_loop import _is_transient


class Err(Exception):
    def __init__(self, code):
        self.code = code


def test_transient_google_errors_are_retried() -> None:
    assert _is_transient(Err(503)) and _is_transient(Err(429))
    assert not _is_transient(Err(404)) and not _is_transient(ValueError("x"))
