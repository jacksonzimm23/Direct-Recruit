"""Phase 5 — generic event primitives. Plan 5 ships movement-ONSET detection.

The onset = the clock-start = the first COMMITTED, sustained acceleration toward
the first touch (not stance jitter — breathing, weight shift, hand twitch). This
mimics a human reaction-timer: it fires on the *commit*, not the twitch.

ATHLETE-AGNOSTIC + RULE 0: the speed floor is derived from THIS athlete's own
motion in THIS clip — never a fixed pixel threshold, and never from ground truth.
`floor = rest + frac * (peak - rest)`, where rest = baseline at the start, peak =
the athlete's own high-end speed. A fast burner and a slow grinder both work.

`detect_onset` is a pure function over the signal arrays — no I/O, no model.
"""

from __future__ import annotations

from typing import Optional

import numpy as np


def detect_onset(com_speed, com_accel, valid, config) -> Optional[int]:
    """Return the onset frame index, or None if no committed ramp is found.

    com_speed: (N,) body-heights/sec (NaN where invalid).
    com_accel: (N,) body-heights/sec^2 (NaN where invalid).
    valid:     (N,) bool — frames with a usable COM.
    config:    loaded dict (onset block).
    """
    ocfg = config["onset"]
    rest_window = int(ocfg.get("onset_rest_window_frames", 8))
    rel_frac = float(ocfg.get("onset_rel_floor_frac", 0.25))
    debounce = int(ocfg.get("onset_debounce_frames", 3))
    require_accel = bool(ocfg.get("require_accel_spike", True))
    backoff = int(ocfg.get("onset_backoff", 1))
    accel_floor_frac = float(ocfg.get("onset_accel_floor_frac", 0.10))
    # A real drill start is a SUSTAINED commit, not a transient spike that settles
    # back. After a candidate ramp, require the motion to STAY elevated over a
    # longer confirmation window (a fraction of frames must stay above floor) —
    # this rejects pose/COM jitter bursts at the very start.
    confirm_window = int(ocfg.get("onset_confirm_window_frames", 10))
    confirm_frac = float(ocfg.get("onset_confirm_stay_frac", 0.6))

    speed = np.asarray(com_speed, dtype=float)
    accel = np.asarray(com_accel, dtype=float)
    n = len(speed)
    finite = np.isfinite(speed)
    if finite.sum() < max(debounce + 1, 4):
        return None

    # Baseline "rest" speed from the first valid frames; "peak" from the high end.
    valid_speeds = speed[finite]
    rest_idx = np.where(finite)[0][:rest_window]
    rest = float(np.median(speed[rest_idx])) if rest_idx.size else float(np.min(valid_speeds))
    peak = float(np.percentile(valid_speeds, 95))
    if peak <= rest:
        return None  # no real motion range -> no onset

    floor = rest + rel_frac * (peak - rest)

    # Optional positive-accel-spike requirement, also athlete-relative.
    accel_finite = accel[np.isfinite(accel)]
    accel_floor = (accel_floor_frac * float(np.percentile(accel_finite, 95))
                   if accel_finite.size else 0.0)

    # Scan for the first frame starting a run of `debounce` consecutive valid
    # frames all above the floor (ignoring sub-threshold flickers).
    i = 0
    while i < n:
        if not (finite[i] and speed[i] > floor):
            i += 1
            continue
        # candidate ramp start at i — check it sustains
        j = i
        run = 0
        while j < n and finite[j] and speed[j] > floor:
            run += 1
            j += 1
        if run >= debounce:
            if require_accel:
                # require a positive accel spike within the ramp's leading edge
                lead = accel[i:min(n, i + debounce + 1)]
                lead = lead[np.isfinite(lead)]
                if lead.size == 0 or float(np.max(lead)) < accel_floor:
                    i = j
                    continue
            # SUSTAINED-COMMIT check: the motion must STAY elevated over a longer
            # window, not be a transient spike that collapses back to rest. This
            # rejects the early pose/COM jitter burst. Look from the ramp start
            # across confirm_window frames; require >= confirm_frac of valid frames
            # to remain above the floor.
            w_end = min(n, i + confirm_window)
            wv = [speed[k] for k in range(i, w_end) if finite[k]]
            if wv and (sum(1 for s in wv if s > floor) / len(wv)) < confirm_frac:
                i = j
                continue  # transient that settled back -> not the real onset
            onset = max(0, i - backoff)
            return onset
        i = j

    return None


# --------------------------------------------------------------------------- #
# Self-check — verify onset logic deterministically (no ML, no ground truth)
# --------------------------------------------------------------------------- #
def _self_check() -> bool:
    cfg = {"onset": {"onset_rest_window_frames": 5, "onset_rel_floor_frac": 0.25,
                     "onset_debounce_frames": 3, "require_accel_spike": False,
                     "onset_backoff": 1}}
    ok = True

    def check(name, got, want):
        nonlocal ok
        passed = got == want
        ok = ok and passed
        print(f"  [{'PASS' if passed else 'FAIL'}] {name}: got {got}, want {want}")

    # Flat rest (~0.02), then a clean ramp. rest~0.02, peak~1.25, floor~0.33.
    # First frame above floor is index 13 (0.60); backoff 1 -> onset 12.
    speed = np.array([0.02, 0.01, 0.03, 0.02, 0.01, 0.02, 0.03, 0.02, 0.01, 0.02,
                      0.03, 0.05, 0.30, 0.60, 0.90, 1.10, 1.20, 1.25, 1.20, 1.10])
    accel = np.gradient(speed)
    valid = np.ones(len(speed), dtype=bool)
    onset = detect_onset(speed, accel, valid, cfg)
    check("clean ramp onset (floor cross @13, backoff 1)", onset, 12)

    # Pure jitter, no ramp -> None.
    jitter = np.array([0.02, 0.01, 0.03, 0.02, 0.01, 0.02, 0.03, 0.02] * 3)
    check("jitter -> None", detect_onset(jitter, np.gradient(jitter), np.ones(len(jitter), bool), cfg), None)

    # A sub-threshold flicker (one spike at idx 2) that settles, THEN a real ramp.
    # rest~0.02, peak~1.25, floor~0.33; the lone spike isn't sustained (debounce 3)
    # so it's ignored; first sustained cross is index 12 (0.70), backoff 1 -> 11.
    s2 = np.array([0.02, 0.01, 0.40, 0.02, 0.01, 0.02, 0.03, 0.02, 0.01, 0.02,
                   0.05, 0.30, 0.70, 1.00, 1.20, 1.25, 1.20])
    o2 = detect_onset(s2, np.gradient(s2), np.ones(len(s2), bool), cfg)
    check("flicker ignored, sustained ramp (cross @12, backoff 1)", o2, 11)

    # TRANSIENT-COLLAPSE rejection (the real-clip failure mode): a multi-frame
    # spike (frames 2-6) that COLLAPSES back to rest, then a genuine SUSTAINED
    # ramp later. The onset must be the sustained ramp, NOT the collapsing spike.
    cfg2 = {"onset": {"onset_rest_window_frames": 2, "onset_rel_floor_frac": 0.25,
                      "onset_debounce_frames": 3, "require_accel_spike": False,
                      "onset_backoff": 0, "onset_confirm_window_frames": 12,
                      "onset_confirm_stay_frac": 0.6}}
    # rest~0.02, peak~1.2, floor~0.32. A SHORT spike (3 frames, 2-4) clearly
    # collapses back to rest for 5-13 (the confirm window of 12 sees mostly rest),
    # then a genuine SUSTAINED ramp from 14. Onset must be the ramp, not the spike.
    s3 = np.array([0.02, 0.01, 0.60, 0.70, 0.65, 0.02, 0.01, 0.02, 0.01, 0.02,
                   0.01, 0.02, 0.03, 0.02, 0.40, 0.70, 1.00, 1.20, 1.20, 1.15, 1.10])
    o3 = detect_onset(s3, np.gradient(s3), np.ones(len(s3), bool), cfg2)
    check("collapsing spike REJECTED, fires on sustained ramp (>=14)",
          o3 is not None and o3 >= 14, True)

    print(f"\nONSET SELF-CHECK: {'ALL PASS' if ok else 'FAILURES'}")
    return ok


if __name__ == "__main__":
    import sys
    sys.exit(0 if _self_check() else 1)
