"""Pose-continuity verification — ports the 40-test `verifyContinuity` family.

"Verify that it is pose for the whole run." The 40-test prototype made the honest
claim that the athlete's pose was held CONTINUOUSLY start->finish, rather than
assuming it. This module brings that into the engine as a clip-level coverage metric.

WHY MEDIA-TIME, NOT FRAME COUNT. Coverage is integrated over MEDIA TIME (the video's
own timeline), not over how many frames we managed to process. That makes it
frame-rate-INDEPENDENT: a slow machine that processes few frames reports the SAME
coverage as a fast one, because we measure how much of the video's timeline had a
pose. (The 40-test's earlier frame-count version wrongly reported 0% on a slow
headless renderer; the media-time rewrite fixed that.)

SCOPE = THE ACTIVE RUN ONLY. Accounting starts at the FIRST confirmed pose and the
reported span ends at the LAST confirmed pose. The pre-start phase (athlete too far/
small to detect yet) and the trailing outro (no athlete on field) are NOT counted as
dropouts — only genuine MID-RUN gaps (an absent stretch that a LATER pose closes)
count. A contiguous absent stretch longer than `gap_tol_s` is a real dropout.

This is PURE LOGIC (no ML, deterministic, Rule-0-safe — never reads ground truth). It
runs offline over the whole clip at once, so it's a simple function (no per-frame
callback like the browser version needed). Config-driven (Principle 7):
`continuity.gap_tol_s`, `continuity.step_max_s`.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Coverage:
    """Pose-coverage over the active run (first confirmed pose .. last confirmed pose)."""
    coverage_frac: float                      # present / (present + in-run absent)
    run_from_s: float                         # first confirmed-pose media time
    run_to_s: float                           # last confirmed-pose media time
    gaps: list = field(default_factory=list)  # [{"from": s, "to": s, "dur": s}] mid-run dropouts
    worst_gap_s: float = 0.0
    started: bool = True                       # False = no pose ever confirmed


def verify_continuity(timestamps, locked_flags, cfg: dict) -> Coverage:
    """Integrate pose coverage over media time, scoped to the active run.

    Args:
      timestamps:   list[float] media time (seconds) per processed frame, increasing.
      locked_flags: list[bool] — was the athlete's pose CONFIRMED this frame (the
                    HONEST live flag, pre-fade — fade-hold must not inflate this).
      cfg:          config dict; reads continuity.gap_tol_s, continuity.step_max_s.

    Returns a Coverage. If no pose is ever confirmed, returns started=False with
    coverage 0.0 (fail-loud-friendly: the caller can treat "never locked" distinctly).
    """
    ccfg = cfg.get("continuity", {})
    gap_tol = float(ccfg.get("gap_tol_s", 0.20))
    step_max = float(ccfg.get("step_max_s", 0.5))

    n = min(len(timestamps), len(locked_flags))
    started = False
    first_t = last_t = -1.0
    prev_t = -1.0
    prev_pose = False
    present_t = 0.0
    pending_absent_t = 0.0
    absent_t = 0.0
    cur_gap_start = -1.0
    gaps: list = []

    for i in range(n):
        t = float(timestamps[i])
        has_pose = bool(locked_flags[i])
        if not started:
            # ignore everything before the athlete is first confirmed
            if has_pose:
                started = True
                first_t = last_t = prev_t = t
                prev_pose = True
            continue
        if prev_t >= 0 and t > prev_t:
            step = t - prev_t
            if step <= step_max:  # ignore a seek/stall, not real cadence
                if prev_pose:
                    present_t += step
                else:
                    pending_absent_t += step
                if has_pose:
                    # a pose closes any pending absent stretch -> it was a real in-run gap
                    if cur_gap_start >= 0:
                        dur = prev_t - cur_gap_start
                        if dur > gap_tol:
                            gaps.append({"from": round(cur_gap_start, 2),
                                         "to": round(prev_t, 2), "dur": round(dur, 2)})
                        absent_t += pending_absent_t
                        cur_gap_start = -1.0
                    pending_absent_t = 0.0
                    last_t = t  # run window extends to the latest confirmed pose
                elif cur_gap_start < 0:
                    cur_gap_start = prev_t  # start of a possibly-in-run absent stretch
        prev_t = t
        prev_pose = has_pose

    if not started:
        return Coverage(coverage_frac=0.0, run_from_s=0.0, run_to_s=0.0,
                        gaps=[], worst_gap_s=0.0, started=False)

    # pending_absent_t past the last confirmed pose = the outro tail -> NOT counted.
    denom = present_t + absent_t
    cov = (present_t / denom) if denom > 0 else 1.0
    worst = max((g["dur"] for g in gaps), default=0.0)
    return Coverage(coverage_frac=round(cov, 4), run_from_s=round(first_t, 3),
                    run_to_s=round(last_t, 3), gaps=gaps, worst_gap_s=round(worst, 3),
                    started=True)


# --------------------------------------------------------------------------- #
# Self-check — pure logic, deterministic, no ML
# --------------------------------------------------------------------------- #
def _self_check() -> bool:
    ok = True

    def check(name, cond):
        nonlocal ok
        ok = ok and bool(cond)
        print(f"  [{'PASS' if cond else 'FAIL'}] {name}")

    cfg = {"continuity": {"gap_tol_s": 0.20, "step_max_s": 0.5}}

    # 1) Continuous run -> 100%, 0 gaps.
    ts = [i / 30.0 for i in range(30)]
    flags = [True] * 30
    c = verify_continuity(ts, flags, cfg)
    check("continuous run -> coverage 1.0", abs(c.coverage_frac - 1.0) < 1e-9)
    check("continuous run -> 0 gaps", len(c.gaps) == 0)

    # 2) Pre-start absence + trailing outro absence are NOT counted.
    flags2 = [False] * 5 + [True] * 20 + [False] * 5
    c2 = verify_continuity(ts, flags2, cfg)
    check("pre-start + outro ignored -> coverage 1.0", abs(c2.coverage_frac - 1.0) < 1e-9)
    check("run window starts at first pose (~0.167s)", abs(c2.run_from_s - 5 / 30.0) < 1e-3)
    check("run window ends at last pose (~0.80s)", abs(c2.run_to_s - 24 / 30.0) < 1e-3)

    # 3) A mid-run absent stretch longer than gap_tol counts as ONE gap.
    #    10 present, 9 absent (~0.30s > 0.20 tol), then present again.
    flags3 = [True] * 10 + [False] * 9 + [True] * 11
    c3 = verify_continuity(ts, flags3, cfg)
    check("mid-run dropout -> exactly 1 gap", len(c3.gaps) == 1)
    check("mid-run gap reduces coverage below 1.0", c3.coverage_frac < 1.0)
    check("worst gap ~0.27-0.30s", 0.2 < c3.worst_gap_s < 0.4)

    # 4) A tiny absent blip (<= gap_tol) is NOT counted as a gap.
    flags4 = [True] * 10 + [False] * 3 + [True] * 17  # 3 frames ~0.10s < 0.20 tol
    c4 = verify_continuity(ts, flags4, cfg)
    check("sub-tolerance blip -> 0 gaps", len(c4.gaps) == 0)

    # 5) Frame-rate independence: same media timeline at 2x sample density -> same coverage.
    ts_dense = [i / 60.0 for i in range(60)]
    flags_dense = [True] * 20 + [False] * 18 + [True] * 22  # mirror case 3 over same ~1.0s
    c5a = verify_continuity(ts, flags3, cfg)
    c5b = verify_continuity(ts_dense, flags_dense, cfg)
    check("coverage is frame-rate independent (within 5%)",
          abs(c5a.coverage_frac - c5b.coverage_frac) < 0.05)

    # 6) Never locked -> started False, coverage 0.
    c6 = verify_continuity(ts, [False] * 30, cfg)
    check("never-locked -> started False, coverage 0", (not c6.started) and c6.coverage_frac == 0.0)

    print(f"\nCONTINUITY SELF-CHECK: {'ALL PASS' if ok else 'FAILURES'}")
    return ok


if __name__ == "__main__":
    import sys
    sys.exit(0 if _self_check() else 1)
