"""The output spine — annotated video, JSON result, per-frame CSV.

Operating Principle 5 (everything is logged): every run writes an annotated video
(running clock, frame counter, status banner, and seams for box/skeleton/lines/
event markers that later phases draw) + a per-frame CSV of all signals + a JSON
result. You cannot improve what you cannot see.

No ML imported here. Codec choice (`mp4v`/`.mp4`) verified to work on this box
without a system ffmpeg; avc1 is excluded (OpenH264 DLL version mismatch).
"""

from __future__ import annotations

import csv
import json
import logging
from pathlib import Path
from typing import Optional

import cv2

from drill_timing.core.result import DrillResult
from drill_timing.core.video import _probe_report

log = logging.getLogger("drill_timing.report")


# --------------------------------------------------------------------------- #
# Codec selection (verified by live probe; avc1 deliberately excluded)
# --------------------------------------------------------------------------- #
_FOURCC_CANDIDATES = [("mp4v", ".mp4"), ("XVID", ".avi"), ("MJPG", ".avi")]


def _open_writer(out_dir: Path, stem: str, size: tuple[int, int], fps: float):
    """Try fourcc candidates in order; return (writer, path, fourcc_used).

    Fail loud if none open. `size` is (width, height) — cv2's expected order.
    """
    if fps <= 0:
        fps = 30.0  # playback-rate fallback; the burned-in clock is timing truth
    last_err = None
    for fourcc_tag, ext in _FOURCC_CANDIDATES:
        path = out_dir / f"{stem}{ext}"
        fourcc = cv2.VideoWriter_fourcc(*fourcc_tag)
        writer = cv2.VideoWriter(str(path), fourcc, fps, size)
        if writer.isOpened():
            log.info("annotated video: using fourcc=%s -> %s", fourcc_tag, path.name)
            return writer, path, fourcc_tag
        writer.release()
        last_err = f"fourcc {fourcc_tag} failed to open {path.name}"
        log.warning(last_err)
    raise RuntimeError(
        f"no working video codec found (tried {[c[0] for c in _FOURCC_CANDIDATES]}): {last_err}"
    )


def _fmt_clock(t_seconds: float) -> str:
    """MM:SS.mmm from a timestamp in seconds."""
    t = max(0.0, t_seconds)
    minutes = int(t // 60)
    secs = t - minutes * 60
    return f"{minutes:02d}:{secs:06.3f}"


# --------------------------------------------------------------------------- #
# Annotated video writer
# --------------------------------------------------------------------------- #
class AnnotatedVideoWriter:
    """Writes an annotated copy of the clip in the shared BLUEPRINT style
    (PLATFORM_SPEC 5.V): a glowing person OUTLINE + translucent OVERLAY (from
    segmentation) and a WHITE-line skeleton with named joint dots, plus the HUD
    (clock, frame counter, status banner) and the onset marker. Colors/sizes are
    config-driven via the `render:` block (Operating Principle 7)."""

    _FONT = cv2.FONT_HERSHEY_SIMPLEX

    def __init__(
        self,
        out_dir: Path,
        stem: str,
        resolution: tuple[int, int],
        fps: float,
        *,
        status: str = "DRAFT_SKELETON",
        reason: str = "NONE",
        total_frames: int = 0,
        render: Optional[dict] = None,
    ):
        self._w, self._h = resolution
        self._vw, self.path, self.fourcc_used = _open_writer(
            out_dir, stem, (self._w, self._h), fps
        )
        self._status = status
        self._reason = reason
        self._total = total_frames
        # Resolution-relative HUD constants.
        self._font_scale = max(0.4, min(0.6, self._w / 800.0))
        self._banner_h = max(26, int(0.08 * self._h))
        self._thick = 1
        # Blueprint render config (BGR colors + sizes); fail-soft defaults so a
        # partially-updated config.yaml never crashes the renderer.
        r = render or {}
        self._sil_fill = tuple(r.get("silhouette_fill_color", [255, 180, 0]))
        self._sil_alpha = float(r.get("silhouette_alpha", 0.25))
        self._outline_color = tuple(r.get("outline_color", [255, 230, 150]))
        self._glow_layers = int(r.get("glow_layers", 4))
        self._glow_thickness = int(r.get("glow_thickness", 9))
        self._outline_thickness = int(r.get("outline_thickness", 2))
        self._skel_color = tuple(r.get("skeleton_line_color", [255, 255, 255]))
        self._skel_thick = int(r.get("skeleton_line_thickness", 2))
        self._dot_color = tuple(r.get("joint_dot_color", [255, 255, 255]))
        self._dot_radius = int(r.get("joint_dot_radius", 3))
        self._fingertip_color = tuple(r.get("fingertip_color", [0, 220, 255]))
        self._debug_boxes = bool(r.get("debug_boxes", False))

    # ---- public ---------------------------------------------------------- #
    def write(self, frame_bgr, frame_index: int, timestamp_s: float,
              *, box=None, keypoints=None, event_markers=None, other_boxes=None,
              mask=None) -> None:
        f = frame_bgr.copy()
        # Perception overlays, drawn under the HUD. Each is a no-op when its arg is
        # absent. Order: silhouette UNDER skeleton UNDER HUD. (Yard-line drawing was
        # removed from this engine — the automatic detector lives in the browser tool.)
        self.draw_person_silhouette(f, mask)            # glow outline + translucent fill
        self.draw_skeleton_blueprint(f, keypoints)      # white lines + named joint dots
        if self._debug_boxes:                           # optional raw boxes for debugging
            self.draw_candidate_boxes(f, other_boxes)
            self.draw_athlete_box(f, box)
        self.draw_event_markers(f, event_markers)
        # HUD
        self._draw_status_banner(f)
        self._draw_clock(f, timestamp_s)
        self._draw_frame_counter(f, frame_index)
        self._vw.write(f)

    def update_verdict(self, status: str, reason: str) -> None:
        self._status = status
        self._reason = reason

    def close(self) -> None:
        if self._vw is not None:
            self._vw.release()
            self._vw = None

    def __enter__(self) -> "AnnotatedVideoWriter":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    # ---- BLUEPRINT perception overlays (shared by ALL drills — 5.V) ------- #
    def draw_person_silhouette(self, frame, mask) -> None:
        """Glowing person OUTLINE + translucent OVERLAY from the per-pixel mask
        (segmentation, constrained to the locked athlete). No-op without a mask."""
        if mask is None:
            return
        m = mask > 0
        if not m.any():
            return
        # Translucent fill: blend a flat colored layer where the mask is set
        # (reuses the addWeighted pattern from _draw_status_banner).
        overlay = frame.copy()
        overlay[m] = self._sil_fill
        cv2.addWeighted(overlay, self._sil_alpha, frame, 1.0 - self._sil_alpha, 0, frame)
        # Glow outline: draw the contour in a few layers, thick->thin / dim->bright,
        # for a cheap bloom, then a crisp bright contour on top.
        contours, _ = cv2.findContours(mask.astype("uint8"), cv2.RETR_EXTERNAL,
                                       cv2.CHAIN_APPROX_SIMPLE)
        for k in range(self._glow_layers, 0, -1):
            t = max(1, int(self._glow_thickness * k / self._glow_layers))
            frac = 1.0 - 0.6 * (k - 1) / max(1, self._glow_layers)  # outer=dimmer
            col = tuple(int(c * frac) for c in self._outline_color)
            cv2.drawContours(frame, contours, -1, col, t, cv2.LINE_AA)
        cv2.drawContours(frame, contours, -1, self._outline_color,
                         self._outline_thickness, cv2.LINE_AA)

    def draw_skeleton_blueprint(self, frame, keypoints) -> None:
        """WHITE-line skeleton + named joint dots (PLATFORM_SPEC 5.V). An edge/dot
        draws only when its endpoint(s) resolve, so a COCO-only backend degrades
        gracefully (heel/forefoot/fingertip simply absent). Fingertips are
        accented so the touch point is visible (ties to the hand-touch rule)."""
        if keypoints is None:
            return
        from drill_timing.core.pose import BLUEPRINT_SKELETON, BLUEPRINT_JOINT_DOTS
        for a, b in BLUEPRINT_SKELETON:
            pa, pb = keypoints.point(a), keypoints.point(b)
            if pa and pb:
                cv2.line(frame, (int(pa[0]), int(pa[1])), (int(pb[0]), int(pb[1])),
                         self._skel_color, self._skel_thick, cv2.LINE_AA)
        for name in BLUEPRINT_JOINT_DOTS:
            p = keypoints.point(name)
            if not p:
                continue
            accent = name.endswith("fingertip")
            color = self._fingertip_color if accent else self._dot_color
            radius = self._dot_radius + (1 if accent else 0)
            # thin dark ring for contrast over light jerseys, then the bright dot
            cv2.circle(frame, (int(p[0]), int(p[1])), radius + 1, (0, 0, 0), 1, cv2.LINE_AA)
            cv2.circle(frame, (int(p[0]), int(p[1])), radius, color, -1, cv2.LINE_AA)

    # ---- legacy debug overlays (only drawn when render.debug_boxes) ------- #
    def draw_athlete_box(self, frame, box) -> None:
        if box is None:
            return
        x, y, w, h = int(box.x), int(box.y), int(box.w), int(box.h)
        cv2.rectangle(frame, (x, y), (x + w, y + h), (255, 255, 0), 2)
        tid = getattr(box, "track_id", None)
        label = f"ATHLETE #{tid}" if tid is not None and tid >= 0 else "ATHLETE"
        cv2.putText(frame, label, (x, max(12, y - 4)),
                    self._FONT, self._font_scale * 0.8, (255, 255, 0), 1, cv2.LINE_AA)

    def draw_candidate_boxes(self, frame, other_boxes) -> None:
        if not other_boxes:
            return
        for b in other_boxes:
            x, y, w, h = int(b.x), int(b.y), int(b.w), int(b.h)
            cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 0, 160), 1)  # dim red
            tid = getattr(b, "track_id", None)
            if tid is not None and tid >= 0:
                cv2.putText(frame, f"#{tid}", (x, max(10, y - 2)),
                            self._FONT, self._font_scale * 0.7, (0, 0, 160), 1, cv2.LINE_AA)

    def draw_event_markers(self, frame, events) -> None:  # Phase 5/7
        """events: optional dict, e.g. {"onset": True}. Flashes a banner at onset."""
        if not events:
            return
        if events.get("onset"):
            cv2.rectangle(frame, (0, self._banner_h),
                          (self._w, self._banner_h + max(20, int(0.06 * self._h))),
                          (0, 0, 255), -1)
            cv2.putText(frame, "ONSET - CLOCK START", (8, self._banner_h + int(0.045 * self._h)),
                        self._FONT, self._font_scale, (255, 255, 255), self._thick, cv2.LINE_AA)

    # ---- HUD drawing ----------------------------------------------------- #
    def _draw_status_banner(self, frame) -> None:
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (self._w, self._banner_h), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)
        text = f"STATUS: {self._status} | REASON: {self._reason}"
        y = int(self._banner_h * 0.7)
        cv2.putText(frame, text, (6, y), self._FONT, self._font_scale,
                    (255, 255, 255), self._thick, cv2.LINE_AA)

    def _draw_clock(self, frame, timestamp_s: float) -> None:
        text = _fmt_clock(timestamp_s)
        y = self._h - 8
        cv2.putText(frame, text, (6, y), self._FONT, self._font_scale,
                    (0, 0, 0), self._thick + 2, cv2.LINE_AA)  # outline for legibility
        cv2.putText(frame, text, (6, y), self._FONT, self._font_scale,
                    (0, 255, 0), self._thick, cv2.LINE_AA)

    def _draw_frame_counter(self, frame, frame_index: int) -> None:
        text = f"{frame_index} / {max(0, self._total - 1)}"
        (tw, _), _ = cv2.getTextSize(text, self._FONT, self._font_scale, self._thick)
        x = self._w - tw - 6
        y = self._h - 8
        cv2.putText(frame, text, (x, y), self._FONT, self._font_scale,
                    (0, 0, 0), self._thick + 2, cv2.LINE_AA)
        cv2.putText(frame, text, (x, y), self._FONT, self._font_scale,
                    (255, 255, 255), self._thick, cv2.LINE_AA)


# --------------------------------------------------------------------------- #
# Per-frame CSV logger — fixed superset header, extendable
# --------------------------------------------------------------------------- #
class PerFrameCSVLogger:
    """One row per frame. COLUMNS is a fixed superset: later phases ADD keys and
    fill them; absent values write as "" so old code never breaks. Stable column
    names let score.py / pandas rely on them."""

    COLUMNS = [
        "frame_index", "timestamp_s",
        # placeholders for later phases (blank until computed)
        "athlete_track_id", "locked_flag", "athlete_cx", "athlete_cy",
        "box_x", "box_y", "box_w", "box_h",
        "com_velocity", "com_accel",
        "onset_flag", "reversal_flag", "center_cross_flag",
        "distance_gate_status",
    ]

    def __init__(self, path: Path):
        self.path = Path(path)
        self._f = open(self.path, "w", newline="", encoding="utf-8")
        self._writer = csv.DictWriter(
            self._f, fieldnames=self.COLUMNS, restval="", extrasaction="ignore"
        )
        self._writer.writeheader()

    def log(self, frame_index: int, timestamp_s: float, **signals) -> None:
        row = {"frame_index": frame_index, "timestamp_s": f"{timestamp_s:.6f}"}
        row.update(signals)
        self._writer.writerow(row)

    def close(self) -> None:
        if self._f is not None:
            self._f.close()
            self._f = None

    def __enter__(self) -> "PerFrameCSVLogger":
        return self

    def __exit__(self, *exc) -> None:
        self.close()


# --------------------------------------------------------------------------- #
# JSON result + console report
# --------------------------------------------------------------------------- #
def write_result_json(result: DrillResult, path: Path) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(result.to_json_dict(), f, indent=2)


def print_clip_report(info, drill, artifacts: dict) -> None:
    """Reuse the Phase-1 probe report, then append drill + artifact paths."""
    print(_probe_report(info))
    print(f"drill                    : {drill.name}")
    print("--- artifacts ---")
    for key in ("mp4", "json", "csv"):
        if key in artifacts:
            print(f"{key:24s} : {artifacts[key]}")
    if "fourcc" in artifacts:
        print(f"{'video_fourcc':24s} : {artifacts['fourcc']}")
    print("=========================================")
