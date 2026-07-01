"""Drill plugins. Each drill lives in its OWN sub-folder here, holding its
definition (the package `__init__.py`, which self-registers via @register_drill)
plus its own data: drill_config.yaml, ground_truth.json, footage/, debug_out/,
testing.md, etc. The shared engine lives in `drill_timing/core/` and is reused by
every drill (spec Principle 8: one drill = one plugin, core is drill-agnostic).

`_ensure_loaded()` imports every drill sub-package once so the registry is
populated before `load_drill()` looks anything up.
"""

import importlib
import pkgutil
from pathlib import Path

_LOADED = False

# Per-drill data folders are created lazily by tools as needed.
_DATA_SUBDIRS = ("footage", "debug_out")


def _ensure_loaded() -> None:
    """Import every drill module/sub-package in this package once (idempotent)."""
    global _LOADED
    if _LOADED:
        return
    for mod in pkgutil.iter_modules(__path__):
        if mod.name.startswith("_") or mod.name == "base":
            continue
        importlib.import_module(f"{__name__}.{mod.name}")
    _LOADED = True


def drill_dir(drill_name: str) -> Path:
    """Folder holding a drill's definition + data (drills/<drill_name>/)."""
    return Path(__file__).resolve().parent / drill_name


def drill_ground_truth_path(drill_name: str) -> Path:
    """That drill's sealed-exam ground_truth.json (per-drill, Rule 0)."""
    return drill_dir(drill_name) / "ground_truth.json"


def drill_debug_out(drill_name: str) -> Path:
    """That drill's artifact output folder (created if missing)."""
    d = drill_dir(drill_name) / "debug_out"
    d.mkdir(parents=True, exist_ok=True)
    return d


def drill_config_path(drill_name: str) -> Path:
    """That drill's optional drill_config.yaml (drill-specific overrides)."""
    return drill_dir(drill_name) / "drill_config.yaml"
