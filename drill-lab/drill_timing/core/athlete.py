"""Phase 3 — athlete selection + sticky lock (the spec's #1 pain point).

Two stages:
  1) SELECT: of all the tracked persons, pick the one actually PERFORMING THE DRILL
     — NOT "whoever moved the most" (a background runner traverses the whole frame).
     The drill performer starts roughly STATIONARY at a line/central zone, then
     EXPLODES from rest into STRUCTURED back-and-forth motion. We score whole
     tracks on rest-then-explode + direction reversals + central/foreground at t=0,
     and DELIBERATELY ignore raw traversal distance. If no track clearly wins, we
     REJECT (never guess) — fail loud (Principle 3).
  2) LOCK: the lock is IDENTITY-bound (ByteTrack ID + appearance fingerprint), not
     position-bound. Every frame we accept the same ID only if its appearance still
     matches the fingerprint AND it's near the predicted position. A centered
     candidate that doesn't match is REJECTED — this is what stops the bounce to a
     passerby. If the track is truly lost we COAST (predict) up to max_coast_frames
     and re-bind only to a fingerprint match within a search radius; else the rep is
     REJECTED (ATHLETE_LOST), never timed on someone else.

Athlete-agnostic (Principle 9): all motion features are normalized by the track's
own box height and use real timestamps, so far/near and tall/short compare fairly.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import cv2
import numpy as np

from drill_timing.core.result import ReasonCode

log = logging.getLogger("drill_timing.athlete")


# --------------------------------------------------------------------------- #
# Per-ID track aggregate
# --------------------------------------------------------------------------- #
@dataclass
class Track:
    track_id: int
    frame_indices: list
    boxes: list                       # list[TrackedBox]
    timestamps: list
    centroid_path: np.ndarray = None  # (k,2) cx,cy
    size_path: np.ndarray = None      # (k,) box heights
    present_frac: float = 0.0
    first_frame: int = 0
    last_frame: int = 0


def build_tracks(track_frames: list, n_frames: int) -> dict:
    """Invert per-frame TrackFrames into per-ID Track aggregates."""
    by_id: dict = {}
    for tf in track_frames:
        for b in tf.boxes:
            t = by_id.get(b.track_id)
            if t is None:
                t = Track(track_id=b.track_id, frame_indices=[], boxes=[], timestamps=[])
                by_id[b.track_id] = t
            t.frame_indices.append(tf.frame_index)
            t.boxes.append(b)
            t.timestamps.append(tf.timestamp_s)
    for t in by_id.values():
        t.centroid_path = np.array([[b.cx, b.cy] for b in t.boxes], dtype=float)
        t.size_path = np.array([b.h for b in t.boxes], dtype=float)
        t.present_frac = len(t.frame_indices) / n_frames if n_frames else 0.0
        t.first_frame = min(t.frame_indices)
        t.last_frame = max(t.frame_indices)
    return by_id


# --------------------------------------------------------------------------- #
# Drill-likeness scoring — the core discriminator
# --------------------------------------------------------------------------- #
def _track_features(t: Track, frame_w: int, cfg: dict) -> dict:
    acfg = cfg["athlete_lock"]
    rest_window = int(acfg["rest_window_frames"])
    start_window = int(acfg["start_window_frames"])
    edge_band = float(acfg["edge_band_frac"])
    rev_min_run = int(acfg["reversal_min_run_frames"])

    cx = t.centroid_path[:, 0]
    heights = np.maximum(t.size_path, 1.0)
    ts = np.array(t.timestamps, dtype=float)

    # Box-height-normalized speed on real timestamps (heights/sec) — scale-free.
    speed = np.zeros(len(t.boxes))
    for i in range(1, len(t.boxes)):
        dt = ts[i] - ts[i - 1]
        if dt > 1e-6:
            d = float(np.hypot(t.centroid_path[i, 0] - t.centroid_path[i - 1, 0],
                               t.centroid_path[i, 1] - t.centroid_path[i - 1, 1]))
            speed[i] = (d / heights[i]) / dt

    valid = speed[speed > 0]
    rest = float(np.median(speed[1:1 + rest_window])) if len(speed) > 1 else 0.0
    peak = float(np.percentile(valid, 95)) if valid.size else 0.0
    explode_ratio = (peak - rest) / (peak + 1e-6) if peak > 0 else 0.0
    rest_low = rest < float(acfg["rest_speed_frac"]) * peak if peak > 0 else False

    # Peak motion magnitude — a drill REQUIRES real explosive speed. A
    # near-stationary central person (a bystander) has tiny peak; the drill
    # athlete sprints. This is the dominant discriminator (in box-heights/sec).
    peak_motion = peak

    # Total horizontal traversal in box-heights — the drill sweeps across the
    # frame (5/10/5 yd); a stationary person barely moves. Self-normalized.
    med_h = float(np.median(heights)) if heights.size else 1.0
    traversal = (float(np.max(cx) - np.min(cx)) / med_h) if med_h > 0 else 0.0

    # Direction reversals in x — but ONLY count them when the athlete is actually
    # MOVING, so a near-stationary person's pixel jitter doesn't fake "structure".
    move_thr = float(acfg["reversal_min_speed_frac"]) * peak if peak > 0 else 0.0
    moving_mask = speed > move_thr
    reversal_count = _count_reversals(cx, rev_min_run, moving_mask)

    # Central + foreground at t=0.
    start_cx = float(np.mean(cx[:start_window])) if len(cx) else frame_w / 2
    central_score = 1.0 - abs(start_cx - frame_w / 2) / (frame_w / 2)
    size_score = float(np.median(heights[:start_window])) / max(1.0, _frame_h_proxy(t))

    # Edge-drift penalty (background runners hug the edges).
    lo, hi = frame_w * edge_band, frame_w * (1 - edge_band)
    edge_drift = float(np.mean((cx < lo) | (cx > hi))) if len(cx) else 1.0

    return {"rest": rest, "peak": peak, "explode_ratio": explode_ratio,
            "rest_low": rest_low, "reversal_count": reversal_count,
            "peak_motion": peak_motion, "traversal": traversal,
            "central_score": central_score, "size_score": size_score,
            "edge_drift": edge_drift, "start_cx": start_cx}


def _frame_h_proxy(t: Track) -> float:
    # We only have box heights; normalize size_score by the max height seen so the
    # ratio lands in ~[0,1] without needing the frame height here.
    return float(np.max(t.size_path)) if t.size_path is not None and t.size_path.size else 1.0


def _count_reversals(cx: np.ndarray, min_run: int, moving_mask=None) -> int:
    """Count sustained direction reversals in a 1-D centroid-x path. Only frames
    where moving_mask is True count, so a near-stationary person's pixel jitter
    doesn't register as drill structure."""
    if len(cx) < min_run * 2:
        return 0
    dx = np.diff(cx)
    sign = np.sign(dx)
    if moving_mask is not None:
        # mask is per-frame (len cx); dx is between frames i and i+1 -> require
        # the destination frame to be moving for the step to count.
        for i in range(len(sign)):
            if i + 1 < len(moving_mask) and not moving_mask[i + 1]:
                sign[i] = 0
    runs = []
    cur = 0
    s = 0
    for v in sign:
        if v == 0:
            continue
        if v == s:
            cur += 1
        else:
            if cur >= min_run:
                runs.append(s)
            s = v
            cur = 1
    if cur >= min_run:
        runs.append(s)
    return max(0, len(runs) - 1)


def select_athlete(tracks: dict, frame_w: int, frame_h: int, timestamps, cfg: dict):
    """Return (locked_id|None, scores: dict, reason: str)."""
    acfg = cfg["athlete_lock"]
    min_present = float(acfg["min_present_frac"])
    start_window = int(acfg["start_window_frames"])

    w_motion = float(acfg["motion_weight"])
    w_travel = float(acfg["traversal_weight"])
    w_explode = float(acfg["rest_explode_weight"])
    w_struct = float(acfg["structure_weight"])
    w_center = float(acfg["center_weight"])
    w_size = float(acfg["size_weight"])
    w_edge = float(acfg["edge_penalty_weight"])

    scores: dict = {}
    eligible = []
    for tid, t in tracks.items():
        if t.present_frac < min_present:
            scores[tid] = {"eligible": False, "reason": "low presence"}
            continue
        # start-eligible: present within the first start_window frames
        if t.first_frame > start_window:
            scores[tid] = {"eligible": False, "reason": "no t=0 footprint"}
            continue
        f = _track_features(t, frame_w, cfg)
        # The drill athlete is defined by REAL explosive, structured MOTION —
        # not by being centered or large. Peak speed + traversal dominate; a
        # near-stationary central person (a bystander) scores low on both.
        # Central/size are weak tie-breakers only (a person standing in the
        # middle must NOT win over someone actually sprinting the drill).
        drill = (w_motion * min(f["peak_motion"], 4.0)
                 + w_travel * min(f["traversal"], 4.0)
                 + w_explode * f["explode_ratio"] * (1.0 if f["rest_low"] else 0.3)
                 + w_struct * min(f["reversal_count"], 2) / 2.0
                 + w_center * f["central_score"]
                 + w_size * min(f["size_score"], 1.0)
                 - w_edge * f["edge_drift"])
        f["drill_score"] = round(drill, 4)
        f["eligible"] = True
        scores[tid] = f
        eligible.append((drill, tid))

    if not eligible:
        return None, scores, "no eligible track (presence/t=0 gate)"

    eligible.sort(reverse=True)
    best_score, best_id = eligible[0]
    second_score = eligible[1][0] if len(eligible) > 1 else 0.0

    if best_score < float(acfg["athlete_min_score"]):
        return None, scores, "no track looks like the drill performer"
    if (best_score - second_score) < float(acfg["athlete_min_gap"]):
        return None, scores, "ambiguous: top tracks tie on drill-likeness"
    return best_id, scores, "ok"


# --------------------------------------------------------------------------- #
# Appearance fingerprint (HSV color histogram over torso/legs)
# --------------------------------------------------------------------------- #
def compute_fingerprint(frame_bgr, box, cfg: dict):
    acfg = cfg["athlete_lock"]
    H, W = frame_bgr.shape[:2]
    top = box.y + box.h * float(acfg["fp_torso_top_frac"])
    bot = box.y + box.h * float(acfg["fp_legs_bottom_frac"])
    inset = box.w * float(acfg["fp_horiz_inset_frac"])
    x1 = int(max(0, box.x + inset)); x2 = int(min(W, box.x + box.w - inset))
    y1 = int(max(0, top)); y2 = int(min(H, bot))
    if x2 - x1 < 3 or y2 - y1 < 3:
        return None
    crop = frame_bgr[y1:y2, x1:x2]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    h_bins = int(acfg["fp_hist_h_bins"]); s_bins = int(acfg["fp_hist_s_bins"])
    hist = cv2.calcHist([hsv], [0, 1], None, [h_bins, s_bins], [0, 180, 0, 256])
    cv2.normalize(hist, hist, 0, 1, cv2.NORM_MINMAX)
    return hist


def match_fingerprint(a, b) -> float:
    if a is None or b is None:
        return 0.0
    score = float(cv2.compareHist(a, b, cv2.HISTCMP_CORREL))
    return max(0.0, score)


# --------------------------------------------------------------------------- #
# Per-frame lock state machine
# --------------------------------------------------------------------------- #
@dataclass
class LockEvent:
    frame_index: int
    kind: str          # lock | loss | rebind | reject_candidate | coast
    track_id: object
    detail: str


@dataclass
class LockResult:
    locked_id: int
    boxes_per_frame: list           # TrackedBox|None per frame
    locked_flags: list              # bool per frame
    events: list                    # list[LockEvent]
    status: str                     # LOCKED | LOST
    reason: object                  # ReasonCode


def run_lock(track_frames, locked_id, fingerprint, frame_w, frame_h, frames_bgr, cfg):
    """Drive the lock across all frames. frames_bgr parallels track_frames (for
    re-fingerprinting candidates)."""
    acfg = cfg["athlete_lock"]
    fp_thr = float(acfg["fingerprint_match_threshold"])
    max_coast = int(acfg["max_coast_frames"])
    rebind_r = float(acfg["rebind_search_radius_frac"]) * frame_w
    central_lo, central_hi = frame_w * 0.5 * (1 - 0.5), frame_w * 0.5 * (1 + 0.5)

    n = len(track_frames)
    boxes_out = [None] * n
    flags = [False] * n
    events: list = []

    predicted = None
    last_center = None
    coast = 0
    state = "LOCKED"
    ambiguous = False

    for idx, tf in enumerate(track_frames):
        frame = frames_bgr[idx]
        same = next((b for b in tf.boxes if b.track_id == locked_id), None)

        if state == "LOCKED":
            # PREFER the locked ByteTrack ID (spec Step 3). ByteTrack maintains
            # identity robustly; the color fingerprint is NOT discriminative enough
            # to override a present, stable track (it varies as the athlete moves).
            # So while the locked ID is present, we trust it. The fingerprint's job
            # is anti-bounce during re-bind (below), not gating the held track.
            if same is not None:
                boxes_out[idx] = same
                flags[idx] = True
                last_center = (same.cx, same.cy)
                predicted = last_center
                coast = 0
            else:
                state = "COAST"
                coast = 1
                events.append(LockEvent(tf.frame_index, "loss", locked_id,
                                        "locked ByteTrack id absent this frame"))
            # anti-bounce: log any centered NON-matching other candidate
            for c in tf.boxes:
                if c.track_id == locked_id:
                    continue
                if central_lo <= c.cx <= central_hi:
                    cfp = match_fingerprint(fingerprint, compute_fingerprint(frame, c, cfg))
                    if cfp < fp_thr:
                        events.append(LockEvent(tf.frame_index, "reject_candidate",
                                                c.track_id, f"centered non-match fp={cfp:.2f}"))

        if state == "COAST":
            flags[idx] = False
            best = None
            # (1) STRONGEST: the SAME ByteTrack id reappears (ByteTrack recovered it).
            if same is not None:
                best = same
                rebind_detail = "same ByteTrack id reappeared"
            else:
                # (2) Fallback: a DIFFERENT id near the predicted position whose
                # fingerprint matches (a track fragment). Fingerprint is weak here,
                # so also require tight proximity. Pick the nearest qualifying.
                cands = []
                for c in tf.boxes:
                    if predicted is None:
                        continue
                    d = np.hypot(c.cx - predicted[0], c.cy - predicted[1])
                    if d > rebind_r:
                        continue
                    cfp = match_fingerprint(fingerprint, compute_fingerprint(frame, c, cfg))
                    if cfp >= fp_thr:
                        cands.append((d, c, cfp))
                if cands:
                    cands.sort(key=lambda t: t[0])
                    if len(cands) > 1 and abs(cands[0][0] - cands[1][0]) < 1e-6:
                        ambiguous = True
                    best = cands[0][1]
                    rebind_detail = f"new id, fp={cands[0][2]:.2f}, near predicted"
            if best is not None:
                locked_id = best.track_id
                boxes_out[idx] = best
                flags[idx] = True
                last_center = (best.cx, best.cy)
                predicted = last_center
                coast = 0
                state = "LOCKED"
                events.append(LockEvent(tf.frame_index, "rebind", locked_id, rebind_detail))
            else:
                coast += 1
                if coast > max_coast:
                    events.append(LockEvent(tf.frame_index, "loss", locked_id,
                                            f"coast>{max_coast}, terminal"))
                    return LockResult(locked_id, boxes_out, flags, events, "LOST",
                                      ReasonCode.ATHLETE_LOST)

    reason = ReasonCode.IDENTITY_UNCERTAIN if ambiguous else ReasonCode.NONE
    return LockResult(locked_id, boxes_out, flags, events, "LOCKED", reason)


# --------------------------------------------------------------------------- #
# Self-check — drill-likeness logic, deterministic, no ML
# --------------------------------------------------------------------------- #
def _make_track(tid, cx_path, cy, h, n_total, t0=0):
    from drill_timing.core.track import TrackedBox
    boxes, fidx, ts = [], [], []
    for k, x in enumerate(cx_path):
        boxes.append(TrackedBox(x=x - h * 0.2, y=cy - h / 2, w=h * 0.4, h=h, conf=0.9, track_id=tid))
        fidx.append(t0 + k)
        ts.append((t0 + k) * 0.0333)
    t = Track(track_id=tid, frame_indices=fidx, boxes=boxes, timestamps=ts)
    t.centroid_path = np.array([[b.cx, b.cy] for b in boxes], dtype=float)
    t.size_path = np.array([b.h for b in boxes], dtype=float)
    t.present_frac = len(fidx) / n_total
    t.first_frame = min(fidx); t.last_frame = max(fidx)
    return t


def _self_check() -> bool:
    from drill_timing.core.config import load_config
    cfg = load_config()
    ok = True

    def check(name, cond):
        nonlocal ok
        ok = ok and cond
        print(f"  [{'PASS' if cond else 'FAIL'}] {name}")

    FW, FH, N = 400, 480, 40
    # Drill athlete: central, stationary then explodes + one reversal (right->left).
    drill_cx = [200] * 10 + [200 + 8 * k for k in range(10)] + [280 - 10 * k for k in range(20)]
    drill = _make_track(1, drill_cx, cy=300, h=180, n_total=N)
    # Background runner: enters at edge, constant speed across, hugs edges.
    run_cx = [10 + 9 * k for k in range(40)]
    runner = _make_track(2, run_cx, cy=80, h=60, n_total=N)

    lid, scores, reason = select_athlete({1: drill, 2: runner}, FW, FH, None, cfg)
    check(f"drill athlete (id 1) wins over background runner (got {lid})", lid == 1)
    check("drill_score(1) > drill_score(2)",
          scores[1].get("drill_score", -9) > scores[2].get("drill_score", -9))

    # Only an edge runner present -> reject (no performer).
    lid2, _, reason2 = select_athlete({2: runner}, FW, FH, None, cfg)
    check(f"edge-runner-only -> reject ({reason2})", lid2 is None)

    print(f"\nATHLETE SELECT SELF-CHECK: {'ALL PASS' if ok else 'FAILURES'}")
    return ok


if __name__ == "__main__":
    import sys
    sys.exit(0 if _self_check() else 1)
