"""Drill Timing Engine — times athletic field drills from phone video.

AI/ML is used only for perception (finding the athlete, lines, pose keypoints).
All timing is plain deterministic math on those outputs. See DRILL TIMING SPEC.md.
"""

# engine_version seed (Governance Rule 4): every produced result records the
# version that measured it, so a stored time is always traceable to its config.
__version__ = "0.1.0"
