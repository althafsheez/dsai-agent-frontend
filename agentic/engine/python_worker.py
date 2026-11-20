import ctypes
import io
import sys
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from typing import Any, Dict, Optional


class WarmPythonWorker:
    """
    Persistent local Python execution session with warm state and
    hard timeout protection.
    
    Retains variables across calls within the session, captures stdout/stderr,
    and enforces a hard execution timeout (default 3.0 seconds).
    """

    def __init__(self, default_timeout: float = 3.0):
        self.default_timeout = default_timeout
        self._globals: Dict[str, Any] = {}
        self._lock = threading.Lock()
        self._init_warm_state()

    def _init_warm_state(self):
        """Pre-populate warm namespace with standard data science libraries."""
        warm_code = """
import sys
import math
import json
try:
    import pandas as pd
except ImportError:
    pass
try:
    import numpy as np
except ImportError:
    pass
try:
    import scipy
    import scipy.stats as stats
except ImportError:
    pass
"""
        self._globals = {
            "__name__": "__main__",
            "__builtins__": __builtins__,
        }
        try:
            exec(warm_code, self._globals)
        except Exception:
            pass

    def reset(self):
        """Reset the execution session back to clean warm state."""
        with self._lock:
            self._init_warm_state()

    def execute(self, code: str, timeout: Optional[float] = None) -> Dict[str, Any]:
        """
        Execute python code snippet in persistent warm session.
        Returns stdout, stderr, execution time in ms, and any error.
        Guarded by hard timeout.
        """
        timeout_val = timeout if timeout is not None else self.default_timeout
        start_time = time.perf_counter()

        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()
        worker_thread_id: Optional[int] = None
        thread_id_event = threading.Event()

        # Capture original stdout/stderr references
        orig_stdout = sys.stdout
        orig_stderr = sys.stderr

        def _custom_print(*args, **kwargs):
            if "file" not in kwargs or kwargs["file"] is None:
                kwargs["file"] = stdout_buf
            orig_stdout.write("")  # no-op check
            import builtins
            builtins.print(*args, **kwargs)

        def _target():
            nonlocal worker_thread_id
            worker_thread_id = threading.get_ident()
            thread_id_event.set()

            with self._lock:
                # Custom isolated print and sys references for worker thread
                worker_globals = self._globals.copy()
                worker_globals["print"] = _custom_print

                # Temporarily redirect sys.stdout/stderr during active execution
                sys.stdout = stdout_buf
                sys.stderr = stderr_buf
                try:
                    compiled = compile(code, "<agentic-worker>", "exec")
                    exec(compiled, self._globals)
                except Exception:
                    traceback.print_exc(file=stderr_buf)
                finally:
                    sys.stdout = orig_stdout
                    sys.stderr = orig_stderr

        executor = ThreadPoolExecutor(max_workers=1)
        future = executor.submit(_target)

        # Wait until thread id is captured or future finishes
        thread_id_event.wait(timeout=0.1)

        try:
            future.result(timeout=timeout_val)
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 3)
            executor.shutdown(wait=False)

            err = stderr_buf.getvalue()
            return {
                "stdout": stdout_buf.getvalue(),
                "stderr": err,
                "execution_time_ms": elapsed_ms,
                "error": err if err.strip() else None,
                "timed_out": False,
            }
        except TimeoutError:
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 3)

            # Ensure process stdout/stderr are immediately restored
            sys.stdout = orig_stdout
            sys.stderr = orig_stderr

            # Attempt to interrupt running thread via async exception
            if worker_thread_id is not None:
                try:
                    ctypes.pythonapi.PyThreadState_SetAsyncExc(
                        ctypes.c_ulong(worker_thread_id),
                        ctypes.py_object(TimeoutError),
                    )
                except Exception:
                    pass

            executor.shutdown(wait=False, cancel_futures=True)

            return {
                "stdout": stdout_buf.getvalue(),
                "stderr": stderr_buf.getvalue(),
                "execution_time_ms": elapsed_ms,
                "error": f"Execution timed out after {timeout_val} seconds",
                "timed_out": True,
            }
        except Exception as e:
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 3)
            sys.stdout = orig_stdout
            sys.stderr = orig_stderr
            executor.shutdown(wait=False)
            return {
                "stdout": stdout_buf.getvalue(),
                "stderr": stderr_buf.getvalue(),
                "execution_time_ms": elapsed_ms,
                "error": str(e),
                "timed_out": False,
            }
        finally:
            sys.stdout = orig_stdout
            sys.stderr = orig_stderr
