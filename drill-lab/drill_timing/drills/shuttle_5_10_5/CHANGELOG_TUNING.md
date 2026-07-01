# CHANGELOG_TUNING — accepted changes to model/config/timing logic

Per Governance Rule 2: every accepted change records date, what changed,
before/after accuracy on the full ground-truth set, rationale, and who approved.

> **Note on current state:** the ground-truth set is a SINGLE partial clip
> (`v12044...mp4`, start=frame 9, no finish). It also currently REJECTS on the
> Phase 4A field gate (NOT_A_LINED_FIELD — yard lines below detection floor at
> 396×480). So aggregate before/after accuracy is **not yet measurable**; entries
> below report the per-signal effect we CAN observe + self-check results, and flag
> what stays unvalidated until the real 15-20 clip shoot exists.

---

## 2026-06-24 — Onset: clean COM signal + reject collapsing transients

**Approved by:** Jackson (chose "clean the signal first" + "fix by principle, then score").

**What changed (logic, not label-fitting):**
- `core/kinematics.py`: reject physically-impossible COM speeds before smoothing
  (`kinematics.max_plausible_speed_bhs: 12.0` body-heights/sec — a human COM cannot
  move that fast; such samples are pose jitter) → set to NaN; clamp smoothed speed
  to ≥0 (savgol overshoot on spikes was producing impossible negative "speeds").
- `core/events.py::detect_onset`: added a SUSTAINED-COMMIT check — after a candidate
  ramp, require the motion to STAY above floor across a confirmation window
  (`onset_confirm_window_frames: 10`, `onset_confirm_stay_frac: 0.6`), rejecting a
  transient spike that collapses back to rest.
- Config keys added (config.yaml): the three above.

**Effect (observed, single partial clip):**
- Onset moved frame **4 → 18**. Frame 4 was firing on a noise burst (impossible
  −3 / +21 b.h./s samples) that collapsed by frame 9; frame 18 is the genuine
  sustained acceleration past the rest jitter. Neither hits the label (9) within ±2
  — see honest finding below.
- Onset self-check: **4/4 PASS** (clean ramp; jitter→None; flicker ignored;
  collapsing-spike rejected → fires on the real ramp). Pipeline deterministic
  (onset=18 on repeat runs).

**Honest finding / why not ±2:** cleaning the signal revealed this 396×480 clip has
NO clean "stand-still → explode" onset — the small/low-res athlete's mid-hip jitters
at ~1.7 b.h./s even at rest, and the real acceleration only reaches ~2.6, so there's
no crisp commit to detect. Tuning thresholds to land on frame 9 would be **fitting to
one clip's noise** (Rule 0 / overfitting). Decision: keep these principled
improvements; defer EXACT onset accuracy (±2) to higher-res footage where the COM is
clean. **UNVALIDATED:** onset accuracy vs ground truth — needs cleaner footage.

**Reversible:** revert the three config keys + the two code blocks to restore the
prior behavior (onset fired at 4).
