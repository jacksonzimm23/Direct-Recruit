"""Phase 5 — kinematics: smoothed COM velocity/accel, athlete-scale normalized.

From per-frame center-of-mass (mid-hip) + TRUE timestamps, compute COM speed and
acceleration. Two principles drive the math:

- **Timestamps, not frame index** (Principle 6): velocities use real per-frame
  time deltas, so VFR clips are handled correctly.
- **Athlete-agnostic scale** (Principle 9): speed is expressed in the athlete's
  own **body-heights per second**, so a tall and a short athlete — appearing big
  or small in frame — are treated consistently. (Yard/second comes once Phase 4
  calibration exists.)

Missing pose frames are interpolated over short gaps, then signals are smoothed
with Savitzky-Golay. Frames with no usable COM stay NaN and are excluded upstream.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
from scipy.signal import savgol_filter


@dataclass
class Motion:
    """Per-frame motion signals, aligned to frame indices (NaN where invalid)."""
    com_xy: np.ndarray        # (N, 2) full-frame px, NaN rows where missing
    com_speed: np.ndarray     # (N,) body-heights/sec, smoothed
    com_accel: np.ndarray     # (N,) body-heights/sec^2, smoothed
    body_scale_px: float      # the median body height used to normalize
    valid: np.ndarray         # (N,) bool — frames with a usable COM


def _interpolate_gaps(values: np.ndarray, valid: np.ndarray, max_gap: int) -> np.ndarray:
    """Linearly fill short gaps (<= max_gap consecutive missing) in a 1-D series."""
    out = values.copy()
    n = len(values)
    i = 0
    while i < n:
        if valid[i]:
            i += 1
            continue
        j = i
        while j < n and not valid[j]:
            j += 1
        # gap is [i, j); bounded by valid neighbors i-1 and j
        if 0 < i and j < n and (j - i) <= max_gap:
            left, right = out[i - 1], out[j]
            for k in range(i, j):
                t = (k - (i - 1)) / (j - (i - 1))
                out[k] = left + t * (right - left)
        i = j
    return out


def _smooth(series: np.ndarray, window: int, poly: int) -> np.ndarray:
    """Savitzky-Golay with a short-series guard (NaN-safe on already-filled data)."""
    n = len(series)
    if n < 3:
        return series
    w = min(window, n if n % 2 == 1 else n - 1)
    if w < 3:
        return series
    if w % 2 == 0:
        w -= 1
    p = min(poly, w - 1)
    return savgol_filter(series, w, p)


def compute_motion(coms: list, body_heights: list, timestamps, config) -> Motion:
    """Build smoothed, body-scale-normalized COM speed/accel.

    coms: list of (x,y) or None per frame. body_heights: list of float or None.
    timestamps: array of per-frame seconds (normalized). config: loaded dict.
    """
    n = len(coms)
    valid = np.array([c is not None for c in coms], dtype=bool)
    com_xy = np.full((n, 2), np.nan)
    for i, c in enumerate(coms):
        if c is not None:
            com_xy[i] = c

    # Body scale: median of available body heights (robust to per-frame jitter).
    bh = np.array([h for h in body_heights if h is not None and h > 1], dtype=float)
    body_scale = float(np.median(bh)) if bh.size else np.nan

    ts = np.asarray(timestamps, dtype=float)
    gap = int(config.get("kinematics", {}).get("gap_max_frames", 3))

    if not np.isfinite(body_scale) or valid.sum() < 3:
        # Not enough signal to compute meaningful motion.
        nan = np.full(n, np.nan)
        return Motion(com_xy=com_xy, com_speed=nan, com_accel=nan,
                      body_scale_px=body_scale, valid=valid)

    # Interpolate short gaps in x and y so finite differences are well-defined.
    x = _interpolate_gaps(com_xy[:, 0], valid, gap)
    y = _interpolate_gaps(com_xy[:, 1], valid, gap)
    filled = np.isfinite(x) & np.isfinite(y)

    # Speed via finite differences on TIMESTAMPS, normalized to body-heights/sec.
    speed = np.full(n, np.nan)
    for i in range(1, n):
        if filled[i] and filled[i - 1]:
            dt = ts[i] - ts[i - 1]
            if dt > 1e-6:
                dist_px = float(np.hypot(x[i] - x[i - 1], y[i] - y[i - 1]))
                speed[i] = (dist_px / body_scale) / dt
    speed[0] = speed[1] if n > 1 and np.isfinite(speed[1]) else 0.0

    # CLEAN the raw speed before smoothing. The COM (mid-hip) can jitter on a small
    # / low-res athlete, producing physically-IMPOSSIBLE spikes (a human COM does not
    # move tens of body-heights per second). Such samples are pose noise, not motion:
    # mark them invalid so they don't poison the rest baseline or the smoothing
    # (savgol overshoot on a spike was producing negative "speeds"). Config-driven cap.
    kcfg = config.get("kinematics", {})
    max_bhs = float(kcfg.get("max_plausible_speed_bhs", 12.0))  # body-heights/sec
    impossible = np.isfinite(speed) & (speed > max_bhs)
    if impossible.any():
        speed[impossible] = np.nan  # drop the spike samples (treated as missing)

    # Smooth speed over the finite region, then derive accel from smoothed speed.
    fin = np.isfinite(speed)
    sm_speed = speed.copy()
    if fin.sum() >= 3:
        scfg = config.get("smoothing", {})
        win = int(scfg.get("savgol_window", 7))
        poly = int(scfg.get("savgol_poly", 2))
        sm_speed[fin] = _smooth(speed[fin], win, poly)
    # speed is a magnitude — smoothing overshoot can't make it negative.
    sm_speed = np.where(np.isfinite(sm_speed), np.clip(sm_speed, 0.0, None), sm_speed)

    accel = np.full(n, np.nan)
    for i in range(1, n):
        if np.isfinite(sm_speed[i]) and np.isfinite(sm_speed[i - 1]):
            dt = ts[i] - ts[i - 1]
            if dt > 1e-6:
                accel[i] = (sm_speed[i] - sm_speed[i - 1]) / dt

    return Motion(com_xy=com_xy, com_speed=sm_speed, com_accel=accel,
                  body_scale_px=body_scale, valid=valid)
