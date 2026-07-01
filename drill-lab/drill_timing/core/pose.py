"""Phase 5 — pose estimation (behind a swappable backend interface).

Per-frame keypoints for the locked athlete, used to compute center-of-mass
(mid-hip), body scale (for athlete-agnostic normalization), the hand/fingertip
reach point for the touch rule, and the shared BLUEPRINT visualization (see
PLATFORM_SPEC 5.V).

The backend is abstract (`PoseBackend`) so MediaPipe / MoveNet / YOLO-Pose can be
swapped without changing callers (spec Section 2). Two backends ship:
  * `MediaPipePose` (DEFAULT) — MediaPipe Tasks PoseLandmarker (33 landmarks incl.
    heels + forefoot) + optional HandLandmarker for true fingertips. Gives the rich
    blueprint joints. Needs the vendored `.task` bundles (see core/model_assets.py;
    fail-loud if missing).
  * `YoloPose` — `yolov8n-pose.pt`, COCO-17 only. Deterministic rollback
    (`pose.backend: yolo_pose`); the blueprint degrades gracefully (heel/forefoot/
    fingertip edges + dots simply drop since those slots stay conf=0).

Keypoints are returned in FULL-FRAME pixel coords (the crop offset is added back),
in a single dense array indexed over BLUEPRINT_NAMES (a superset of COCO-17 — the
first 17 indices are identical, so every existing point("left_hip") is unchanged).
"""

from __future__ import annotations

import abc
import logging
import random
from dataclasses import dataclass
from typing import Optional

import numpy as np

from drill_timing.core.detect import Box

log = logging.getLogger("drill_timing.pose")

# COCO-17 keypoint order (Ultralytics pose output). KEPT for back-compat; it is the
# first-17 prefix of BLUEPRINT_NAMES so YoloPose still fills exactly these slots.
COCO_NAMES = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
]

# Canonical BLUEPRINT joint set (shared by ALL drills — PLATFORM_SPEC 5.V). COCO-17
# is the first-17 subset (indices unchanged); the new joints come from MediaPipe
# (YoloPose leaves them conf=0). HONESTY (locked): only ONE forefoot point per foot
# exists in any free model (MP foot_index) — we draw ankle->heel->forefoot, never an
# invented ball-vs-toe-tip pair. head_center is DERIVED, native nowhere.
BLUEPRINT_NAMES = COCO_NAMES + [
    "head_center",                       # DERIVED (eye-line + head-height offset)
    "left_heel", "right_heel",           # MP Pose 29 / 30
    "left_forefoot", "right_forefoot",   # MP Pose 31 / 32 (foot_index) — one per foot
    "left_fingertip", "right_fingertip", # MP Hands tip; else wrist proxy (reduced conf)
]
_IDX = {name: i for i, name in enumerate(BLUEPRINT_NAMES)}
N_KP = len(BLUEPRINT_NAMES)

# COCO-17 skeleton limb connections (for drawing). KEPT for back-compat; the
# blueprint renderer uses BLUEPRINT_SKELETON below.
COCO_SKELETON = [
    ("left_shoulder", "right_shoulder"), ("left_shoulder", "left_elbow"),
    ("left_elbow", "left_wrist"), ("right_shoulder", "right_elbow"),
    ("right_elbow", "right_wrist"), ("left_shoulder", "left_hip"),
    ("right_shoulder", "right_hip"), ("left_hip", "right_hip"),
    ("left_hip", "left_knee"), ("left_knee", "left_ankle"),
    ("right_hip", "right_knee"), ("right_knee", "right_ankle"),
]

# BLUEPRINT white-line skeleton edges (PLATFORM_SPEC 5.V). An edge draws only when
# BOTH endpoints resolve, so backends missing the rich joints (YoloPose) degrade
# gracefully — the extra edges just don't appear.
BLUEPRINT_SKELETON = [
    ("head_center", "left_shoulder"), ("head_center", "right_shoulder"),
    ("left_shoulder", "right_shoulder"),
    ("left_shoulder", "left_elbow"), ("left_elbow", "left_wrist"),
    ("left_wrist", "left_fingertip"),
    ("right_shoulder", "right_elbow"), ("right_elbow", "right_wrist"),
    ("right_wrist", "right_fingertip"),
    ("left_shoulder", "left_hip"), ("right_shoulder", "right_hip"),
    ("left_hip", "right_hip"),
    ("left_hip", "left_knee"), ("left_knee", "left_ankle"),
    ("right_hip", "right_knee"), ("right_knee", "right_ankle"),
    ("left_ankle", "left_heel"), ("left_heel", "left_forefoot"),
    ("right_ankle", "right_heel"), ("right_heel", "right_forefoot"),
]

# BLUEPRINT joint dots (the named joints the operator listed). A dot draws only when
# its keypoint resolves. Fingertips are accented in the renderer (touch point).
BLUEPRINT_JOINT_DOTS = [
    "head_center", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_fingertip", "right_fingertip", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
    "left_heel", "right_heel", "left_forefoot", "right_forefoot",
]


@dataclass
class Keypoints:
    """BLUEPRINT landmarks in full-frame pixels + per-point confidence.

    Dense array indexed over BLUEPRINT_NAMES (COCO-17 prefix + the richer joints).
    Slots a backend can't fill carry conf=0, so point() returns None for them and
    the renderer drops those edges/dots — shape is backend-independent."""
    xy: np.ndarray      # shape (N_KP, 2), full-frame pixel coords
    conf: np.ndarray    # shape (N_KP,)

    def point(self, name: str) -> Optional[tuple[float, float]]:
        i = _IDX[name]
        if self.conf[i] <= 0:
            return None
        return (float(self.xy[i, 0]), float(self.xy[i, 1]))

    def _avg(self, a: str, b: str) -> Optional[tuple[float, float]]:
        pa, pb = self.point(a), self.point(b)
        if pa is None or pb is None:
            return None
        return ((pa[0] + pb[0]) / 2.0, (pa[1] + pb[1]) / 2.0)

    def mid_hip(self) -> Optional[tuple[float, float]]:
        """Center-of-mass proxy (Phase 5)."""
        return self._avg("left_hip", "right_hip")

    def mid_shoulder(self) -> Optional[tuple[float, float]]:
        return self._avg("left_shoulder", "right_shoulder")

    def body_height_px(self) -> Optional[float]:
        """Robust body scale: shoulder-midpoint -> ankle span (vertical reach).
        Used to normalize motion so tall/short athletes are treated the same."""
        ms = self.mid_shoulder()
        # lowest available ankle (athlete may have one occluded)
        ankles = [self.point("left_ankle"), self.point("right_ankle")]
        ankles = [a for a in ankles if a is not None]
        if ms is None or not ankles:
            # fall back to shoulder->hip segment x ~2 if ankles missing
            mh = self.mid_hip()
            if ms is None or mh is None:
                return None
            return abs(mh[1] - ms[1]) * 2.0
        lowest = max(ankles, key=lambda p: p[1])
        h = abs(lowest[1] - ms[1])
        return h if h > 1 else None


class PoseBackend(abc.ABC):
    """Swappable pose backend. estimate() returns Keypoints or None (no pose)."""

    @abc.abstractmethod
    def estimate(self, frame_bgr, box: Box) -> Optional[Keypoints]:
        ...


class YoloPose(PoseBackend):
    """YOLO-Pose backend. Runs on the athlete crop for accuracy."""

    def __init__(self, config: dict):
        pcfg = config.get("pose", {})
        self.model_name = pcfg.get("model", "yolov8n-pose.pt")
        self.pad_frac = 0.15  # crop padding around the box
        self._model = None

    def _ensure_model(self):
        if self._model is None:
            random.seed(0)
            np.random.seed(0)
            try:
                import torch
                torch.manual_seed(0)
            except Exception:
                pass
            from ultralytics import YOLO
            log.info("loading pose model: %s (first run downloads weights)", self.model_name)
            self._model = YOLO(self.model_name)
        return self._model

    def estimate(self, frame_bgr, box: Box) -> Optional[Keypoints]:
        """Pose for THE LOCKED athlete. Constrains the chosen pose to the locked
        box (so a bystander bleeding into the padded crop can't win) and retries
        at a lower confidence so hard poses (bent over at a touch) still resolve.
        Returns None only when nothing plausibly inside the box is found."""
        model = self._ensure_model()
        H, W = frame_bgr.shape[:2]
        px, py = box.w * self.pad_frac, box.h * self.pad_frac
        x1 = int(max(0, box.x - px)); y1 = int(max(0, box.y - py))
        x2 = int(min(W, box.x + box.w + px)); y2 = int(min(H, box.y + box.h + py))
        if x2 - x1 < 4 or y2 - y1 < 4:
            return None
        crop = frame_bgr[y1:y2, x1:x2]

        # Try a normal then a low confidence pass (bent-over poses score low).
        for conf in (0.25, 0.10):
            cand = self._best_pose_in_box(model, crop, (x1, y1), box, conf)
            if cand is not None:
                return cand
        return None

    def _best_pose_in_box(self, model, crop, offset, box: Box, conf: float):
        """Run pose on the crop; return the COCO-17 pose whose keypoints fall
        MOST inside the locked box (full-frame), tie-broken by confidence. The
        17 COCO points are placed into the dense BLUEPRINT array (new slots
        conf=0) so the Keypoints shape is backend-independent."""
        ox, oy = offset
        results = model(crop, conf=conf, verbose=False)
        best = None
        best_key = (-1.0, -1.0)  # (fraction-in-box, mean-conf)
        for r in results:
            if r.keypoints is None or r.keypoints.xy is None or len(r.keypoints.xy) == 0:
                continue
            confs = r.keypoints.conf
            for i in range(len(r.keypoints.xy)):
                xy = r.keypoints.xy[i].cpu().numpy().astype(float)
                if xy.shape[0] != len(COCO_NAMES):
                    continue
                kc = (confs[i].cpu().numpy().astype(float) if confs is not None
                      else np.ones(xy.shape[0]))
                # Map to full-frame.
                fx = xy.copy()
                fx[:, 0] += ox
                fx[:, 1] += oy
                # Fraction of CONFIDENT keypoints landing inside the locked box.
                inside = _frac_in_box(fx, kc, box)
                key = (round(inside, 3), float(kc.mean()))
                if key > best_key:
                    best_key = key
                    best = (fx, kc)
        # Reject a pose that's mostly the OTHER person (bystander in the crop):
        # require a majority of confident keypoints inside the locked box.
        if best is None or best_key[0] < 0.5:
            return None
        fx, kc = best
        # Scatter the 17 COCO points into the dense BLUEPRINT array.
        dense_xy = np.zeros((N_KP, 2), dtype=float)
        dense_conf = np.zeros(N_KP, dtype=float)
        dense_xy[:len(COCO_NAMES)] = fx
        dense_conf[:len(COCO_NAMES)] = kc
        return Keypoints(xy=dense_xy, conf=dense_conf)


def _frac_in_box(fx, kc, box: Box) -> float:
    """Fraction of CONFIDENT (>0.2) keypoints in `fx` that fall inside the locked
    box. Shared anti-bystander gate for every backend (the 2026-06-24 learning:
    the skeleton must stay on the LOCKED athlete, not a bystander in the crop)."""
    conf_mask = kc > 0.2
    if not conf_mask.any():
        return 0.0
    pts = fx[conf_mask]
    inside = ((pts[:, 0] >= box.x) & (pts[:, 0] <= box.x + box.w)
              & (pts[:, 1] >= box.y) & (pts[:, 1] <= box.y + box.h))
    return float(np.mean(inside))


# --------------------------------------------------------------------------- #
# MediaPipe backend — rich joints (heels + forefoot) + true fingertips
# --------------------------------------------------------------------------- #
# MediaPipe Pose landmark indices we map into BLUEPRINT_NAMES (the rest of the 33
# are face/finger detail we don't draw). Confirmed against the installed bundle.
_MP_POSE_IDX = {
    "nose": 0, "left_eye": 2, "right_eye": 5, "left_ear": 7, "right_ear": 8,
    "left_shoulder": 11, "right_shoulder": 12, "left_elbow": 13, "right_elbow": 14,
    "left_wrist": 15, "right_wrist": 16, "left_hip": 23, "right_hip": 24,
    "left_knee": 25, "right_knee": 26, "left_ankle": 27, "right_ankle": 28,
    "left_heel": 29, "right_heel": 30, "left_forefoot": 31, "right_forefoot": 32,
}
_MP_HAND_MIDDLE_TIP = 12  # HandLandmarker middle_finger_tip


class MediaPipePose(PoseBackend):
    """MediaPipe Tasks backend. Pose (33 landmarks incl. heels + forefoot) for the
    rich blueprint joints, optional Hands for true fingertips (the anti-cheat touch
    rule needs them). Runs on the padded locked-box CROP — the crop IS the box
    constraint, validated by `_frac_in_box` (reject a bystander in the crop)."""

    def __init__(self, config: dict):
        pcfg = config.get("pose", {})
        rcfg = config.get("render", {})
        self.pose_task = pcfg.get("pose_task", "models/pose_landmarker_full.task")
        self.hands_task = pcfg.get("hands_task", "models/hand_landmarker.task")
        self.run_hands = bool(pcfg.get("run_hands", True))
        self.pad_frac = float(pcfg.get("pad_frac", 0.15))
        self.min_frac_in_box = float(pcfg.get("min_frac_in_box", 0.5))
        self.hand_crop_frac = float(pcfg.get("hand_crop_frac", 0.18))
        self.hands_lower_frame_only = bool(pcfg.get("hands_lower_frame_only", True))
        self.head_center_offset_frac = float(rcfg.get("head_center_offset_frac", 0.30))
        self._pose = None
        self._hands = None

    def _ensure_models(self):
        if self._pose is not None:
            return
        # Determinism (Rule 4): seed before any inference.
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

        pose_path = require_task(self.pose_task)  # fail-loud if missing
        log.info("loading MediaPipe pose bundle: %s", pose_path.name)
        self._pose = vision.PoseLandmarker.create_from_options(
            vision.PoseLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=str(pose_path)),
                running_mode=vision.RunningMode.IMAGE, num_poses=1))
        if self.run_hands:
            hands_path = require_task(self.hands_task)  # fail-loud if missing
            log.info("loading MediaPipe hands bundle: %s", hands_path.name)
            self._hands = vision.HandLandmarker.create_from_options(
                vision.HandLandmarkerOptions(
                    base_options=BaseOptions(model_asset_path=str(hands_path)),
                    running_mode=vision.RunningMode.IMAGE, num_hands=2))

    def estimate(self, frame_bgr, box: Box) -> Optional[Keypoints]:
        """Pose for THE LOCKED athlete on the padded crop. Retries at a larger pad
        (analogous to YoloPose's low-conf retry) for hard/edge poses. Returns None
        only when nothing plausibly inside the locked box is found."""
        self._ensure_models()
        H, W = frame_bgr.shape[:2]
        for pad in (self.pad_frac, 0.25):
            kp = self._estimate_at_pad(frame_bgr, box, pad, H, W)
            if kp is not None:
                return kp
        return None

    def _estimate_at_pad(self, frame_bgr, box: Box, pad, H, W) -> Optional[Keypoints]:
        import cv2
        import mediapipe as mp
        px, py = box.w * pad, box.h * pad
        x1 = int(max(0, box.x - px)); y1 = int(max(0, box.y - py))
        x2 = int(min(W, box.x + box.w + px)); y2 = int(min(H, box.y + box.h + py))
        if x2 - x1 < 4 or y2 - y1 < 4:
            return None
        crop = frame_bgr[y1:y2, x1:x2]
        ch, cw = crop.shape[:2]
        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        res = self._pose.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
        if not res.pose_landmarks:
            return None
        lms = res.pose_landmarks[0]

        dense_xy = np.zeros((N_KP, 2), dtype=float)
        dense_conf = np.zeros(N_KP, dtype=float)
        for name, mp_i in _MP_POSE_IDX.items():
            lm = lms[mp_i]
            dense_xy[_IDX[name]] = (lm.x * cw + x1, lm.y * ch + y1)
            # presence*visibility as a confidence proxy (both in [0,1]).
            dense_conf[_IDX[name]] = float(getattr(lm, "presence", 1.0)) * \
                float(getattr(lm, "visibility", 1.0))

        # Anti-bystander gate: a majority of confident keypoints must fall inside
        # the LOCKED box (the same _frac_in_box rule YoloPose uses).
        if _frac_in_box(dense_xy, dense_conf, box) < self.min_frac_in_box:
            return None

        # Derived head_center + true fingertips fill the remaining new slots.
        self._fill_head_center(dense_xy, dense_conf)
        self._fill_fingertips(frame_bgr, box, dense_xy, dense_conf, H)
        return Keypoints(xy=dense_xy, conf=dense_conf)

    def _fill_head_center(self, xy, conf) -> None:
        """DERIVED head_center (native nowhere): from the eye midpoint, stepped UP
        (toward smaller y) by a fraction of the eye->shoulder span. Falls back to
        the nose, then leaves it unset (conf stays 0 -> dot/edges drop)."""
        le, re = _IDX["left_eye"], _IDX["right_eye"]
        ls, rs = _IDX["left_shoulder"], _IDX["right_shoulder"]
        hc = _IDX["head_center"]
        if conf[le] > 0 and conf[re] > 0:
            mid_eye = (xy[le] + xy[re]) / 2.0
            if conf[ls] > 0 and conf[rs] > 0:
                mid_sh = (xy[ls] + xy[rs]) / 2.0
                head_h = abs(mid_sh[1] - mid_eye[1])
                xy[hc] = (mid_eye[0], mid_eye[1] - self.head_center_offset_frac * head_h)
            else:
                xy[hc] = mid_eye
            conf[hc] = min(conf[le], conf[re])
        elif conf[_IDX["nose"]] > 0:
            xy[hc] = xy[_IDX["nose"]]
            conf[hc] = conf[_IDX["nose"]]

    def _fill_fingertips(self, frame_bgr, box: Box, xy, conf, H) -> None:
        """True fingertips via HandLandmarker on a wrist-anchored crop. Falls back
        to the wrist position at reduced conf (honest: it's the wrist proxy) when
        Hands is off / gated out / finds nothing."""
        import cv2
        import mediapipe as mp
        for side in ("left", "right"):
            w_i = _IDX[f"{side}_wrist"]
            tip_i = _IDX[f"{side}_fingertip"]
            if conf[w_i] <= 0:
                continue
            wx, wy = xy[w_i]
            # Honest fallback first; upgraded to a true tip if Hands resolves one.
            xy[tip_i] = (wx, wy)
            conf[tip_i] = conf[w_i] * 0.5
            if not self.run_hands or self._hands is None:
                continue
            # Perf gate: only spend Hands inference where a touch can happen
            # (wrist in the lower frame band). Elsewhere keep the wrist proxy.
            if self.hands_lower_frame_only and wy < 0.5 * H:
                continue
            r = max(box.w, box.h) * self.hand_crop_frac
            hx1 = int(max(0, wx - r)); hy1 = int(max(0, wy - r))
            hx2 = int(min(frame_bgr.shape[1], wx + r)); hy2 = int(min(H, wy + r))
            if hx2 - hx1 < 4 or hy2 - hy1 < 4:
                continue
            hcrop = frame_bgr[hy1:hy2, hx1:hx2]
            hh, hw = hcrop.shape[:2]
            rgb = cv2.cvtColor(hcrop, cv2.COLOR_BGR2RGB)
            hres = self._hands.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
            if not hres.hand_landmarks:
                continue
            # Pick the hand whose wrist (landmark 0) is closest to our wrist point.
            best_h, best_d = None, 1e18
            for hand in hres.hand_landmarks:
                hwx = hand[0].x * hw + hx1; hwy = hand[0].y * hh + hy1
                d = (hwx - wx) ** 2 + (hwy - wy) ** 2
                if d < best_d:
                    best_d, best_h = d, hand
            if best_h is None:
                continue
            tip = best_h[_MP_HAND_MIDDLE_TIP]
            xy[tip_i] = (tip.x * hw + hx1, tip.y * hh + hy1)
            conf[tip_i] = 1.0


def make_pose_backend(config: dict) -> PoseBackend:
    """Factory — selects the backend from config (default mediapipe)."""
    backend = config.get("pose", {}).get("backend", "mediapipe")
    if backend == "mediapipe":
        return MediaPipePose(config)
    if backend == "yolo_pose":
        return YoloPose(config)
    raise ValueError(f"unknown pose backend: {backend!r} (have: mediapipe, yolo_pose)")
