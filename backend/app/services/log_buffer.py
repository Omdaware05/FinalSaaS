"""In-memory ring buffer of backend log lines for the Model Lab terminal.

Installed once from main.py; entries carry monotonically increasing ids
so the UI can poll with ?since_id=.
"""
import logging
import threading
from collections import deque
from datetime import datetime, timezone

_MAX = 500
_lock = threading.Lock()
_entries: deque[dict] = deque(maxlen=_MAX)
_counter = 0


class _BufferHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        global _counter
        try:
            message = record.getMessage()
        except Exception:
            return
        with _lock:
            _counter += 1
            _entries.append({
                "id": _counter,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "category": record.name,
                "level": record.levelname,
                "message": message[:2000],
            })


_installed = False


def install() -> None:
    global _installed
    if _installed:
        return
    handler = _BufferHandler(level=logging.INFO)
    logging.getLogger().addHandler(handler)
    _installed = True


def entries_since(since_id: int = 0) -> tuple[list[dict], int]:
    with _lock:
        items = [e for e in _entries if e["id"] > since_id]
        return items, len(_entries)


def clear() -> None:
    with _lock:
        _entries.clear()
