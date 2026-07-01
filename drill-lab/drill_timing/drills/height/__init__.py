"""Height Recognition — the second drill, and the first MEASUREMENT drill.

A static measurement, not a timed drill: read the athlete's standing height off a
real tape/wall measure that is physically in the frame (the tape *is* the
calibration). Same shared engine (ingest -> lock -> pose) and the same
"trustworthy or nothing" governance as the 5-10-5; only the final step differs —
swap "events/timing" for "read the in-frame ruler at the pose head-top". Full
spec + protocol: drills/height/README.md; runbook: drills/height/testing.md.

This plugin is declarative + holds the measurement hook. It declares
`kind = KIND_MEASUREMENT`, so the orchestrator runs the measurement path (ingest
-> lock -> pose, NO yard-grid calibration) and calls `measure()` instead of the
timing pipeline. PLAN 1 (this version) returns a skeleton measurement (all null)
so a height clip flows end-to-end and produces a result + annotated mp4 + JSON +
CSV. The real tape detection / OCR-tick calibration (Plan 4) and head-top reading
(Plan 5) fill it in later, behind the same hook.
"""

from __future__ import annotations

from drill_timing.core.result import HeightMeasurement, ReasonCode
from drill_timing.drills.base import (
    KIND_MEASUREMENT,
    DrillDefinition,
    RejectRule,
    register_drill,
)


@register_drill
class HeightDrill(DrillDefinition):
    kind = KIND_MEASUREMENT

    @property
    def name(self) -> str:
        return "height"

    @property
    def aliases(self) -> tuple[str, ...]:
        return ("height_measure", "standing_height")

    # Timing structure (lines/events/splits) stays empty — inherited from the base
    # defaults; a measurement drill has none. Reject rules ARE declared so they show
    # up in describe() / the clip report (README section 5 reject codes).
    def reject_rules(self) -> list[RejectRule]:
        return [
            RejectRule(ReasonCode.TIPPY_TOES,
                       "side view shows a gap floor-to-foot (heel/toe raised)"),
            RejectRule(ReasonCode.FEET_NOT_VISIBLE,
                       "can't confirm feet-flat from the side (no valid side view)"),
            RejectRule(ReasonCode.TAPE_NOT_FOUND,
                       "no measuring tape detected in frame"),
            RejectRule(ReasonCode.TAPE_UNREADABLE,
                       "tape ticks/numbers not legible enough to calibrate"),
            RejectRule(ReasonCode.TAPE_CALIBRATION_FAILED,
                       "reconstructed tick spacing inconsistent (bad read)"),
            RejectRule(ReasonCode.HEAD_TOP_NOT_FOUND,
                       "pose can't locate the top of the head"),
            RejectRule(ReasonCode.ATHLETE_NOT_FOUND,
                       "never locked the athlete being measured (shared lock)"),
            RejectRule(ReasonCode.IDENTITY_UNCERTAIN,
                       "can't confirm the locked person is the athlete (shared lock)"),
        ]

    def measure(self, perception: dict, cfg: dict) -> HeightMeasurement:
        """Turn the shared perception (locked athlete + pose) into a height.

        PLAN 1: skeleton only — returns an all-null HeightMeasurement so the clip
        flows end-to-end and the result schema carries the height block. Plans 4-5
        fill it: detect+read the tape (pixels_per_inch, reference numbers), read the
        tape value at the pose head-top, format ft-in, snapshot the face. Fails loud
        with a reason code (never a guessed number) when the tape can't be read or
        the head-top isn't found — that wiring lands with the real perception.
        """
        return HeightMeasurement()
