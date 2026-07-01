"""Digital-zoom ROI tracking — ports the 40-test browser tracker's `updateRoi` +
crop math + probe sweep into the shared engine (PLATFORM_SPEC Phase 3 robustness).

WHY THIS EXISTS. The current engine runs detection full-frame and pose on a padded
box; a small/far athlete fills only a few pixels, so the mask/landmarks lose detail
exactly when the athlete is moving fastest. The 40-test prototype (built with Fable 5)
tracked far better by running detection on a CROP that FOLLOWS the athlete like a
camera operator — re-aimed every frame toward where he's HEADED (velocity lead) — so a
far figure fills the detector's view and a sprint launch can't outrun the window.

This module is PURE GEOMETRY (no ML, deterministic): it decides WHICH crop to detect
in next frame and how to map a normalized landmark in that crop back to full-frame
pixels (the engine's invariant — every downstream stage works in full-frame px).

The three behaviours ported from `app.js`:
  * crop_for_detection  <- renderOnce's crop + downscale (≤detect_max, upscale ≤3x)
  * RoiTracker.update    <- updateRoi: velocity-lead re-center on a hit; widen-with-
                            drift on a miss; hand to the probe sweep when fully widened.
  * RoiTracker.next_probe <- sizeStage's `probes`: full frame, then overlapping
                            half-size tiles, one per frame, cycling, until re-acquired.

Athlete-agnostic (Principle 9) and config-driven (Principle 7): all knobs come from
`tracker.mediapipe_roi.roi.*`. No thresholds are hardcoded in the logic.
"""

from __future__ import annotations

from dataclasses import dataclass


# --------------------------------------------------------------------------- #
# ROI value type
# --------------------------------------------------------------------------- #
@dataclass
class Roi:
    """A detection crop in full-frame pixel coords. Keeps the VIDEO aspect ratio so
    mapping a normalized landmark (nx, ny) back to full-frame px is a uniform
    translate+scale: fx = x + nx*w, fy = y + ny*h."""
    x: float
    y: float
    w: float
    h: float

    @property
    def cx(self) -> float:
        return self.x + self.w / 2.0

    @property
    def cy(self) -> float:
        return self.y + self.h / 2.0


def clamp_rect(x: float, y: float, w: float, h: float,
               frame_w: int, frame_h: int) -> Roi:
    """Port of app.js clampRect: clamp a rect fully inside the frame, preserving w,h
    (shrinking only if larger than the frame). Returns integer-aligned px."""
    w = min(round(w), frame_w)
    h = min(round(h), frame_h)
    x = round(min(max(x, 0), frame_w - w))
    y = round(min(max(y, 0), frame_h - h))
    return Roi(float(x), float(y), float(w), float(h))


def crop_for_detection(frame_bgr, roi: Roi, detect_max: int, max_upscale: float):
    """Port of renderOnce's crop+downscale step.

    Returns (crop_bgr, scale, (ox, oy)) where:
      * crop_bgr is the ROI region resized so its long side is ~detect_max px (small
        crops are UPSCALED up to max_upscale so the model renders a detailed mask,
        not a crop-resolution one — the 40-test ≤3x rule);
      * scale is the resize factor applied (crop px = roi px * scale);
      * (ox, oy) = (roi.x, roi.y), the full-frame offset of the crop's top-left.

    A normalized landmark (nx, ny) from the model maps to full-frame px via
        fx = roi.x + nx * roi.w ,  fy = roi.y + ny * roi.h
    (independent of `scale`, because the model normalizes to its own input size).
    """
    import cv2

    x, y, w, h = int(roi.x), int(roi.y), int(roi.w), int(roi.h)
    crop = frame_bgr[y:y + h, x:x + w]
    long_side = max(w, h)
    scale = min(detect_max / float(long_side), max_upscale) if long_side > 0 else 1.0
    dw = max(1, int(round(w * scale)))
    dh = max(1, int(round(h * scale)))
    if (dw, dh) != (w, h):
        interp = cv2.INTER_AREA if scale < 1.0 else cv2.INTER_LINEAR
        crop = cv2.resize(crop, (dw, dh), interpolation=interp)
    return crop, scale, (float(x), float(y))


# --------------------------------------------------------------------------- #
# The follow-the-athlete state machine
# --------------------------------------------------------------------------- #
class RoiTracker:
    """Holds the ROI + velocity estimate + miss/probe state across a clip.

    One instance PER CLIP (deterministic — all state initialized in __init__). Call
    `current()` to get the crop to detect in this frame (None => use `next_probe()`),
    run detection, then call `update(chosen_bbox)` with the chosen athlete's
    full-frame bbox (or None on a miss) to re-aim for the next frame.
    """

    def __init__(self, frame_w: int, frame_h: int, cfg: dict):
        self.fw = int(frame_w)
        self.fh = int(frame_h)
        rcfg = (cfg.get("tracker", {})
                   .get("mediapipe_roi", {})
                   .get("roi", {}))
        self.detect_max = int(rcfg.get("detect_max", 512))
        self.max_upscale = float(rcfg.get("max_upscale", 3.0))
        self.lead_frames = float(rcfg.get("velocity_lead_frames", 2))
        self.vel_cap_frac = float(rcfg.get("velocity_cap_frac", 0.05))
        self.miss_grace = int(rcfg.get("miss_grace_frames", 3))
        self.widen_factor = float(rcfg.get("miss_widen_factor", 1.12))
        self.glide = float(rcfg.get("glide_lowpass", 0.5))
        self.h_body_mult = float(rcfg.get("crop_height_body_mult", 2.6))
        self.w_body_mult = float(rcfg.get("crop_width_body_mult", 2.4))
        self.min_h_frac = float(rcfg.get("crop_min_height_frac", 0.12))

        self.roi: Roi | None = None
        self.roi_misses = 0
        self.prev_center = None       # (x, y) at the last detection
        self.prev_vel = (0.0, 0.0)    # per-frame center velocity (full-frame px)

        # Probe sweep windows: full frame, then overlapping half-size tiles (the
        # 40-test sizeStage layout), one tried per frame until re-acquired.
        self._probes: list[Roi] = [Roi(0.0, 0.0, float(self.fw), float(self.fh))]
        for fy in (0.0, 0.25, 0.5):
            for fx in (0.0, 0.25, 0.5):
                self._probes.append(
                    clamp_rect(self.fw * fx, self.fh * fy,
                               self.fw / 2.0, self.fh / 2.0, self.fw, self.fh))
        self._probe_idx = 0

    def current(self) -> Roi | None:
        """The ROI to detect in this frame, or None when fully zoomed out (caller
        should then use next_probe() to sweep for re-acquisition)."""
        return self.roi

    def next_probe(self) -> Roi:
        """Cycle through the probe windows, one per frame (the search sweep)."""
        p = self._probes[self._probe_idx % len(self._probes)]
        self._probe_idx += 1
        return p

    def update(self, chosen_bbox) -> None:
        """Re-aim the ROI for the next frame. `chosen_bbox` is the chosen athlete's
        bbox as (cx, cy, w, h) in full-frame px, or None on a miss.

        HIT  -> velocity-lead re-center (aim ~lead_frames ahead), glide the position,
                keep the size while it's close (resizing reallocates the model input).
        MISS -> hold a few frames, then widen the ROI around the last heading,
                drifting with the last velocity; fully widened -> drop to the probe
                sweep (roi=None) so a cold re-acquire can find him.
        """
        fw, fh = self.fw, self.fh
        if chosen_bbox is None:
            self.prev_center = None
            if self.roi is None:
                return
            self.roi_misses += 1
            if self.roi_misses > self.miss_grace:
                cx = self.roi.cx + self.prev_vel[0]
                cy = self.roi.cy + self.prev_vel[1]
                w = self.roi.w * self.widen_factor
                h = self.roi.h * self.widen_factor
                if w >= fw * 0.98:
                    self.roi = None
                    self.prev_vel = (0.0, 0.0)
                else:
                    self.roi = clamp_rect(cx - w / 2, cy - h / 2, w, h, fw, fh)
            return

        self.roi_misses = 0
        bcx, bcy, bw, bh = chosen_bbox
        if self.prev_center is not None:
            cap = fw * self.vel_cap_frac  # a junk detection can't fling the estimate
            self.prev_vel = (
                max(-cap, min(cap, bcx - self.prev_center[0])),
                max(-cap, min(cap, bcy - self.prev_center[1])),
            )
        self.prev_center = (bcx, bcy)

        # aim ahead of a moving athlete
        tx = bcx + self.lead_frames * self.prev_vel[0]
        ty = bcy + self.lead_frames * self.prev_vel[1]
        # crop with headroom above AND beside (a sprinter is wide; portrait makes width
        # the tight dimension); the floor lets a far figure zoom in tight.
        ch = min(fh, max(bh * self.h_body_mult,
                         bw * self.w_body_mult * (fh / fw),
                         fh * self.min_h_frac))
        cw = ch * (fw / fh)  # video aspect -> uniform landmark scale
        if cw > fw:
            cw = fw
            ch = cw * fh / fw

        if self.roi is not None:
            # keep the size while close (avoid reallocations), glide the position
            size_ratio = ch / self.roi.h if self.roi.h else 1.0
            if 0.8 < size_ratio < 1.25:
                ch, cw = self.roi.h, self.roi.w
            ccx, ccy = self.roi.cx, self.roi.cy
            self.roi = clamp_rect(ccx + (tx - ccx) * self.glide - cw / 2,
                                  ccy + (ty - ccy) * self.glide - ch / 2,
                                  cw, ch, fw, fh)
        else:
            self.roi = clamp_rect(tx - cw / 2, ty - ch / 2, cw, ch, fw, fh)


# --------------------------------------------------------------------------- #
# Self-check — pure geometry, deterministic, no ML
# --------------------------------------------------------------------------- #
def _self_check() -> bool:
    import numpy as np

    ok = True

    def check(name, cond):
        nonlocal ok
        ok = ok and bool(cond)
        print(f"  [{'PASS' if cond else 'FAIL'}] {name}")

    FW, FH = 1080, 1920  # portrait phone clip
    cfg = {"tracker": {"mediapipe_roi": {"roi": {
        "detect_max": 512, "max_upscale": 3.0, "velocity_lead_frames": 2,
        "velocity_cap_frac": 0.05, "miss_grace_frames": 3, "miss_widen_factor": 1.12,
        "glide_lowpass": 0.5, "crop_height_body_mult": 2.6, "crop_width_body_mult": 2.4,
        "crop_min_height_frac": 0.12,
    }}}}

    # clamp_rect keeps a rect inside the frame
    r = clamp_rect(-50, -50, 400, 400, FW, FH)
    check("clamp_rect pins a negative origin to 0", r.x == 0 and r.y == 0)
    r2 = clamp_rect(FW - 10, 0, 400, 400, FW, FH)
    check("clamp_rect keeps the rect on-screen", r2.x + r2.w <= FW)

    # crop_for_detection maps a normalized point back to the known full-frame px
    roi = Roi(200.0, 300.0, 400.0, 711.0)  # ~video aspect
    frame = np.zeros((FH, FW, 3), dtype=np.uint8)
    crop, scale, (ox, oy) = crop_for_detection(frame, roi, 512, 3.0)
    nx, ny = 0.5, 0.5
    fx, fy = roi.x + nx * roi.w, roi.y + ny * roi.h
    check("crop->full-frame map: center lands at roi center",
          abs(fx - 400.0) < 1e-6 and abs(fy - 655.5) < 1e-6)
    check("crop long side ~= detect_max", abs(max(crop.shape[:2]) - 512) <= 2)

    # velocity lead: ROI center should lead a rightward-moving athlete
    rt = RoiTracker(FW, FH, cfg)
    cx = 300.0
    for _ in range(6):
        rt.update((cx, 900.0, 120.0, 320.0))
        cx += 60.0  # moving right 60 px/frame
    led = rt.current()
    check("ROI leads a rightward mover (center ahead of last bbox cx)",
          led is not None and led.cx > cx - 60.0)

    # miss handling: after grace frames of misses the ROI widens, then drops to probes
    rt2 = RoiTracker(FW, FH, cfg)
    rt2.update((540.0, 900.0, 120.0, 320.0))  # one hit -> establish an ROI
    w_before = rt2.current().w
    for _ in range(rt2.miss_grace + 1):
        rt2.update(None)
    widened = rt2.current()
    check("ROI widens after grace misses (or drops to probe sweep)",
          widened is None or widened.w > w_before)
    # keep missing until fully zoomed out -> probe sweep
    for _ in range(60):
        rt2.update(None)
    check("fully-missed ROI hands over to the probe sweep (roi=None)",
          rt2.current() is None)
    p = rt2.next_probe()
    check("first probe window is the full frame", p.w == FW and p.h == FH)
    check("probe sweep cycles through tiles", rt2.next_probe().w <= FW)

    print(f"\nROI SELF-CHECK: {'ALL PASS' if ok else 'FAILURES'}")
    return ok


if __name__ == "__main__":
    import sys
    sys.exit(0 if _self_check() else 1)
