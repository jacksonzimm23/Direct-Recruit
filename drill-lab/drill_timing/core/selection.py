"""Per-frame runner selection + identity lock — ports the 40-test `chooseRunner`
family into the engine, adapted to the engine's TWO-STAGE design.

THE TWO-STAGE DESIGN (why this differs from the 40-test). The browser prototype picks
the runner per frame from scratch (COLD score = size+lowness+isolation) and corrects
mistakes with a user CLICK. The engine has something better for picking WHO: the
existing `athlete.select_athlete` drill-likeness scoring (rest→explode + traversal +
reversals) correctly prefers the DRILL PERFORMER over a random big/low mover — which
the 40-test COLD heuristic cannot do. So:

  * Stage 1 (WHO, elsewhere): `select_athlete` picks the performer's identity once →
    an ANCHOR (its per-frame predicted centroid path + median size + HSV fingerprint).
  * Stage 2 (TRACK, here): per frame, `RunnerSelector.choose` LOCKS to that identity
    (nearest-to-last-center with jump+size gates), and on a cold re-acquire its COLD
    score is BIASED toward the anchor path — so the probe sweep re-locks the SAME
    person, never a fresh big/low figure. The click override is DROPPED (offline, no
    UI) and REPLACED by the anchor prior.

PURE LOGIC (no ML, deterministic). It consumes candidate landmark sets already produced
by MediaPipe and the ROI, maps them to full-frame `Box`es (the engine invariant), and
returns the chosen one. Config-driven (Principle 7): `tracker.mediapipe_roi.selection.*`.
Fail-loud friendly (Principle 3): returns None (a miss) rather than guessing a wrong
person — the ROI widens and fade-hold covers the gap.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from drill_timing.core.detect import Box


# --------------------------------------------------------------------------- #
# Candidate + anchor value types
# --------------------------------------------------------------------------- #
@dataclass
class Candidate:
    """One person MediaPipe returned this frame, mapped to full-frame px."""
    index: int                 # index into the frame's pose/mask lists
    bbox: Box                  # visibility-filtered landmark bbox, full-frame px
    eligible: bool = True


@dataclass
class Anchor:
    """The Stage-1 drill-performer identity, used to bias Stage-2 tracking."""
    centroid_path: np.ndarray  # (k,2) cx,cy in full-frame px
    frame_indices: list        # frame index per centroid_path row
    median_size: float         # median bbox diagonal (full-frame px)
    fingerprint: object = None # HSV histogram from athlete.compute_fingerprint
    _by_frame: dict = field(default_factory=dict)

    def predicted_center(self, frame_index: int):
        """The anchor's expected center at a given frame (exact if present, else the
        nearest known frame). None if the anchor has no path."""
        if not self._by_frame:
            for k, fi in enumerate(self.frame_indices):
                self._by_frame[int(fi)] = (float(self.centroid_path[k, 0]),
                                           float(self.centroid_path[k, 1]))
        if not self._by_frame:
            return None
        if frame_index in self._by_frame:
            return self._by_frame[frame_index]
        nearest = min(self._by_frame, key=lambda fi: abs(fi - frame_index))
        return self._by_frame[nearest]


def build_anchor(track, fingerprint, n_frames: int) -> Anchor:
    """Build the Stage-2 anchor from a Stage-1 `athlete.Track` + its fingerprint.

    `track` is the locked drill-performer track (has .centroid_path (k,2),
    .size_path (k,), .frame_indices). `median_size` is the median box DIAGONAL so it
    compares with `bbox_of`'s diag. n_frames is accepted for symmetry/future use."""
    sizes = np.asarray(track.size_path, dtype=float)  # box heights
    # approximate diagonal from height: drill boxes are ~0.4*h wide (see athlete
    # _make_track); diag = hypot(w, h) = h*hypot(0.4, 1) ~= 1.077*h. Use h*1.077 as a
    # stable proxy so the LOCKED size-ratio gate is in the same units as bbox_of.diag.
    med_diag = float(np.median(sizes) * 1.077) if sizes.size else 0.0
    return Anchor(
        centroid_path=np.asarray(track.centroid_path, dtype=float),
        frame_indices=list(track.frame_indices),
        median_size=med_diag,
        fingerprint=fingerprint,
    )


# --------------------------------------------------------------------------- #
# bbox of a candidate's landmarks (port of bboxOf) + eligibility (port of isEligible)
# --------------------------------------------------------------------------- #
def bbox_of(landmarks_norm: np.ndarray, roi, vis_thr: float = 0.4) -> Box:
    """Visibility-filtered bbox of one candidate's landmarks, mapped crop→full-frame.

    `landmarks_norm` is (M,3) normalized-to-crop (x, y, visibility). `roi` has
    .x/.y/.w/.h (full-frame px). Mirrors the 40-test bboxOf: drop low-visibility
    joints so occluded/guessed points don't balloon the box; fall back to all points
    if too few survive."""
    lm = np.asarray(landmarks_norm, dtype=float)
    if lm.ndim != 2 or lm.shape[0] == 0:
        return Box(0.0, 0.0, 0.0, 0.0, 0.0)
    vis = lm[:, 2] if lm.shape[1] > 2 else np.ones(lm.shape[0])
    pts = lm[vis > vis_thr]
    if pts.shape[0] < 8:
        pts = lm
    fx = roi.x + pts[:, 0] * roi.w
    fy = roi.y + pts[:, 1] * roi.h
    minx, maxx = float(np.min(fx)), float(np.max(fx))
    miny, maxy = float(np.min(fy)), float(np.max(fy))
    return Box(minx, miny, maxx - minx, maxy - miny, 1.0)


def _diag(b: Box) -> float:
    return float(np.hypot(b.w, b.h))


def is_eligible(b: Box, frame_w: int, frame_h: int, scfg: dict) -> bool:
    """Port of isEligible: drop candidates that can NEVER be the runner regardless of
    regime — a noise blob, a close-up face/torso, one in the excluded bottom band, or
    a degenerate off-frame box. scfg = tracker.mediapipe_roi.selection."""
    frame_diag = float(np.hypot(frame_w, frame_h))
    d = _diag(b)
    if d < float(scfg.get("min_diag_frac", 0.10)) * frame_diag:
        return False
    if d > float(scfg.get("max_diag_frac", 0.85)) * frame_diag:
        return False
    if b.cy > float(scfg.get("exclude_below_frac", 1.0)) * frame_h:
        return False
    if b.cx < 0 or b.cx > frame_w or b.cy < 0:
        return False
    return True


# --------------------------------------------------------------------------- #
# The per-frame selector (port of chooseRunner: LOCKED / COLD regimes)
# --------------------------------------------------------------------------- #
class RunnerSelector:
    """Per-frame choose + identity lock, biased toward the Stage-1 anchor."""

    def __init__(self, anchor: Anchor | None, frame_w: int, frame_h: int, cfg: dict):
        self.anchor = anchor
        self.fw = int(frame_w)
        self.fh = int(frame_h)
        scfg = (cfg.get("tracker", {}).get("mediapipe_roi", {}).get("selection", {}))
        self.scfg = scfg
        self.max_jump = float(scfg.get("locked_max_jump_frac", 0.45)) * self.fw
        self.max_size_ratio = float(scfg.get("locked_max_size_ratio", 2.2))
        self.lock_size_lp = float(scfg.get("lock_size_lowpass", 0.6))
        self.cold_min_diag = float(scfg.get("cold_min_diag_short_frac", 0.12)) * min(self.fw, self.fh)
        self.w_size = float(scfg.get("cold_w_size", 1.6))
        self.w_low = float(scfg.get("cold_w_low", 1.0))
        self.w_iso = float(scfg.get("cold_w_iso", 0.7))
        self.w_anchor = float(scfg.get("cold_w_anchor", 1.0))
        # lock state
        self.locked_center = None   # (x, y)
        self.locked_size = 0.0      # diagonal px

    def choose(self, candidates: list[Candidate], frame_index: int) -> Candidate | None:
        """Pick the runner among this frame's candidates, or None (a miss).

        LOCKED: nearest to the last confirmed center, gated to a believable jump +
        scale; low-pass eases the lock so noise doesn't make it twitchy.
        COLD (no lock yet / re-acquire): score size + lowness + isolation + ANCHOR
        proximity (the Stage-1 drill-performer prior), with a min-size floor."""
        boxes = [c for c in candidates if c.eligible]
        if not boxes:
            return None

        # LOCKED regime
        if self.locked_center is not None:
            best, best_score = None, 1e18
            for c in boxes:
                dist = float(np.hypot(c.bbox.cx - self.locked_center[0],
                                      c.bbox.cy - self.locked_center[1]))
                if dist > self.max_jump:
                    continue
                d = _diag(c.bbox)
                if self.locked_size > 0:
                    ratio = max(d, self.locked_size) / max(1e-6, min(d, self.locked_size))
                    if ratio > self.max_size_ratio:
                        continue
                else:
                    ratio = 1.0
                score = dist + (ratio - 1.0) * self.fw * 0.15
                if score < best_score:
                    best_score, best = score, c
            if best is not None:
                self.locked_center = (best.bbox.cx, best.bbox.cy)
                d = _diag(best.bbox)
                self.locked_size = (self.locked_size * self.lock_size_lp
                                    + d * (1 - self.lock_size_lp)) if self.locked_size else d
                return best
            return None  # nobody plausible near the lock -> a miss (fade-hold covers it)

        # COLD regime: re-acquire / first lock
        best, best_score = None, -1e18
        ax = self.anchor.predicted_center(frame_index) if self.anchor else None
        anchor_norm = max(1.0, min(self.fw, self.fh))
        for c in boxes:
            b = c.bbox
            d = _diag(b)
            if d < self.cold_min_diag:
                continue
            # isolation: distance to the nearest OTHER candidate (the performer stands
            # alone; bystanders huddle), normalized to frame width.
            nearest = 1e9
            for o in boxes:
                if o is c:
                    continue
                nearest = min(nearest, float(np.hypot(o.bbox.cx - b.cx, o.bbox.cy - b.cy)))
            if nearest == 1e9:
                nearest = self.fw
            size_score = d / min(self.fw, self.fh)
            low_score = (b.y + b.h) / self.fh
            iso_score = min(nearest / (self.fw * 0.5), 1.0)
            anchor_score = 0.0
            if ax is not None:
                dist_a = float(np.hypot(b.cx - ax[0], b.cy - ax[1]))
                anchor_score = max(0.0, 1.0 - dist_a / anchor_norm)  # 1 = on the anchor
            score = (self.w_size * size_score + self.w_low * low_score
                     + self.w_iso * iso_score + self.w_anchor * anchor_score)
            if score > best_score:
                best_score, best = score, c
        if best is not None:
            self.locked_center = (best.bbox.cx, best.bbox.cy)
            self.locked_size = _diag(best.bbox)
        return best

    def reset_lock(self) -> None:
        """Drop the lock (e.g. when the ROI fully widened) so COLD re-acquires."""
        self.locked_center = None
        self.locked_size = 0.0


# --------------------------------------------------------------------------- #
# Self-check — pure logic, deterministic, no ML
# --------------------------------------------------------------------------- #
def _self_check() -> bool:
    ok = True

    def check(name, cond):
        nonlocal ok
        ok = ok and bool(cond)
        print(f"  [{'PASS' if cond else 'FAIL'}] {name}")

    FW, FH = 1080, 1920
    cfg = {"tracker": {"mediapipe_roi": {"selection": {
        "min_diag_frac": 0.10, "max_diag_frac": 0.85, "exclude_below_frac": 1.0,
        "cold_min_diag_short_frac": 0.12, "cold_w_size": 1.6, "cold_w_low": 1.0,
        "cold_w_iso": 0.7, "cold_w_anchor": 1.0, "locked_max_jump_frac": 0.45,
        "locked_max_size_ratio": 2.2, "lock_size_lowpass": 0.6,
    }}}}
    scfg = cfg["tracker"]["mediapipe_roi"]["selection"]

    class _R:  # minimal roi stub
        x = 0.0; y = 0.0; w = float(FW); h = float(FH)
    roi = _R()

    # bbox_of maps normalized crop coords to full-frame px and DROPS low-vis points
    # (>=8 high-vis points so the filter keeps them; extremes at x=0.4/0.6, y=0.4/0.8).
    hi = [[0.4, 0.4, 0.9], [0.6, 0.8, 0.9], [0.5, 0.5, 0.9], [0.45, 0.6, 0.9],
          [0.55, 0.45, 0.9], [0.5, 0.7, 0.9], [0.42, 0.55, 0.9], [0.58, 0.65, 0.9]]
    lm = np.array(hi + [[0.0, 0.0, 0.0], [0.99, 0.99, 0.1]])  # 2 low-vis points dropped
    b = bbox_of(lm, roi)
    check("bbox_of maps to full-frame px + drops low-vis points",
          abs(b.x - 0.4 * FW) < 1 and abs((b.y + b.h) - 0.8 * FH) < 1
          and abs((b.x + b.w) - 0.6 * FW) < 1)

    # eligibility gates
    frame_diag = np.hypot(FW, FH)
    tiny = Box(10, 10, 5, 5, 1.0)
    huge = Box(0, 0, FW, FH, 1.0)
    good = Box(400, 900, 200, 500, 1.0)
    check("tiny blob rejected", not is_eligible(tiny, FW, FH, scfg))
    check("oversized close-up rejected", not is_eligible(huge, FW, FH, scfg))
    check("normal person eligible", is_eligible(good, FW, FH, scfg))

    # LOCKED rejects a teleport and a huge size jump
    sel = RunnerSelector(None, FW, FH, cfg)
    sel.locked_center = (540, 900); sel.locked_size = _diag(good)
    near = Candidate(0, Box(560, 910, 200, 500, 1.0))
    teleport = Candidate(1, Box(1000, 100, 200, 500, 1.0))
    chosen = sel.choose([near, teleport], 5)
    check("LOCKED picks the near candidate, not the teleport", chosen is near)
    sel.locked_center = (540, 900); sel.locked_size = _diag(good)
    giant = Candidate(0, Box(545, 905, 700, 1500, 1.0))  # ~3x size
    only_giant = sel.choose([giant], 6)
    check("LOCKED rejects a >2.2x size jump (miss)", only_giant is None)

    # COLD biased by the anchor: two similar candidates, the one on the anchor wins
    anchor = Anchor(centroid_path=np.array([[300.0, 900.0]]), frame_indices=[0],
                    median_size=_diag(good), fingerprint=None)
    sel2 = RunnerSelector(anchor, FW, FH, cfg)
    on_anchor = Candidate(0, Box(220, 800, 160, 420, 1.0))   # center ~ (300, 1010) near anchor x
    off_anchor = Candidate(1, Box(760, 800, 160, 420, 1.0))  # far from anchor
    pick = sel2.choose([on_anchor, off_anchor], 0)
    check("COLD prefers the candidate near the Stage-1 anchor", pick is on_anchor)

    # build_anchor from a Track-like object
    class _T:
        centroid_path = np.array([[300.0, 900.0], [320.0, 905.0]])
        size_path = np.array([460.0, 470.0])
        frame_indices = [0, 1]
    a = build_anchor(_T(), fingerprint=None, n_frames=2)
    check("build_anchor predicts center at a known frame", a.predicted_center(1) == (320.0, 905.0))
    check("build_anchor falls back to nearest frame", a.predicted_center(50) == (320.0, 905.0))

    print(f"\nSELECTION SELF-CHECK: {'ALL PASS' if ok else 'FAILURES'}")
    return ok


if __name__ == "__main__":
    import sys
    sys.exit(0 if _self_check() else 1)
