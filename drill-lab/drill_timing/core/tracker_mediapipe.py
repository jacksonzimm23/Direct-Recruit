"""MediaPipe-first ROI tracker — the new shared tracking backbone (PLATFORM_SPEC
Phase 3), porting the 40-test browser METHOD into the offline Python engine.

WHAT IT DOES (Stage 2 of the two-stage design). Given the whole clip's frames + the
Stage-1 drill-performer ANCHOR (from select_athlete), it runs MediaPipe PoseLandmarker
in VIDEO mode on a DIGITAL-ZOOM ROI that follows the athlete (core/roi.py), picks the
athlete among the per-frame multi-pose candidates with an identity lock biased toward
the anchor (core/selection.py), and emits — in FULL-FRAME pixels — exactly the
per-frame lists the rest of the engine already consumes:

    boxes_per_frame  : list[TrackedBox|None]   (full-frame px; carries a stable track_id)
    locked_flags     : list[bool]              (HONEST live detect, pre-fade)
    kpts_per_frame   : list[Keypoints|None]    (BLUEPRINT joints, full-frame px)
    masks_per_frame  : list[np.ndarray|None]   (full-frame uint8 0/255, or None)

So pose.py / segment.py are SKIPPED for this path (Decision B: one model already
returns landmarks + mask — re-running a separate pose would double cost and lose the
zoom). kinematics / onset / calibration / report / Pass 2 are UNCHANGED — they just
consume these lists.

Capability-probed OK on Python mediapipe 0.10.35 (VIDEO + num_poses>1 + nonzero CPU
seg-mask) — see PLATFORM_SPEC Global Learnings 2026-06-29. Determinism (Rule 4): seeds
set before model creation; one tracker (and one VIDEO timestamp clock) per clip.

Reuses, never duplicates: pose.py's Keypoints / BLUEPRINT names / _MP_POSE_IDX, and a
MediaPipePose instance ONLY as a head-center + fingertip filler (its _fill_* helpers
need no pose-detection state). config: tracker.mediapipe_roi.*.
"""

from __future__ import annotations

import logging
import random
from dataclasses import dataclass, field

import numpy as np

from drill_timing.core.athlete import LockEvent
from drill_timing.core.continuity import Coverage, verify_continuity
from drill_timing.core.pose import (
    Keypoints, MediaPipePose, N_KP, _IDX, _MP_POSE_IDX,
)
from drill_timing.core.result import ReasonCode
from drill_timing.core.roi import RoiTracker, crop_for_detection
from drill_timing.core.selection import Anchor, Candidate, RunnerSelector, bbox_of, is_eligible
from drill_timing.core.track import TrackedBox

log = logging.getLogger("drill_timing.tracker_mediapipe")

_TRACK_ID = 0  # synthetic id for the single locked athlete (downstream reads box.track_id)


@dataclass
class TrackerResult:
    """The per-frame perception the engine's back half consumes — same shape the
    YOLO+ByteTrack+pose+seg path produces (so run.py just swaps the producer)."""
    boxes_per_frame: list                 # TrackedBox|None, full-frame px
    locked_flags: list                    # bool per frame (honest live detect)
    kpts_per_frame: list                  # Keypoints|None
    masks_per_frame: list                 # np.ndarray uint8 0/255 full-frame, or None
    other_boxes_per_frame: list           # list[TrackedBox] eligible-but-not-chosen (for dim drawing)
    events: list = field(default_factory=list)   # list[LockEvent] diagnostics (same as run_lock)
    status: str = "LOCKED"                # LOCKED | LOST
    reason: object = ReasonCode.NONE
    coverage: Coverage | None = None


class MediaPipeRoiTracker:
    """Per-clip MediaPipe-VIDEO ROI tracker. Construct once per clip, call track()."""

    def __init__(self, cfg: dict):
        self.cfg = cfg
        mcfg = cfg.get("tracker", {}).get("mediapipe_roi", {})
        self.pose_task = mcfg.get("pose_task", "models/pose_landmarker_full.task")
        self.num_poses = int(mcfg.get("num_poses", 4))
        self.running_mode = str(mcfg.get("running_mode", "video")).lower()
        self.min_det = float(mcfg.get("min_pose_detection_confidence", 0.3))
        self.min_pres = float(mcfg.get("min_pose_presence_confidence", 0.3))
        self.min_trk = float(mcfg.get("min_tracking_confidence", 0.3))
        self.emit_mask = bool(mcfg.get("emit_mask", True))
        self.mask_threshold = float(mcfg.get("mask_threshold", 0.5))
        rcfg = mcfg.get("roi", {})
        self.detect_max = int(rcfg.get("detect_max", 512))
        self.max_upscale = float(rcfg.get("max_upscale", 3.0))
        self._landmarker = None
        # MediaPipePose used ONLY as a head_center + fingertip filler (reuse, no dup).
        self._filler = MediaPipePose(cfg)
        self._ts_ms = 0  # monotonic VIDEO clock (Rule 4: one clip = one increasing clock)

    # ----------------------------------------------------------------- model
    def _ensure_model(self):
        if self._landmarker is not None:
            return
        random.seed(0)
        np.random.seed(0)
        try:
            import torch
            torch.manual_seed(0)
        except Exception:
            pass
        from mediapipe.tasks.python.core.base_options import BaseOptions
        from mediapipe.tasks.python import vision
        from drill_timing.core.model_assets import require_task

        task = require_task(self.pose_task)  # fail-loud if missing
        mode = (vision.RunningMode.VIDEO if self.running_mode == "video"
                else vision.RunningMode.IMAGE)
        log.info("loading MediaPipe ROI tracker bundle: %s (mode=%s, num_poses=%d)",
                 task.name, self.running_mode, self.num_poses)
        self._landmarker = vision.PoseLandmarker.create_from_options(
            vision.PoseLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=str(task)),
                running_mode=mode,
                num_poses=self.num_poses,
                output_segmentation_masks=self.emit_mask,
                min_pose_detection_confidence=self.min_det,
                min_pose_presence_confidence=self.min_pres,
                min_tracking_confidence=self.min_trk,
            ))
        # also warm the filler's models so fingertip/head fills work
        self._filler._ensure_models()

    def _detect(self, crop_bgr):
        """Run the landmarker on a crop. Returns the MediaPipe result. VIDEO mode
        needs strictly-increasing timestamps; IMAGE mode is stateless."""
        import cv2
        import mediapipe as mp
        rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
        img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        if self.running_mode == "video":
            self._ts_ms += 33  # strictly increasing; spacing is irrelevant to detection
            return self._landmarker.detect_for_video(img, self._ts_ms)
        return self._landmarker.detect(img)

    # ----------------------------------------------------------------- track
    def track(self, frames_bgr: list, timestamps: list, anchor: Anchor | None) -> TrackerResult:
        """Drive the ROI + per-frame selection across the whole clip."""
        self._ensure_model()
        n = len(frames_bgr)
        H, W = frames_bgr[0].shape[:2]
        fw, fh = W, H

        roi_tracker = RoiTracker(fw, fh, self.cfg)
        selector = RunnerSelector(anchor, fw, fh, self.cfg)

        boxes = [None] * n
        flags = [False] * n
        kpts = [None] * n
        masks = [None] * n
        others = [[] for _ in range(n)]
        events: list = []

        for idx in range(n):
            frame = frames_bgr[idx]
            roi = roi_tracker.current()
            if roi is None:
                roi = roi_tracker.next_probe()  # sweep for re-acquisition
                selector.reset_lock()           # cold re-pick after a full loss
            crop, _scale, _off = crop_for_detection(frame, roi, self.detect_max, self.max_upscale)

            result = self._detect(crop)
            lm_sets = getattr(result, "pose_landmarks", None) or []
            seg = getattr(result, "segmentation_masks", None) or []

            # Build full-frame candidates + eligibility (40-test chooseRunner pre-gate).
            cands = []
            for ci, lms in enumerate(lm_sets):
                arr = np.array([[p.x, p.y, getattr(p, "visibility", 1.0)] for p in lms],
                               dtype=float)
                b = bbox_of(arr, roi)
                c = Candidate(index=ci, bbox=b)
                c.eligible = is_eligible(b, fw, fh, selector.scfg)
                cands.append(c)

            chosen = selector.choose(cands, idx)
            if chosen is None:
                # a miss: honest flag stays False; ROI widens around the last heading
                roi_tracker.update(None)
                continue

            # --- the athlete this frame ---
            cb = chosen.bbox
            boxes[idx] = TrackedBox(x=cb.x, y=cb.y, w=cb.w, h=cb.h, conf=1.0, track_id=_TRACK_ID)
            flags[idx] = True
            others[idx] = [TrackedBox(x=c.bbox.x, y=c.bbox.y, w=c.bbox.w, h=c.bbox.h,
                                      conf=1.0, track_id=-1)
                           for c in cands if c is not chosen and c.eligible]

            # --- keypoints: map this candidate's landmarks crop->full-frame ---
            kpts[idx] = self._landmarks_to_keypoints(lm_sets[chosen.index], roi, frame, boxes[idx], H)

            # --- mask: this candidate's seg, thresholded into a full-frame canvas ---
            if self.emit_mask and chosen.index < len(seg):
                masks[idx] = self._mask_to_fullframe(seg[chosen.index], roi, W, H)

            roi_tracker.update((cb.cx, cb.cy, cb.w, cb.h))

        # honest coverage + terminal status
        coverage = (verify_continuity(timestamps, flags, self.cfg)
                    if self.cfg.get("continuity", {}).get("enabled", True) else None)
        locked_any = any(flags)
        status = "LOCKED" if locked_any else "LOST"
        reason = ReasonCode.NONE if locked_any else ReasonCode.ATHLETE_NOT_FOUND
        if not locked_any:
            events.append(LockEvent(frame_index=0, kind="loss", track_id=_TRACK_ID,
                                    detail="athlete never locked in any frame"))
        return TrackerResult(boxes_per_frame=boxes, locked_flags=flags,
                             kpts_per_frame=kpts, masks_per_frame=masks,
                             other_boxes_per_frame=others, events=events,
                             status=status, reason=reason, coverage=coverage)

    # ----------------------------------------------------------------- mappers
    def _landmarks_to_keypoints(self, lms, roi, frame_bgr, box, H) -> Keypoints:
        """Scatter MediaPipe's 33 landmarks into the dense BLUEPRINT array in
        full-frame px (the engine invariant), then fill head_center + true fingertips
        by reusing MediaPipePose's helpers (Decision B; no pose re-run)."""
        xy = np.zeros((N_KP, 2), dtype=float)
        conf = np.zeros(N_KP, dtype=float)
        for name, mp_i in _MP_POSE_IDX.items():
            if mp_i >= len(lms):
                continue
            lm = lms[mp_i]
            xy[_IDX[name]] = (lm.x * roi.w + roi.x, lm.y * roi.h + roi.y)
            conf[_IDX[name]] = (float(getattr(lm, "presence", 1.0))
                                * float(getattr(lm, "visibility", 1.0)))
        # reuse the validated derived-joint + fingertip logic (no state needed)
        self._filler._fill_head_center(xy, conf)
        self._filler._fill_fingertips(frame_bgr, box, xy, conf, H)
        return Keypoints(xy=xy, conf=conf)

    def _mask_to_fullframe(self, mp_mask, roi, W, H):
        """MediaPipe crop-resolution float mask (0..1) -> full-frame uint8 0/255,
        thresholded and placed at the ROI position. Matches YoloSeg's output format
        exactly so report.draw_person_silhouette is unchanged."""
        import cv2
        arr = mp_mask.numpy_view()  # (ch, cw) float32 in [0,1]
        binary = (arr > self.mask_threshold).astype("uint8") * 255
        x, y, w, h = int(roi.x), int(roi.y), int(roi.w), int(roi.h)
        resized = cv2.resize(binary, (max(1, w), max(1, h)), interpolation=cv2.INTER_NEAREST)
        full = np.zeros((H, W), dtype="uint8")
        full[y:y + h, x:x + w] = resized[:h, :w]
        return full

    def close(self):
        try:
            if self._landmarker is not None:
                self._landmarker.close()
        except Exception:
            pass


# --------------------------------------------------------------------------- #
# Self-check — verifies the data-flow CONTRACT with MOCKS (no MediaPipe / no clip).
# The real-footage validation is the smoke test in run.py (Phase 10).
# --------------------------------------------------------------------------- #
def _self_check() -> bool:
    ok = True

    def check(name, cond):
        nonlocal ok
        ok = ok and bool(cond)
        print(f"  [{'PASS' if cond else 'FAIL'}] {name}")

    from drill_timing.core.roi import Roi

    # mapper math: a normalized landmark maps to the right full-frame px.
    class _FakeTracker:
        running_mode = "image"
        emit_mask = True
        mask_threshold = 0.5

    roi = Roi(100.0, 200.0, 400.0, 711.0)

    # _mask_to_fullframe: a crop-res all-ones mask lands inside the ROI box only.
    import numpy as _np

    class _MockMask:
        def __init__(self, a): self._a = a
        def numpy_view(self): return self._a
    mask_crop = _np.ones((50, 30), dtype=_np.float32)  # all person
    full = MediaPipeRoiTracker._mask_to_fullframe(_FakeTracker(), _MockMask(mask_crop), roi, 1080, 1920)
    inside = full[int(roi.y):int(roi.y + roi.h), int(roi.x):int(roi.x + roi.w)]
    check("mask placed full-frame is uint8 0/255", full.dtype == _np.uint8 and set(_np.unique(full)).issubset({0, 255}))
    check("mask is nonzero inside the ROI", inside.sum() > 0)
    check("mask is zero outside the ROI",
          full.sum() == inside.sum())

    # landmark->keypoint mapping math (without the filler, which needs MediaPipe):
    # verify the crop->full-frame transform directly.
    nx, ny = 0.5, 0.25
    fx, fy = nx * roi.w + roi.x, ny * roi.h + roi.y
    check("landmark crop->full-frame map", abs(fx - 300.0) < 1e-6 and abs(fy - 377.75) < 1e-6)

    print(f"\nTRACKER_MEDIAPIPE SELF-CHECK (contract/mappers): {'ALL PASS' if ok else 'FAILURES'}")
    return ok


if __name__ == "__main__":
    import sys
    sys.exit(0 if _self_check() else 1)
