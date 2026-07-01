"""Phase 3 — ByteTrack wrapper: persons -> stable track IDs.

Wraps Ultralytics' built-in ByteTrack (`YOLO.track(persist=True)`) to assign each
person a persistent ID across frames. Phase 3's athlete-lock needs whole-track
paths (who is who over the entire clip), so this runs the tracker frame-by-frame
in capture order and emits per-frame tracked boxes carrying their `track_id`.

`TrackedBox` extends `detect.Box`, so every downstream consumer (pose.estimate,
report draw, CSV) treats a tracked box exactly like a plain box — a TrackedBox
IS a Box. Persons only (COCO class 0); same size/confidence filters as detect.py.

A fresh model is built per clip and seeds are fixed, so ByteTrack's internal state
never leaks between clips/runs (determinism, Governance Rule 4).
"""

from __future__ import annotations

import logging
import random
from dataclasses import dataclass

import numpy as np

from drill_timing.core.detect import Box

log = logging.getLogger("drill_timing.track")

_COCO_PERSON_CLASS = 0


@dataclass
class TrackedBox(Box):
    """A person box with a stable ByteTrack ID. Inherits Box geometry/helpers."""
    track_id: int = -1


@dataclass
class TrackFrame:
    """All tracked persons in one frame."""
    frame_index: int
    timestamp_s: float
    boxes: list  # list[TrackedBox]


class PersonTracker:
    """Runs ByteTrack over a clip's frames, yielding stable per-person IDs."""

    def __init__(self, config: dict):
        dcfg = config["detection"]
        self.model_name = dcfg.get("model", "yolov8n.pt")
        self.min_confidence = float(dcfg["min_confidence"])
        self.min_box_frac_height = float(dcfg["min_box_frac_height"])
        self._model = None

    def _ensure_model(self):
        # Build a FRESH model per clip so ByteTrack state can't leak between clips.
        random.seed(0)
        np.random.seed(0)
        try:
            import torch
            torch.manual_seed(0)
        except Exception:
            pass
        from ultralytics import YOLO
        log.info("loading tracker model: %s", self.model_name)
        self._model = YOLO(self.model_name)
        return self._model

    def track_clip(self, frames: list) -> list:
        """frames: list of (frame_index, frame_bgr, timestamp_s). Returns a list
        of TrackFrame in capture order. persist=True threads IDs across frames."""
        model = self._ensure_model()
        out: list = []
        for (i, frame, ts) in frames:
            frame_h = frame.shape[0]
            results = model.track(
                frame, persist=True, tracker="bytetrack.yaml",
                classes=[_COCO_PERSON_CLASS], conf=self.min_confidence, verbose=False,
            )
            tboxes: list = []
            r = results[0] if results else None
            if r is not None and r.boxes is not None and r.boxes.id is not None:
                ids = r.boxes.id.cpu().numpy().astype(int)
                for j in range(len(r.boxes)):
                    conf = float(r.boxes.conf[j])
                    x1, y1, x2, y2 = (float(v) for v in r.boxes.xyxy[j].cpu().numpy())
                    tb = TrackedBox(x=x1, y=y1, w=x2 - x1, h=y2 - y1, conf=conf,
                                    track_id=int(ids[j]))
                    if tb.frac_height(frame_h) >= self.min_box_frac_height:
                        tboxes.append(tb)
            out.append(TrackFrame(frame_index=i, timestamp_s=ts, boxes=tboxes))
        return out
