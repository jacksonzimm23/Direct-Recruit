"""The result schema spine — every field a finished drill timing produces.

This is the structure all later phases fill in. Plan 2 emits a `DRAFT_SKELETON`
result (pipeline flowed, no ML yet) with every field present but null/empty;
Phases 3-9 populate the perception, timing, calibration, and anti-cheat fields.

Mirrors DRILL TIMING SPEC.md Phase 9 (JSON result) and Governance Rule 4
(engine_version: every stored time is traceable to the exact version that
measured it). Pure data + serialization — imports only stdlib, and reads library
versions defensively so this module works even if a heavy dep is broken/absent.
"""

from __future__ import annotations

import enum
import hashlib
import json
import platform
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional

import drill_timing


# --------------------------------------------------------------------------- #
# Enums — str-subclassed so asdict()+json serialize them to their value cleanly
# --------------------------------------------------------------------------- #
class Status(str, enum.Enum):
    VERIFIED = "VERIFIED"            # both methods agree, all gates pass
    REJECTED = "REJECTED"           # a gate failed (see reason_code)
    DRAFT = "DRAFT"                 # a partial real result (some phases ran)
    DRAFT_SKELETON = "DRAFT_SKELETON"  # Plan 2: pipeline flowed end-to-end, zero ML


class ReasonCode(str, enum.Enum):
    NONE = "NONE"                                    # not rejected / no reason
    ATHLETE_NOT_FOUND = "ATHLETE_NOT_FOUND"          # never locked an athlete (Phase 3)
    ATHLETE_LOST = "ATHLETE_LOST"                    # lock lost beyond coast (Phase 3/7)
    IDENTITY_UNCERTAIN = "IDENTITY_UNCERTAIN"        # can't confirm locked id (Phase 3/7)
    SHORT_TOUCH = "SHORT_TOUCH"                       # reach didn't reach line (Phase 4B)
    NO_FINISH_CROSS = "NO_FINISH_CROSS"              # torso didn't cross C (Phase 4B)
    BAD_GEOMETRY = "BAD_GEOMETRY"                     # turn lines not ~5yd (Phase 4B)
    DISTANCE_SHORT = "DISTANCE_SHORT"                # path under 20yd (Phase 4B)
    BAD_EVENT_SEQUENCE = "BAD_EVENT_SEQUENCE"        # != 2 clean reversals (Phase 5)
    LOW_CONFIDENCE_DISAGREEMENT = "LOW_CONFIDENCE_DISAGREEMENT"  # A vs B (Phase 7)

    # --- height measurement drill (drills/height) ---
    TIPPY_TOES = "TIPPY_TOES"                         # side view: floor-to-foot gap (Plan 3)
    FEET_NOT_VISIBLE = "FEET_NOT_VISIBLE"            # no valid feet-flat side view (Plan 3)
    TAPE_NOT_FOUND = "TAPE_NOT_FOUND"                # no measuring tape in frame (Plan 4)
    TAPE_UNREADABLE = "TAPE_UNREADABLE"             # ticks/numbers not legible (Plan 4)
    TAPE_CALIBRATION_FAILED = "TAPE_CALIBRATION_FAILED"  # tick spacing inconsistent (Plan 4)
    HEAD_TOP_NOT_FOUND = "HEAD_TOP_NOT_FOUND"        # pose can't locate crown (Plan 5)


# --------------------------------------------------------------------------- #
# Nested result fields — all default to null/empty for later phases to fill
# --------------------------------------------------------------------------- #
@dataclass
class Splits:
    """Per-segment times (seconds). Shuttle: 5 / 10 / 5 yards."""
    c_to_first_s: Optional[float] = None
    first_to_second_s: Optional[float] = None
    second_to_finish_s: Optional[float] = None


@dataclass
class AntiCheat:
    """Phase 4B anti-cheat verdicts."""
    per_touch_reach_yd: list = field(default_factory=list)  # reach at each turn line
    finish_cross: Optional[bool] = None
    total_distance_yd: Optional[float] = None


@dataclass
class HeightMeasurement:
    """Height drill (drills/height) output — README section 5. Null on every
    timing drill; filled by the measurement path. inches is primary; ft-in is the
    human format; cm is a stretch. Provenance ties the number to the tape read."""
    height_in: Optional[float] = None          # primary measurement, inches
    height_ft_in: Optional[str] = None         # formatted, e.g. "5'11\""
    height_cm: Optional[float] = None          # optional (tape shows cm too)
    face_snapshot: Optional[str] = None        # path to the face-next-to-tape image
    # tape-calibration provenance (the "ruler" that produced the number)
    pixels_per_inch: Optional[float] = None
    tape_reference_numbers: list = field(default_factory=list)  # OCR'd anchors used
    side_check_frame: Optional[int] = None     # frame index of the feet-flat check
    reading_frame: Optional[int] = None        # frame index of the head-top read


@dataclass
class PoseCoverage:
    """Pose-continuity verification (core/continuity.py) — the honest "was pose held
    through the whole run?" metric, integrated over MEDIA TIME and scoped to the
    active run (first confirmed pose .. last). Null on paths that don't compute it
    (e.g. continuity disabled, or a pre-lock reject). started=False means no pose was
    ever confirmed. Reported for inspection; coverage-as-reject is config-gated OFF
    until validated (governance)."""
    coverage_frac: Optional[float] = None
    run_from_s: Optional[float] = None
    run_to_s: Optional[float] = None
    n_gaps: Optional[int] = None
    worst_gap_s: Optional[float] = None
    started: Optional[bool] = None


@dataclass
class PredictedEvents:
    """The pipeline's PREDICTED event frames/times. Plan 4 adds this empty; the
    ML phases (Plan 5+) fill it. Mirrors ground_truth's frame+time pairs so the
    scoring script compares with pure subtraction (no re-decode). touch lists are
    sized to the drill's max touches (shuttle = 2)."""
    start_frame: Optional[int] = None
    start_time_s: Optional[float] = None
    touch_frames: list = field(default_factory=list)   # int|None per touch slot
    touch_times_s: list = field(default_factory=list)   # parallel to touch_frames
    finish_frame: Optional[int] = None
    finish_time_s: Optional[float] = None


@dataclass
class FpsInfo:
    """Phase 1 clip timing facts, copied verbatim from ClipInfo for the record."""
    nominal_fps: float
    frame_count: int
    is_vfr: bool
    timestamp_source: str
    duration_by_index_s: float
    duration_by_timestamps_s: float
    delta_mean_ms: float
    delta_stdev_ms: float
    width: int
    height: int

    @classmethod
    def from_clip_info(cls, info) -> "FpsInfo":
        return cls(
            nominal_fps=info.nominal_fps,
            frame_count=info.frame_count,
            is_vfr=info.is_vfr,
            timestamp_source=info.timestamp_source,
            duration_by_index_s=info.duration_by_index_s,
            duration_by_timestamps_s=info.duration_by_timestamps_s,
            delta_mean_ms=info.delta_mean_ms,
            delta_stdev_ms=info.delta_stdev_ms,
            width=info.width,
            height=info.height,
        )


# --------------------------------------------------------------------------- #
# engine_version — Governance Rule 4
# --------------------------------------------------------------------------- #
def _lib_versions() -> dict:
    """Read each library's __version__ defensively. A missing/broken dep yields
    null for that key and never raises — so the report works regardless."""
    versions: dict[str, Optional[str]] = {}
    for mod_name in ("cv2", "numpy", "scipy", "mediapipe", "torch", "ultralytics", "yaml"):
        try:
            mod = __import__(mod_name)
            versions[mod_name] = getattr(mod, "__version__", None)
        except Exception:  # ImportError, or a dep that throws on import
            versions[mod_name] = None
    return versions


def _config_hash(cfg: dict) -> str:
    """Deterministic, order-independent short hash of the loaded config.
    Binds every stored time to the exact config that measured it (Rule 4)."""
    payload = json.dumps(cfg, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:12]


def build_engine_version(cfg: dict) -> dict:
    """The version triplet stamped on every result (model + lib + config)."""
    return {
        "engine": drill_timing.__version__,
        "python": platform.python_version(),
        "libs": _lib_versions(),
        "config_hash": _config_hash(cfg),
    }


# --------------------------------------------------------------------------- #
# The top-level result
# --------------------------------------------------------------------------- #
@dataclass
class DrillResult:
    # --- identity / provenance (always present) ---
    engine_version: dict
    clip_path: str
    clip_name: str
    drill_name: str

    # --- verdict (Phase 9 core) ---
    status: Status = Status.DRAFT_SKELETON
    reason_code: ReasonCode = ReasonCode.NONE
    confidence: Optional[float] = None

    # --- timing (Phase 7) ---
    total_time_s: Optional[float] = None
    splits: Splits = field(default_factory=Splits)
    method_a_total_s: Optional[float] = None
    method_b_total_s: Optional[float] = None

    # --- predicted event frames/times (Phase 5+ fills; scored vs ground truth) ---
    predicted_events: PredictedEvents = field(default_factory=PredictedEvents)

    # --- perception / identity (Phase 2/3) ---
    athlete_track_id: Optional[int] = None
    detection_rate: Optional[float] = None   # frac of frames the athlete was detected
    pose_coverage: PoseCoverage = field(default_factory=PoseCoverage)  # continuity (mediapipe_roi)

    # --- field / gates (Phase 4 / 8) ---
    distance_gate_status: Optional[str] = None
    anti_cheat: AntiCheat = field(default_factory=AntiCheat)

    # --- measurement drills (height) — null on every timing drill ---
    height: HeightMeasurement = field(default_factory=HeightMeasurement)

    # --- clip metadata (Phase 1) ---
    fps_info: Optional[FpsInfo] = None

    def to_json_dict(self) -> dict:
        """Serializable dict. str-subclassed enums serialize to their value."""
        return asdict(self)

    @classmethod
    def skeleton(cls, clip_path: str, drill_name: str, cfg: dict,
                 max_touches: int = 0) -> "DrillResult":
        """Plan 2 factory: status=DRAFT_SKELETON, engine_version built, rest null.

        `max_touches` sizes predicted_events' touch lists to the drill's touch
        count (passed in, not the drill object, to avoid a result->drills cycle).
        """
        return cls(
            engine_version=build_engine_version(cfg),
            clip_path=str(clip_path),
            clip_name=Path(clip_path).name,
            drill_name=drill_name,
            status=Status.DRAFT_SKELETON,
            reason_code=ReasonCode.NONE,
            predicted_events=PredictedEvents(
                touch_frames=[None] * max_touches,
                touch_times_s=[None] * max_touches,
            ),
        )
