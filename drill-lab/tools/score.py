"""Scoring script — grades pipeline results against ground truth.

The pipeline answers BLIND (it never reads ground truth). This script is the ONLY
file allowed to open `ground_truth.json` (Governance Rule 0): it compares a
produced result against the sealed answer key and reports the error.

Honest about partials: if the pipeline produced no prediction yet (today's
DRAFT_SKELETON), each event reports "NOT SCORABLE (no prediction yet)" with the
truth shown. `--self-check` proves the delta math is correct even when the live
clip yields only nulls.

Rule 3: dev and held-out accuracy are reported as SEPARATE blocks. The held-out
number is the honest one.

Run (from repo root):
    python -m tools.score --result debug_out/<clip>_result.json
    python tools/score.py --results-dir debug_out
    python tools/score.py --self-check
"""

from __future__ import annotations

# Run as a bare script as well as a module.
if __package__ in (None, ""):
    import pathlib
    import sys
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import argparse
import json
from pathlib import Path
from typing import Optional

import drill_timing
from drill_timing.core.config import load_config


# --------------------------------------------------------------------------- #
# Ground-truth access — the ONE allowed read of ground_truth.json
# --------------------------------------------------------------------------- #
def ground_truth_path(drill_name: str = "shuttle_5_10_5") -> Path:
    """Per-drill sealed-exam ground truth: drills/<drill_name>/ground_truth.json."""
    from drill_timing.drills import drill_ground_truth_path
    return drill_ground_truth_path(drill_name)


def load_ground_truth(path: Optional[Path] = None) -> dict:
    p = Path(path) if path else ground_truth_path()
    if not p.is_file():
        return {"schema_version": 1, "clips": {}}
    with open(p, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict) or "clips" not in data:
        raise ValueError(f"{p} is not a recognized ground_truth.json")
    return data


# --------------------------------------------------------------------------- #
# Pure scoring primitives (these are what --self-check exercises)
# --------------------------------------------------------------------------- #
def score_event(pred_frame, pred_time_s, truth_frame, truth_time_s, tolerance_s) -> dict:
    """Score one event (start, a touch, or finish). All math lives here."""
    if truth_frame is None:
        return {"state": "no_truth"}
    if pred_frame is None:
        return {"state": "not_scorable", "truth_frame": truth_frame,
                "truth_time_s": truth_time_s}
    frame_delta = pred_frame - truth_frame
    time_delta_s = None
    within_tol = None
    if pred_time_s is not None and truth_time_s is not None:
        time_delta_s = round(pred_time_s - truth_time_s, 4)
        within_tol = abs(time_delta_s) <= tolerance_s
    return {"state": "scored", "pred_frame": pred_frame, "truth_frame": truth_frame,
            "frame_delta": frame_delta, "pred_time_s": pred_time_s,
            "truth_time_s": truth_time_s, "time_delta_s": time_delta_s,
            "within_tol": within_tol}


def score_total_time(result_total_s, truth_start_s, truth_finish_s, tolerance_s) -> dict:
    """Score the total drill time against (truth_finish - truth_start)."""
    if truth_start_s is None or truth_finish_s is None:
        return {"state": "no_truth"}
    truth_total = round(truth_finish_s - truth_start_s, 4)
    if result_total_s is None:
        return {"state": "not_scorable", "truth_total_s": truth_total}
    err = round(result_total_s - truth_total, 4)
    return {"state": "scored", "pred_total_s": result_total_s, "truth_total_s": truth_total,
            "total_time_error_s": err, "abs_error_s": abs(err),
            "within_tol": abs(err) <= tolerance_s}


# --------------------------------------------------------------------------- #
# Per-clip scoring
# --------------------------------------------------------------------------- #
def score_clip(result: dict, gt: dict, tolerance_s: float) -> dict:
    """Score one result dict against the ground-truth set."""
    clip_name = result.get("clip_name") or result.get("clip")
    entry = gt.get("clips", {}).get(clip_name)
    base = {
        "clip": clip_name,
        "status": result.get("status"),
        "reason_code": result.get("reason_code"),
    }
    if entry is None:
        base.update({"scorable": False,
                     "note": "unlabeled — no ground_truth entry, cannot score"})
        return base

    base["clip_type"] = entry.get("clip_type")
    base["dataset_split"] = entry.get("dataset_split")

    pe = result.get("predicted_events") or {}
    pred_touch_f = pe.get("touch_frames") or []
    pred_touch_t = pe.get("touch_times_s") or []
    truth_touch_f = entry.get("touch_frames") or []
    truth_touch_t = entry.get("touch_times_s") or []

    events = {}
    events["start"] = score_event(
        pe.get("start_frame"), pe.get("start_time_s"),
        entry.get("start_frame"), entry.get("start_time_s"), tolerance_s)

    n_touch = max(len(pred_touch_f), len(truth_touch_f))
    touches = []
    for i in range(n_touch):
        pf = pred_touch_f[i] if i < len(pred_touch_f) else None
        pt = pred_touch_t[i] if i < len(pred_touch_t) else None
        tf = truth_touch_f[i] if i < len(truth_touch_f) else None
        tt = truth_touch_t[i] if i < len(truth_touch_t) else None
        touches.append(score_event(pf, pt, tf, tt, tolerance_s))
    events["touches"] = touches

    events["finish"] = score_event(
        pe.get("finish_frame"), pe.get("finish_time_s"),
        entry.get("finish_frame"), entry.get("finish_time_s"), tolerance_s)

    events["total"] = score_total_time(
        result.get("total_time_s"), entry.get("start_time_s"),
        entry.get("finish_time_s"), tolerance_s)

    base["scorable"] = True
    base["events"] = events
    return base


# --------------------------------------------------------------------------- #
# Aggregate
# --------------------------------------------------------------------------- #
def _collect_abs(values):
    vals = [abs(v) for v in values if v is not None]
    if not vals:
        return None
    return {"mean": round(sum(vals) / len(vals), 4), "worst": round(max(vals), 4),
            "n": len(vals)}


def aggregate(scored_clips: list) -> dict:
    counts = {"VERIFIED": 0, "REJECTED": 0, "DRAFT": 0, "DRAFT_SKELETON": 0,
              "unscored": 0}
    frame_deltas, time_deltas, total_errs = [], [], []
    by_split: dict[str, dict] = {}

    for c in scored_clips:
        status = c.get("status") or "unknown"
        if status in counts:
            counts[status] += 1
        if not c.get("scorable"):
            counts["unscored"] += 1
            continue
        ev = c["events"]
        split = c.get("dataset_split") or "unknown"
        bucket = by_split.setdefault(split, {"frame": [], "time": [], "total": []})

        def take(e):
            if e.get("state") == "scored":
                if e.get("frame_delta") is not None:
                    frame_deltas.append(e["frame_delta"]); bucket["frame"].append(e["frame_delta"])
                if e.get("time_delta_s") is not None:
                    time_deltas.append(e["time_delta_s"]); bucket["time"].append(e["time_delta_s"])
        take(ev["start"])
        for t in ev["touches"]:
            take(t)
        take(ev["finish"])
        if ev["total"].get("state") == "scored":
            total_errs.append(ev["total"]["total_time_error_s"])
            bucket["total"].append(ev["total"]["total_time_error_s"])

    return {
        "counts": counts,
        "frame_error": _collect_abs(frame_deltas) or "n/a (insufficient data)",
        "time_error_s": _collect_abs(time_deltas) or "n/a (insufficient data)",
        "total_time_error_s": _collect_abs(total_errs) or "n/a (insufficient data)",
        "by_split": {
            split: {
                "frame_error": _collect_abs(b["frame"]) or "n/a",
                "time_error_s": _collect_abs(b["time"]) or "n/a",
                "total_time_error_s": _collect_abs(b["total"]) or "n/a",
            } for split, b in by_split.items()
        },
    }


# --------------------------------------------------------------------------- #
# Report
# --------------------------------------------------------------------------- #
def _fmt_event(name, e) -> str:
    st = e.get("state")
    if st == "no_truth":
        return f"  {name:8s}: no ground truth for this event -> skip"
    if st == "not_scorable":
        tf = e.get("truth_frame"); tt = e.get("truth_time_s")
        tt_s = f"{tt:.4f}s" if tt is not None else "—"
        tot = e.get("truth_total_s")
        if tf is None and tot is not None:
            return f"  {name:8s}: predicted=none, truth_total={tot:.4f}s -> NOT SCORABLE (no prediction yet)"
        return f"  {name:8s}: predicted=none, truth=frame {tf} ({tt_s}) -> NOT SCORABLE (no prediction yet)"
    if st == "scored":
        if "frame_delta" in e:
            wt = "" if e["within_tol"] is None else (" within_tol" if e["within_tol"] else " OVER_TOL")
            td = "—" if e["time_delta_s"] is None else f"{e['time_delta_s']:+.4f}s"
            return (f"  {name:8s}: pred frame {e['pred_frame']} vs truth {e['truth_frame']} "
                    f"-> dframe {e['frame_delta']:+d}, dtime {td}{wt}")
        return (f"  {name:8s}: pred {e['pred_total_s']:.4f}s vs truth {e['truth_total_s']:.4f}s "
                f"-> err {e['total_time_error_s']:+.4f}s ({'within' if e['within_tol'] else 'OVER'} tol)")
    return f"  {name:8s}: {st}"


def print_clip_score(c: dict) -> None:
    head = f"=== {c['clip']}"
    if c.get("clip_type") or c.get("dataset_split"):
        head += f"  [{c.get('clip_type')} / {c.get('dataset_split')}]"
    head += f"  status={c.get('status')} ==="
    print(head)
    if not c.get("scorable"):
        print(f"  {c.get('note')}")
        return
    ev = c["events"]
    print(_fmt_event("start", ev["start"]))
    for i, t in enumerate(ev["touches"], 1):
        print(_fmt_event(f"touch{i}", t))
    print(_fmt_event("finish", ev["finish"]))
    print(_fmt_event("total", ev["total"]))


def print_aggregate(agg: dict) -> None:
    print("\n=== AGGREGATE ===")
    print(f"  counts: {agg['counts']}")
    print(f"  frame_error (all): {agg['frame_error']}")
    print(f"  time_error_s (all): {agg['time_error_s']}")
    print(f"  total_time_error_s (all): {agg['total_time_error_s']}")
    print("  --- by dataset_split (Rule 3: held-out is the honest number) ---")
    if not agg["by_split"]:
        print("    n/a (no scored clips)")
    for split, b in agg["by_split"].items():
        tag = " <- HONEST" if split == "held-out" else ""
        print(f"    [{split}]{tag}: frame={b['frame_error']}  time={b['time_error_s']}  "
              f"total={b['total_time_error_s']}")


# --------------------------------------------------------------------------- #
# --self-check: prove the delta math without any live prediction
# --------------------------------------------------------------------------- #
def self_check() -> bool:
    ok = True

    def check(name, got, want):
        nonlocal ok
        passed = got == want
        ok = ok and passed
        print(f"  [{'PASS' if passed else 'FAIL'}] {name}")
        if not passed:
            print(f"        got={got}\n        want={want}")

    e = score_event(11, 0.34, 9, 0.2747, 0.10)
    check("frame_delta +2", e["frame_delta"], 2)
    check("time_delta 0.0653", e["time_delta_s"], 0.0653)
    check("within_tol True", e["within_tol"], True)

    e = score_event(20, 0.50, 9, 0.2747, 0.10)
    check("frame_delta +11", e["frame_delta"], 11)
    check("over tol False", e["within_tol"], False)

    # boundary: exactly 0.10 is within; just over is not
    e_in = score_event(10, 0.3747, 9, 0.2747, 0.10)
    check("boundary 0.1000 within", e_in["within_tol"], True)
    e_out = score_event(10, 0.3748, 9, 0.2747, 0.10)
    check("boundary 0.1001 over", e_out["within_tol"], False)

    check("not_scorable (pred null)", score_event(None, None, 9, 0.2747, 0.10)["state"], "not_scorable")
    check("no_truth (truth null)", score_event(5, 0.1, None, None, 0.10)["state"], "no_truth")

    t = score_total_time(2.5, 0.2747, 2.7747, 0.10)
    check("total truth 2.5", t["truth_total_s"], 2.5)
    check("total err 0.0", t["total_time_error_s"], 0.0)
    check("total within_tol", t["within_tol"], True)
    check("total not_scorable", score_total_time(None, 0.2747, 2.7747, 0.10)["state"], "not_scorable")
    check("total no_truth", score_total_time(2.5, 0.2747, None, 0.10)["state"], "no_truth")

    print(f"\nSELF-CHECK: {'ALL PASS' if ok else 'FAILURES PRESENT'}")
    return ok


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def _load_result(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m tools.score",
        description="Score pipeline results against ground_truth.json (Rule 0: only reader).",
    )
    parser.add_argument("--drill", default="shuttle_5_10_5",
                        help="drill whose ground_truth to score against (default: shuttle_5_10_5)")
    parser.add_argument("--result", help="path to one <clip>_result.json")
    parser.add_argument("--results-dir", help="score every *_result.json in this dir")
    parser.add_argument("--self-check", action="store_true", help="prove the delta math, score nothing")
    parser.add_argument("--config", help="path to config.yaml")
    parser.add_argument("--tolerance", type=float, help="time tolerance s (default timing.target_error_s)")
    parser.add_argument("--scores-json", help="optional: dump machine-readable scores here")
    args = parser.parse_args(argv)

    if args.self_check:
        return 0 if self_check() else 1

    if not args.result and not args.results_dir:
        parser.error("provide --result, --results-dir, or --self-check")

    cfg = load_config(args.config)
    tolerance = args.tolerance if args.tolerance is not None else float(cfg["timing"]["target_error_s"])
    gt_path = ground_truth_path(args.drill)
    gt = load_ground_truth(gt_path)

    result_paths = []
    if args.result:
        result_paths.append(Path(args.result))
    if args.results_dir:
        result_paths.extend(sorted(Path(args.results_dir).glob("*_result.json")))
    if not result_paths:
        print("No result files found.")
        return 1

    print(f"(scoring tolerance: +/-{tolerance:.3f}s; drill: {args.drill}; ground truth: {gt_path})\n")
    scored = []
    for rp in result_paths:
        if not rp.is_file():
            print(f"=== {rp} === (file not found, skipped)")
            continue
        c = score_clip(_load_result(rp), gt, tolerance)
        scored.append(c)
        print_clip_score(c)
        print()

    agg = aggregate(scored)
    print_aggregate(agg)

    if args.scores_json:
        out = {"tolerance_s": tolerance, "per_clip": scored, "aggregate": agg}
        with open(args.scores_json, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2)
        print(f"\nscores written -> {args.scores_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
