"""Model-asset resolution for vendored bundles that do NOT auto-download.

Ultralytics weights (`yolov8n*.pt`) auto-download to the repo root on first use, so
they need no help here. MediaPipe Tasks `.task` bundles, by contrast, have no
auto-download path — they must be vendored once into `<repo>/models/`. This module
resolves those paths repo-root-relatively (never cwd-dependent, like
`config.py` resolves config.yaml) and FAILS LOUD with a copy-pasteable download
command if a bundle is missing (Operating Principle: fail loud, never guess).
"""

from __future__ import annotations

from pathlib import Path

# Repo root = two levels up from this file (drill_timing/core/ -> repo root), the
# same place Ultralytics caches its .pt weights and where models/ lives.
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MODELS_DIR = _REPO_ROOT / "models"

# Canonical download URLs for the vendored MediaPipe bundles (one-time, offline
# thereafter). Surfaced verbatim in the fail-loud message so the operator can fetch
# the missing file without leaving the terminal.
TASK_URLS = {
    "pose_landmarker_full.task":
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
        "pose_landmarker_full/float16/latest/pose_landmarker_full.task",
    "hand_landmarker.task":
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
        "hand_landmarker/float16/latest/hand_landmarker.task",
}


def resolve_task(path_or_name: str) -> Path:
    """Resolve a `.task` path to an absolute Path under the repo.

    A bare filename (e.g. `models/pose_landmarker_full.task` or just the filename)
    is resolved relative to the repo root; an absolute path is used as-is.
    """
    p = Path(path_or_name)
    if p.is_absolute():
        return p
    # `models/foo.task` is repo-relative; a bare `foo.task` lands in models/.
    if p.parent == Path("."):
        return MODELS_DIR / p.name
    return _REPO_ROOT / p


def require_task(path_or_name: str) -> Path:
    """Return the resolved `.task` path, or raise FileNotFoundError if missing.

    The error names the file, the expected location, and the exact download URL,
    so a missing bundle surfaces as a clean, actionable fail-loud message (run.py
    catches FileNotFoundError and prints `ERROR: ...` with exit code 2 — no stack
    trace).
    """
    p = resolve_task(path_or_name)
    if p.is_file():
        return p
    url = TASK_URLS.get(p.name, "(no known URL — check the MediaPipe model docs)")
    raise FileNotFoundError(
        f"MediaPipe model bundle missing: {p.name}\n"
        f"  expected at: {p}\n"
        f"  download it once (offline thereafter) from:\n"
        f"    {url}\n"
        f"  PowerShell: Invoke-WebRequest -Uri '{url}' -OutFile '{p}'"
    )
