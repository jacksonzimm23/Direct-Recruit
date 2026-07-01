"""DrillDefinition interface + a tiny plugin registry.

Operating Principle 8 (one drill = one plugin): the core pipeline
(detect -> track -> pose -> events) is drill-agnostic. A drill supplies only a
small *declarative* definition — its expected line layout, event sequence, split
definitions, and reject rules. Adding a drill is dropping a file in `drills/`;
core code never imports a specific drill.

This file defines the abstract `DrillDefinition` plus the spec data types its
methods return, and a decorator-based registry so `run.py --drill <name>`
resolves a plugin by name/alias without core knowing the drill exists.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass
from typing import Optional

from drill_timing.core.result import ReasonCode


# --------------------------------------------------------------------------- #
# Declarative descriptors a drill returns (data only, no logic)
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class LineSpec:
    key: str            # e.g. "L" | "C" | "R"
    role: str           # "turn" | "start_finish"
    offset_yd: float    # signed yards from the center/start line: -5.0, 0.0, +5.0


@dataclass(frozen=True)
class EventSpec:
    kind: str                 # "onset" | "reversal" | "center_cross"
    at_line: Optional[str]    # "C" | "L|R" | None
    note: str


@dataclass(frozen=True)
class SplitSpec:
    key: str            # "c_to_first" | "first_to_second" | "second_to_finish"
    from_event: str
    to_event: str
    expected_yd: float  # 5 / 10 / 5


@dataclass(frozen=True)
class RejectRule:
    reason_code: ReasonCode
    description: str


# Drill kinds. A *timing* drill produces a time from a sequence of field events
# (5-10-5). A *measurement* drill produces a static measurement read off an
# in-frame ruler (height) — same ingest/lock/pose, but no yard-grid timing path.
KIND_TIMING = "timing"
KIND_MEASUREMENT = "measurement"


# --------------------------------------------------------------------------- #
# The interface
# --------------------------------------------------------------------------- #
class DrillDefinition(abc.ABC):
    """A drill plugin. Returns declarative structure; holds no detection logic.

    Two kinds (Principle 8 — the core stays drill-agnostic; the drill declares its
    shape): a *timing* drill supplies the event/line/split structure below; a
    *measurement* drill leaves those empty and implements `measure()` instead. The
    four timing methods are concrete (not abstract) so a measurement drill is not
    forced to stub them — it just declares `kind = KIND_MEASUREMENT`.
    """

    # Default kind is timing, so every existing drill (the shuttle) is unchanged.
    kind: str = KIND_TIMING

    @property
    @abc.abstractmethod
    def name(self) -> str:
        """Canonical name, e.g. 'shuttle_5_10_5'."""

    @property
    @abc.abstractmethod
    def aliases(self) -> tuple[str, ...]:
        """Alternate names the CLI accepts, e.g. ('shuttle',)."""

    # --- timing-drill structure (empty by default for measurement drills) ---
    def expected_line_layout(self) -> list[LineSpec]:
        return []

    def expected_event_sequence(self) -> list[EventSpec]:
        return []

    def split_definitions(self) -> list[SplitSpec]:
        return []

    def reject_rules(self) -> list[RejectRule]:
        return []

    # --- measurement-drill hook -------------------------------------------- #
    def measure(self, perception: dict, cfg: dict):
        """Measurement drills (kind == KIND_MEASUREMENT) override this to turn the
        shared perception (locked athlete, pose keypoints, frames) into a static
        measurement result. Timing drills never call it. Returns a drill-defined
        object the orchestrator folds into the DrillResult. Default raises so a
        mis-declared drill fails loud rather than silently producing nothing."""
        raise NotImplementedError(
            f"drill '{self.name}' is kind={self.kind} but does not implement measure()"
        )

    def describe(self) -> dict:
        """A plain-dict summary for the clip report / JSON."""
        return {
            "name": self.name,
            "kind": self.kind,
            "aliases": list(self.aliases),
            "lines": [vars(x) for x in self.expected_line_layout()],
            "events": [vars(x) for x in self.expected_event_sequence()],
            "splits": [vars(x) for x in self.split_definitions()],
            "rejects": [
                {"reason_code": r.reason_code.value, "description": r.description}
                for r in self.reject_rules()
            ],
        }


# --------------------------------------------------------------------------- #
# Registry / loader (Principle 8)
# --------------------------------------------------------------------------- #
_REGISTRY: dict[str, type[DrillDefinition]] = {}


def register_drill(cls: type[DrillDefinition]) -> type[DrillDefinition]:
    """Class decorator: register a drill under its name + every alias."""
    inst = cls()
    for key in (inst.name, *inst.aliases):
        _REGISTRY[key.lower()] = cls
    return cls


def load_drill(name: str) -> DrillDefinition:
    """Resolve a drill by name or alias. Fail loud on unknown."""
    from drill_timing import drills  # local import to avoid a cycle at module load
    drills._ensure_loaded()
    cls = _REGISTRY.get(name.lower())
    if cls is None:
        known = sorted(_REGISTRY)
        raise KeyError(f"unknown drill '{name}'. known drills/aliases: {known}")
    return cls()


def known_drills() -> list[str]:
    return sorted(_REGISTRY)
