"""5-10-5 Pro-Agility Shuttle — the first drill (DRILL TIMING SPEC.md Section 5).

Declarative only: layout, event sequence, splits, and reject rules. No detection
logic and no thresholds — yard tolerances live in config.yaml (anti_cheat,
field_calibration). Later phases consume this structure; they don't live here.

Layout: three lines 5 yards apart — L (left), C (center/start), R (right). The
athlete straddles C. Canonical sequence: onset @ C -> reversal (touch first turn
line, 5yd) -> reversal (touch far line, 10yd across) -> torso crosses back through
C (clock stops). Exactly two reversals; total 20 yd; splits 5 / 10 / 5.

HAND-TOUCH RULE (non-negotiable): each turn-line touch must be made with a HAND
(lowest fingertip reaching the line within touch_tolerance_yd; fingers count). A
foot at the line does NOT count -> SHORT_TOUCH. A valid hand touch is required at
BOTH turn lines or the rep is invalid. The total time is onset -> finish-cross
only; the hand touches are a validity gate, not timing events. Reach point keypoint
and the both-lines requirement come from config (anti_cheat.touch_keypoint,
anti_cheat.require_hand_touch_both_lines).
"""

from __future__ import annotations

from drill_timing.core.result import ReasonCode
from drill_timing.drills.base import (
    DrillDefinition,
    EventSpec,
    LineSpec,
    RejectRule,
    SplitSpec,
    register_drill,
)


@register_drill
class Shuttle5_10_5(DrillDefinition):
    @property
    def name(self) -> str:
        return "shuttle_5_10_5"

    @property
    def aliases(self) -> tuple[str, ...]:
        return ("shuttle", "5-10-5", "pro_agility")

    def expected_line_layout(self) -> list[LineSpec]:
        return [
            LineSpec("L", "turn", -5.0),
            LineSpec("C", "start_finish", 0.0),
            LineSpec("R", "turn", +5.0),
        ]

    def expected_event_sequence(self) -> list[EventSpec]:
        # onset -> reversal -> reversal -> final center-cross (exactly two reversals)
        return [
            EventSpec("onset", "C", "clock starts: committed first step off center"),
            EventSpec("reversal", "L|R", "touch first turn line (5 yd)"),
            EventSpec("reversal", "L|R", "touch far turn line (10 yd across)"),
            EventSpec("center_cross", "C", "torso fully crosses C: clock stops"),
        ]

    def split_definitions(self) -> list[SplitSpec]:
        return [
            SplitSpec("c_to_first", "onset", "reversal_1", 5.0),
            SplitSpec("first_to_second", "reversal_1", "reversal_2", 10.0),
            SplitSpec("second_to_finish", "reversal_2", "center_cross", 5.0),
        ]

    def reject_rules(self) -> list[RejectRule]:
        return [
            RejectRule(ReasonCode.BAD_EVENT_SEQUENCE,
                       "not exactly 2 clean velocity reversals"),
            RejectRule(ReasonCode.SHORT_TOUCH,
                       "hand/fingertip didn't reach a turn line in real yards "
                       "(includes foot-only touches — a foot at the line does not count)"),
            RejectRule(ReasonCode.BAD_GEOMETRY,
                       "turn lines not ~5 yd either side of center"),
            RejectRule(ReasonCode.NO_FINISH_CROSS,
                       "torso never fully crossed C at the finish"),
            RejectRule(ReasonCode.DISTANCE_SHORT,
                       "reconstructed path materially under 20 yd"),
            RejectRule(ReasonCode.ATHLETE_LOST,
                       "athlete left frame / lock lost during a touch"),
        ]
