"""Person segmentation — per-pixel mask for the BLUEPRINT silhouette (5.V).

Produces the glowing person OUTLINE + translucent OVERLAY in the annotated video.
This is PERCEPTION only (it locates the athlete's pixels); no timing math here.

Like `detect.py`, the Ultralytics seg model is loaded lazily, seeded for
reproducibility (Governance Rule 4), and `yolov8n-seg.pt` auto-downloads (~6-7MB)
to the repo root on first use — no vendoring. The chosen instance mask is
CONSTRAINED to the LOCKED athlete box (same anti-bystander spirit as pose), so a
bystander never gets a silhouette.
"""

from __future__ import annotations

import abc
import logging
import random
from typing import Optional

import numpy as np

from drill_timing.core.detect import Box

log = logging.getLogger("drill_timing.segment")

_COCO_PERSON_CLASS = 0


class SegBackend(abc.ABC):
    """Swappable segmentation backend. mask_for_box() returns a full-frame uint8
    mask (0/255) for the LOCKED athlete, or None when no good mask is found."""

    @abc.abstractmethod
    def mask_for_box(self, frame_bgr, box: Box) -> Optional[np.ndarray]:
        ...


class YoloSeg(SegBackend):
    """Ultralytics instance-segmentation backend (person class only)."""

    def __init__(self, config: dict):
        scfg = config.get("segmentation", {})
        self.model_name = scfg.get("model", "yolov8n-seg.pt")
        self.proc_width = int(scfg.get("proc_width", 640))  # 0 = full res
        self.min_mask_in_box = float(scfg.get("min_mask_in_box", 0.5))
        self.min_confidence = float(scfg.get("min_confidence", 0.4))
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
            from ultralytics import YOLO  # heavy import, deferred
            log.info("loading seg model: %s (first run downloads weights)", self.model_name)
            self._model = YOLO(self.model_name)
        return self._model

    def mask_for_box(self, frame_bgr, box: Box) -> Optional[np.ndarray]:
        import cv2
        model = self._ensure_model()
        H, W = frame_bgr.shape[:2]
        # Optional downscale for inference speed; the mask is upscaled back to full.
        scale = 1.0
        img = frame_bgr
        if self.proc_width and W > self.proc_width:
            scale = self.proc_width / float(W)
            img = cv2.resize(frame_bgr, (self.proc_width, int(round(H * scale))))

        results = model(img, classes=[_COCO_PERSON_CLASS],
                        conf=self.min_confidence, verbose=False)
        best_mask, best_frac = None, 0.0
        for r in results:
            if r.masks is None or r.masks.data is None:
                continue
            for md in r.masks.data:
                m = md.cpu().numpy().astype("uint8")  # (mh, mw) at model size
                # Resize this instance mask to FULL frame.
                full = cv2.resize(m, (W, H), interpolation=cv2.INTER_NEAREST)
                frac = _frac_mask_in_box(full, box)
                if frac > best_frac:
                    best_frac, best_mask = frac, full
        # Reject a mask that's mostly OUTSIDE the locked box (a bystander).
        if best_mask is None or best_frac < self.min_mask_in_box:
            return None
        return (best_mask > 0).astype("uint8") * 255


def _frac_mask_in_box(mask, box: Box) -> float:
    """Fraction of the mask's set pixels that lie inside the locked box."""
    total = int(mask.sum())
    if total <= 0:
        return 0.0
    H, W = mask.shape[:2]
    x1 = max(0, int(box.x)); y1 = max(0, int(box.y))
    x2 = min(W, int(box.x + box.w)); y2 = min(H, int(box.y + box.h))
    if x2 <= x1 or y2 <= y1:
        return 0.0
    inside = int(mask[y1:y2, x1:x2].sum())
    return inside / float(total)


def make_seg_backend(config: dict) -> Optional[SegBackend]:
    """Factory — returns None when segmentation is disabled (zero per-frame cost),
    so the silhouette is a pure opt-in layer."""
    scfg = config.get("segmentation", {})
    if not scfg.get("enabled", False):
        return None
    model_kind = scfg.get("backend", "yolo_seg")
    if model_kind == "yolo_seg":
        return YoloSeg(config)
    raise ValueError(f"unknown segmentation backend: {model_kind!r} (have: yolo_seg)")
