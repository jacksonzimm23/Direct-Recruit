"""failures.jsonl writer — the self-learning loop's memory.

Every non-VERIFIED run appends one JSON line: clip, status, reason_code, which
events were missing, fps summary, engine_version, timestamp. Session rule (spec
Phase 0): read failures.jsonl first, cluster by reason code, fix the most frequent
failure mode first.

Rule-0 safe: this writes the system's OWN diagnostic output (exactly like
report.py writes result JSON). It never reads ground_truth.json and imports no
scoring/ground-truth code. Lives in the package so run.py can call it.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

import drill_timing

log = logging.getLogger("drill_timing.failure_log")


def failures_path() -> Path:
    """Repo root / failures.jsonl (package-relative anchor, cwd-independent)."""
    return Path(drill_timing.__file__).resolve().parent.parent / "failures.jsonl"


def log_failure(record: dict, path: Optional[Path] = None) -> bool:
    """Append one JSON line for a non-VERIFIED run. Never raises (must not crash
    run.py). Returns True on success, False on any failure (logged as a warning).

    Stamps `timestamp` and `engine_version` if the caller didn't provide them.
    """
    try:
        p = Path(path) if path else failures_path()
        rec = dict(record)
        rec.setdefault("timestamp", datetime.now().isoformat(timespec="seconds"))
        rec.setdefault("engine_version", drill_timing.__version__)
        line = json.dumps(rec, default=str, ensure_ascii=False)
        with open(p, "a", encoding="utf-8") as f:
            f.write(line + "\n")
        return True
    except Exception as e:  # diagnostics must never break the pipeline
        log.warning("could not append to failures.jsonl: %s", e)
        return False
