"""Phase 2 — person detection (YOLO).

Find people per frame as bounding boxes with confidence. Person class only;
filters tiny distant bystanders by confidence and minimum box height. This is
PERCEPTION only — it locates the athlete; all timing math happens elsewhere
(Operating Principle 4).

The Ultralytics model is loaded lazily and reused; seeds are set for
reproducibility (Governance Rule 4). First use downloads the weights (~6MB) once,
then they're cached.
"""

from __future__ import annotations

import logging
import random
from dataclasses import dataclass
from typing import Optional

import numpy as np

log = logging.getLogger("drill_timing.detect")

_COCO_PERSON_CLASS = 0


@dataclass
class Box:
    """A person bounding box in full-frame pixel coords (top-left x,y + w,h)."""
    x: float
    y: float
    w: float
    h: float
    conf: float

    @property
    def cx(self) -> float:
        return self.x + self.w / 2.0

    @property
    def cy(self) -> float:
        return self.y + self.h / 2.0

    def frac_height(self, frame_h: int) -> float:
        return self.h / frame_h if frame_h else 0.0

    def iou(self, other: "Box") -> float:
        ax2, ay2 = self.x + self.w, self.y + self.h
        bx2, by2 = other.x + other.w, other.y + other.h
        ix1, iy1 = max(self.x, other.x), max(self.y, other.y)
        ix2, iy2 = min(ax2, bx2), min(ay2, by2)
        iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
        inter = iw * ih
        if inter <= 0:
            return 0.0
        union = self.w * self.h + other.w * other.h - inter
        return inter / union if union > 0 else 0.0


class PersonDetector:
    """YOLO person detector. Lazy model load; config-driven thresholds."""

    def __init__(self, config: dict):
        dcfg = config["detection"]
        self.model_name = dcfg.get("model", "yolov8n.pt")
        self.min_confidence = float(dcfg["min_confidence"])
        self.min_box_frac_height = float(dcfg["min_box_frac_height"])
        self._model = None

    def _ensure_model(self):
        if self._model is None:
            # Determinism (Rule 4): seed before any inference.
            random.seed(0)
            np.random.seed(0)
            try:
                import torch
                torch.manual_seed(0)
            except Exception:
                pass
            from ultralytics import YOLO  # heavy import, deferred
            log.info("loading detector model: %s (first run downloads weights)", self.model_name)
            self._model = YOLO(self.model_name)
        return self._model

    def detect(self, frame_bgr) -> list[Box]:
        """Return person-class boxes passing the confidence + size filters."""
        model = self._ensure_model()
        frame_h = frame_bgr.shape[0]
        results = model(frame_bgr, classes=[_COCO_PERSON_CLASS],
                        conf=self.min_confidence, verbose=False)
        boxes: list[Box] = []
        for r in results:
            if r.boxes is None:
                continue
            for b in r.boxes:
                conf = float(b.conf[0])
                x1, y1, x2, y2 = (float(v) for v in b.xyxy[0])
                box = Box(x=x1, y=y1, w=x2 - x1, h=y2 - y1, conf=conf)
                if box.frac_height(frame_h) >= self.min_box_frac_height:
                    boxes.append(box)
        return boxes
