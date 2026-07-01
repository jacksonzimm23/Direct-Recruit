"""Phase 1 — VFR-safe true-time video ingest.

Convert a phone clip into frames with **accurate real-world timestamps**. Phone
clips (esp. social re-encodes) are often variable frame rate (VFR): the file says
30fps while frames actually land at uneven intervals. Timing by frame_index / FPS
is then wrong. This module reads real per-frame timestamps and times by timestamp
deltas (Operating Principles 4 & 6).

Generic by design: works on ANY clip, never special-cased to one. Timing is
deterministic math here — no ML.

Import discipline: this module's runtime path imports only OpenCV, numpy, the
config loader, and (lazily) imageio_ffmpeg + stdlib. It must NOT import
torch/mediapipe/ultralytics, so `--probe` stays fast and works even if the heavy
perception deps are broken.

CLI:
    python -m drill_timing.core.video --probe "clip.mp4"
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterator, Optional

import cv2
import numpy as np

from drill_timing.core.config import load_config

# Determinism (spec Phase -1): seed the stdlib + numpy RNGs at import. torch is
# intentionally NOT imported here; torch seeding lives in the modules that use it.
random.seed(0)
np.random.seed(0)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("drill_timing.video")


# --------------------------------------------------------------------------- #
# Clip metadata
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class ClipInfo:
    """Everything Phase 1 learns about a clip. Frozen = an immutable record."""

    path: str
    nominal_fps: float                 # CAP_PROP_FPS (may be a weird re-encode value)
    frame_count: int                   # frames actually decoded (authoritative)
    width: int
    height: int
    is_vfr: bool
    timestamp_source: str              # 'ffprobe' | 'opencv_pos_msec' | 'assumed_cfr'
    first_pts_s: float                 # raw first timestamp BEFORE normalization
    duration_by_index_s: float         # frame_count / nominal_fps
    duration_by_timestamps_s: float    # normalized (last - first)
    delta_mean_ms: float
    delta_stdev_ms: float
    ffprobe_duration_s: Optional[float]
    ffprobe_vs_opencv_frame_diff: Optional[float]  # |dur diff| in units of frame periods

    @property
    def resolution(self) -> tuple[int, int]:
        return (self.width, self.height)


# --------------------------------------------------------------------------- #
# ffprobe helpers (used only if a real ffprobe is on PATH)
# --------------------------------------------------------------------------- #
def _find_ffprobe() -> Optional[str]:
    """Return a real ffprobe executable on PATH, or None.

    Note: imageio-ffmpeg bundles ffmpeg only (no ffprobe), so we never synthesize
    an ffprobe path from it — we require a real one (e.g. `choco install ffmpeg`).
    """
    return shutil.which("ffprobe")


def _ffprobe_packet_timestamps(ffprobe: str, path: str) -> list[float]:
    """Per-packet presentation timestamps (seconds) for the first video stream."""
    cmd = [
        ffprobe, "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "packet=pts_time",
        "-of", "json", path,
    ]
    out = subprocess.run(cmd, capture_output=True, text=True, check=True)
    data = json.loads(out.stdout or "{}")
    ts = []
    for pkt in data.get("packets", []):
        v = pkt.get("pts_time")
        if v is not None:
            try:
                ts.append(float(v))
            except (TypeError, ValueError):
                pass
    return ts


def _ffprobe_format_duration(ffprobe: str, path: str) -> Optional[float]:
    """Container-reported duration (seconds), or None if unavailable."""
    cmd = [
        ffprobe, "-v", "error",
        "-show_entries", "format=duration",
        "-of", "json", path,
    ]
    out = subprocess.run(cmd, capture_output=True, text=True, check=True)
    data = json.loads(out.stdout or "{}")
    dur = data.get("format", {}).get("duration")
    if dur is None:
        return None
    try:
        return float(dur)
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------------------- #
# VFR detection
# --------------------------------------------------------------------------- #
def detect_vfr(raw_ts_seconds: list[float], cfg: dict) -> tuple[bool, float, float]:
    """Decide VFR vs CFR from a timestamp track. Returns (is_vfr, mean_ms, stdev_ms).

    The track is normalized (subtract the first timestamp) before analysis, which
    cancels container quirks like a negative first PTS — that offset must never
    flip a clean CFR clip to VFR. We then look at inter-frame delta spacing:
      - primary: stdev of deltas exceeds `vfr_delta_tolerance_ms`, OR
      - secondary: too large a fraction of deltas are gross outliers (>3x median).
    Tolerances live in config (no magic numbers in code).
    """
    vcfg = cfg["video"]
    tol_ms = float(vcfg["vfr_delta_tolerance_ms"])
    outlier_frac_allowed = float(vcfg["vfr_max_outlier_frac"])

    ts = np.asarray(raw_ts_seconds, dtype=float)
    if ts.size < 3:
        return (False, 0.0, 0.0)
    ts = ts - ts[0]                       # NORMALIZE — kills the first-PTS offset
    d = np.diff(ts) * 1000.0              # inter-frame deltas in ms
    d = d[d > 0]                          # drop non-monotonic / duplicate stamps
    if d.size < 2:
        return (False, 0.0, 0.0)

    mean_ms = float(np.mean(d))
    stdev_ms = float(np.std(d))
    median = float(np.median(d))

    is_vfr = stdev_ms > tol_ms
    if median > 0:
        big = int(np.sum(np.abs(d - median) > 3.0 * median))
        if big / d.size > outlier_frac_allowed:
            is_vfr = True
    return (is_vfr, mean_ms, stdev_ms)


# --------------------------------------------------------------------------- #
# The video source
# --------------------------------------------------------------------------- #
class VideoSource:
    """Generic, VFR-safe clip reader.

    On construction it opens the clip, builds a per-frame timestamp track (ffprobe
    preferred, OpenCV POS_MSEC fallback, assumed-CFR last resort), and computes a
    `ClipInfo`. Timestamps are normalized so frame 0 -> 0.0 s.
    """

    def __init__(self, path: str, config: Optional[dict] = None):
        self.path = str(path)
        if not Path(self.path).is_file():
            raise FileNotFoundError(f"video not found: {self.path}")
        self._cfg = config if config is not None else load_config()

        self._cap = cv2.VideoCapture(self.path)
        if not self._cap.isOpened():
            raise RuntimeError(
                f"OpenCV could not open the video (codec/ffmpeg issue?): {self.path}"
            )

        self._nominal_fps = float(self._cap.get(cv2.CAP_PROP_FPS) or 0.0)
        self._width = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        self._height = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

        # Build the timestamp track and per-frame BGR cache in one decode pass.
        self._frames_bgr, raw_ts, self._timestamp_source = self._build_timestamp_track()
        self._frame_count = len(self._frames_bgr)

        self._raw_ts = raw_ts
        self._first_pts_s = float(raw_ts[0]) if raw_ts else 0.0
        # Normalized timestamps: frame 0 -> 0.0
        self._ts = [t - self._first_pts_s for t in raw_ts] if raw_ts else []

        self._info = self._compute_info()

    # ---- construction helpers ------------------------------------------- #
    def _build_timestamp_track(self) -> tuple[list[np.ndarray], list[float], str]:
        """Decode all frames once; return (frames_bgr, raw_timestamps_s, source).

        Frames are cached because clips here are short and a single decode pass
        lets `frames()` re-yield without re-opening, and keeps timestamps paired
        exactly to their frames.
        """
        frames: list[np.ndarray] = []
        pos_msec: list[float] = []
        while True:
            ok, frame = self._cap.read()
            if not ok:
                break
            frames.append(frame)
            pos_msec.append(float(self._cap.get(cv2.CAP_PROP_POS_MSEC)))

        n = len(frames)

        # Preference 1: real ffprobe per-packet timestamps (highest precision).
        ffprobe = _find_ffprobe()
        if ffprobe is not None:
            try:
                ts = _ffprobe_packet_timestamps(ffprobe, self.path)
                if len(ts) >= n and n > 0:
                    return frames, ts[:n], "ffprobe"
                if 0 < len(ts) and abs(len(ts) - n) <= 2 and n > 0:
                    # Off by a frame or two (B-frames / container edge): pad/trim.
                    ts = (ts + [ts[-1]] * n)[:n]
                    return frames, ts, "ffprobe"
                log.warning(
                    "ffprobe returned %d timestamps for %d frames; "
                    "falling back to OpenCV POS_MSEC.", len(ts), n,
                )
            except (subprocess.CalledProcessError, json.JSONDecodeError, OSError) as e:
                log.warning("ffprobe failed (%s); falling back to OpenCV POS_MSEC.", e)

        # Preference 2: OpenCV CAP_PROP_POS_MSEC (good enough for many clips).
        if n > 0 and any(t > 0 for t in pos_msec):
            ts = [t / 1000.0 for t in pos_msec]
            log.warning(
                "Using OpenCV POS_MSEC timestamps (reduced precision vs ffprobe). "
                "Install a real ffprobe for the highest-precision cross-check."
            )
            return frames, ts, "opencv_pos_msec"

        # Preference 3: assumed CFR — only if config allows; else fail loud.
        if self._cfg["video"]["assume_cfr_if_no_timestamps"] and self._nominal_fps > 0 and n > 0:
            log.warning(
                "No usable timestamps; assuming CFR at %.4f fps. Timing precision "
                "is reduced and is_vfr is untrusted.", self._nominal_fps,
            )
            ts = [i / self._nominal_fps for i in range(n)]
            return frames, ts, "assumed_cfr"

        raise RuntimeError(
            f"No usable timestamps and assume_cfr_if_no_timestamps is off: {self.path}"
        )

    def _compute_info(self) -> ClipInfo:
        is_vfr, mean_ms, stdev_ms = detect_vfr(self._raw_ts, self._cfg)

        dur_index = (self._frame_count / self._nominal_fps) if self._nominal_fps > 0 else 0.0
        dur_ts = (self._ts[-1] - self._ts[0]) if len(self._ts) >= 2 else 0.0

        ffprobe_dur: Optional[float] = None
        ffprobe_diff: Optional[float] = None
        ffprobe = _find_ffprobe()
        if ffprobe is not None:
            try:
                ffprobe_dur = _ffprobe_format_duration(ffprobe, self.path)
            except (subprocess.CalledProcessError, json.JSONDecodeError, OSError) as e:
                log.warning("ffprobe duration probe failed (%s).", e)
            if ffprobe_dur is not None and self._nominal_fps > 0:
                frame_period = 1.0 / self._nominal_fps
                ffprobe_diff = abs(ffprobe_dur - dur_ts) / frame_period

        return ClipInfo(
            path=self.path,
            nominal_fps=self._nominal_fps,
            frame_count=self._frame_count,
            width=self._width,
            height=self._height,
            is_vfr=is_vfr,
            timestamp_source=self._timestamp_source,
            first_pts_s=self._first_pts_s,
            duration_by_index_s=dur_index,
            duration_by_timestamps_s=dur_ts,
            delta_mean_ms=mean_ms,
            delta_stdev_ms=stdev_ms,
            ffprobe_duration_s=ffprobe_dur,
            ffprobe_vs_opencv_frame_diff=ffprobe_diff,
        )

    # ---- public surface -------------------------------------------------- #
    @property
    def info(self) -> ClipInfo:
        return self._info

    @property
    def nominal_fps(self) -> float:
        return self._nominal_fps

    @property
    def is_vfr(self) -> bool:
        return self._info.is_vfr

    @property
    def frame_count(self) -> int:
        return self._frame_count

    @property
    def duration_s(self) -> float:
        return self._info.duration_by_timestamps_s

    @property
    def resolution(self) -> tuple[int, int]:
        return (self._width, self._height)

    def frames(self) -> Iterator[tuple[int, np.ndarray, float]]:
        """Yield (frame_index, frame_bgr, timestamp_s). timestamp is normalized
        so frame 0 -> 0.0 s. This is the canonical way downstream phases iterate."""
        for i, frame in enumerate(self._frames_bgr):
            yield i, frame, (self._ts[i] if i < len(self._ts) else 0.0)

    def timestamp_for_index(self, i: int) -> float:
        """Normalized timestamp (s) of frame i."""
        if i < 0 or i >= len(self._ts):
            raise IndexError(f"frame index {i} out of range (0..{len(self._ts) - 1})")
        return self._ts[i]

    def frames_to_seconds(self, i0: int, i1: int) -> float:
        """Elapsed real seconds between two frames, by TIMESTAMP not index/fps.

        This is the converter every later timing module uses — the heart of
        VFR-safe timing.
        """
        return self.timestamp_for_index(i1) - self.timestamp_for_index(i0)

    def close(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None

    def __enter__(self) -> "VideoSource":
        return self

    def __exit__(self, *exc) -> None:
        self.close()


# --------------------------------------------------------------------------- #
# --probe CLI
# --------------------------------------------------------------------------- #
def _probe_report(info: ClipInfo) -> str:
    w, h = info.resolution
    lines = [
        "=== Drill Timing Engine :: clip probe ===",
        f"file                     : {Path(info.path).name}",
        f"resolution               : {w} x {h}",
        f"nominal_fps              : {info.nominal_fps:.4f}",
        f"frame_count              : {info.frame_count}",
        f"first_pts_s              : {info.first_pts_s:.4f}",
        f"timestamp_source         : {info.timestamp_source}",
        f"duration_by_index_s      : {info.duration_by_index_s:.4f}",
        f"duration_by_timestamps_s : {info.duration_by_timestamps_s:.4f}",
        f"frame_delta_mean_ms      : {info.delta_mean_ms:.4f}",
        f"frame_delta_stdev_ms     : {info.delta_stdev_ms:.4f}",
        f"is_vfr                   : {info.is_vfr}",
        "--- ffprobe cross-check ---",
    ]
    if info.ffprobe_duration_s is None:
        lines += [
            "ffprobe_available        : False",
            "ffprobe_duration_s       : n/a",
            "ffprobe_vs_opencv        : n/a",
        ]
    else:
        verdict = ""
        if info.ffprobe_vs_opencv_frame_diff is not None:
            verdict = " PASS" if info.ffprobe_vs_opencv_frame_diff <= 1.0 else " FAIL"
        diff_str = (
            "n/a" if info.ffprobe_vs_opencv_frame_diff is None
            else f"{info.ffprobe_vs_opencv_frame_diff:.3f} frames{verdict}"
        )
        lines += [
            "ffprobe_available        : True",
            f"ffprobe_duration_s       : {info.ffprobe_duration_s:.4f}",
            f"ffprobe_vs_opencv        : {diff_str}",
        ]
    lines.append("=========================================")
    return "\n".join(lines)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m drill_timing.core.video",
        description="Probe a video clip's true-timestamp properties (Phase 1).",
    )
    parser.add_argument("clip", nargs="?", help="path to the video clip")
    parser.add_argument("--probe", dest="probe_clip", help="path to the video clip to probe")
    parser.add_argument("--config", help="path to a config.yaml (defaults to package config)")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = parser.parse_args(argv)

    clip = args.probe_clip or args.clip
    if not clip:
        parser.error("provide a clip path (positional or via --probe)")

    cfg = load_config(args.config)
    try:
        with VideoSource(clip, config=cfg) as src:
            info = src.info
    except (FileNotFoundError, RuntimeError) as e:
        # Fail loud: non-zero exit, clear message.
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(asdict(info), indent=2))
    else:
        print(_probe_report(info))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
