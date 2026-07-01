"""Reusable config loader for the Drill Timing Engine.

Every later module reads its thresholds from `config.yaml` (Operating Principle 7:
config-driven, not hardcoded). This module centralizes locating and loading that
file. Resolution is package-relative (never cwd-dependent) and fail-loud: a missing
or malformed config raises rather than silently falling back to baked-in defaults.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import yaml

# drill_timing/config.yaml — one level up from this file's directory (core/).
_DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.yaml"

# Small cache keyed by resolved path so repeated loads don't re-read the file.
_CACHE: dict[Path, dict] = {}


def config_path(explicit: Optional[str] = None) -> Path:
    """Resolve the config file path. Fail loud if it does not exist.

    `explicit` (if given) wins; otherwise the package-default config.yaml is used.
    """
    p = Path(explicit).resolve() if explicit else _DEFAULT_CONFIG_PATH
    if not p.is_file():
        raise FileNotFoundError(f"config.yaml not found at: {p}")
    return p


def load_config(explicit: Optional[str] = None, *, use_cache: bool = True) -> dict:
    """Load and return the config as a dict. Fail loud on missing/malformed file.

    No defaults are injected — a missing key surfaces as a KeyError at the call
    site, which is the correct behavior for a config-driven system.
    """
    p = config_path(explicit)
    if use_cache and p in _CACHE:
        return _CACHE[p]
    with open(p, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    if not isinstance(cfg, dict):
        raise ValueError(f"config.yaml did not parse to a mapping: {p}")
    _CACHE[p] = cfg
    return cfg
