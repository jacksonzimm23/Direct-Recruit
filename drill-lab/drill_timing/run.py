"""Pipeline orchestrator CLI.

    python -m drill_timing.run --video clip.mp4 --drill shuttle_5_10_5

Two-pass flow:
  Pass 1 (perception, ML runs ONCE): detect the athlete, pose on the crop, build
    COM motion, detect the movement onset. Sets status + predicted_events.
  Pass 2 (render, no ML): draw box/skeleton/onset marker on the annotated video
    and write per-frame signals to the CSV.

AI only perceives; all timing is plain math (Principle 4). On a partial clip a
detected onset yields status DRAFT; weak detection yields a REJECTED with a real
reason code rather than a guessed frame.
"""

from __future__ import annotations

# Allow running as a bare script (`python run.py ...`) as well as a module
# (`python -m drill_timing.run ...`): if there's no package context, put the
# repo root on sys.path so `import drill_timing...` resolves.
if __package__ in (None, ""):
    import pathlib
    import sys
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import argparse
import logging
from pathlib import Path

import drill_timing
from drill_timing.core.athlete import (
    build_tracks,
    compute_fingerprint,
    run_lock,
    select_athlete,
)
from drill_timing.core.config import load_config
from drill_timing.core.events import detect_onset
from drill_timing.core.kinematics import compute_motion
from drill_timing.core.pose import make_pose_backend
from drill_timing.core.segment import make_seg_backend
from drill_timing.core.track import PersonTracker
from drill_timing.core.report import (
    AnnotatedVideoWriter,
    PerFrameCSVLogger,
    print_clip_report,
    write_result_json,
)
from drill_timing.core.failure_log import log_failure
from drill_timing.core.result import DrillResult, FpsInfo, ReasonCode, Status
from drill_timing.core.video import VideoSource
from drill_timing.drills.base import known_drills, load_drill

log = logging.getLogger("drill_timing.run")


def _resolve_out_dir(explicit: str | None, drill_name: str) -> Path:
    if explicit:
        return Path(explicit)
    # default: the drill's own debug_out folder (per-drill data co-located)
    from drill_timing.drills import drill_debug_out
    return drill_debug_out(drill_name)


def _finite(v) -> bool:
    import math
    try:
        return math.isfinite(float(v))
    except (TypeError, ValueError):
        return False


def _perceive(src, cfg, is_measurement=False):
    """Pass 1 — two-stage: track all persons, lock the DRILL athlete, then run
    pose+kinematics on the locked track only.

    Shared by every drill (Principle 8): ingest -> track -> lock -> pose is
    identical. The drill KIND then diverges:
      * timing drills also run onset detection (1c);
      * measurement drills (height) SKIP it — there is no movement onset; the
        height is read off the in-frame tape at the pose head-top in the drill's
        measure() hook instead.

    (Yard-line detection / pixel->yard calibration was removed from this engine;
    the automatic detector lives in the browser tool. `calibration` is always None.)

    Returns a dict including the locked id, per-frame locked boxes, candidate
    (non-locked) boxes for annotation, pose keypoints, motion, detect_rate, and
    (on a selection/lock failure) a reject reason. `onset` is None for measurement
    drills.
    """
    from drill_timing.core.result import ReasonCode

    frames = list(src.frames())  # (i, frame, ts) — already in memory
    n = len(frames)
    frames_bgr = [f for _, f, _ in frames]
    timestamps = [ts for _, _, ts in frames]
    fw, fh = frames_bgr[0].shape[1], frames_bgr[0].shape[0]

    # --- 1a: track ALL persons (ByteTrack) ---
    log.info("pass 1a: tracking all persons (ByteTrack) ...")
    tracker = PersonTracker(cfg)
    track_frames = tracker.track_clip(frames)
    tracks = build_tracks(track_frames, n)
    log.info("tracked %d person track(s): ids=%s", len(tracks), sorted(tracks))

    base = {"n": n, "frames": frames, "track_frames": track_frames}

    # --- 1b: select + lock the drill athlete ---
    locked_id, scores, sel_reason = select_athlete(tracks, fw, fh, timestamps, cfg)
    base["scores"] = scores
    if locked_id is None:
        reason = (ReasonCode.IDENTITY_UNCERTAIN if "ambiguous" in sel_reason
                  else ReasonCode.ATHLETE_NOT_FOUND)
        log.info("athlete selection FAILED: %s", sel_reason)
        return {**base, "reject": True, "reason": reason, "locked_id": None,
                "boxes": [None] * n, "lock": None, "detect_rate": 0.0}

    # fingerprint on the locked track's largest box within the start window
    lt = tracks[locked_id]
    start_w = int(cfg["athlete_lock"]["start_window_frames"])
    cand_idx = [k for k, fi in enumerate(lt.frame_indices) if fi <= start_w] or [0]
    lock_k = max(cand_idx, key=lambda k: lt.boxes[k].h)
    lock_frame = frames_bgr[lt.frame_indices[lock_k]]
    fingerprint = compute_fingerprint(lock_frame, lt.boxes[lock_k], cfg)

    log.info("pass 1b: locked athlete id=%d (drill_score=%.3f)",
             locked_id, scores[locked_id].get("drill_score", float("nan")))

    # --- 1b/1c: TRACK + pose + seg — branch on the tracker backbone (config-swappable,
    # governance: yolo_bytetrack is the validated default/rollback). The mediapipe_roi
    # path (the ported 40-test METHOD) emits boxes + keypoints + masks DIRECTLY from one
    # MediaPipe VIDEO pass on a digital-zoom ROI (Decision B), so the separate pose/seg
    # loop is SKIPPED for it. Both paths converge on compute_motion + continuity below.
    tracker_backend = cfg.get("tracker", {}).get("backend", "yolo_bytetrack")
    coms = [None] * n
    body_heights = [None] * n
    coverage = None

    if tracker_backend == "mediapipe_roi":
        from drill_timing.core.selection import build_anchor
        from drill_timing.core.tracker_mediapipe import MediaPipeRoiTracker
        log.info("pass 1b/1c: MediaPipe-ROI tracker (multi-pose + zoom + per-frame lock) ...")
        anchor = build_anchor(tracks[locked_id], fingerprint, n)
        tracker = MediaPipeRoiTracker(cfg)
        try:
            tr = tracker.track(frames_bgr, timestamps, anchor)
        finally:
            tracker.close()
        boxes_per_frame = tr.boxes_per_frame
        kpts_per_frame = tr.kpts_per_frame
        masks_per_frame = tr.masks_per_frame
        coverage = tr.coverage
        lock = tr  # carries .events/.status/.reason/.locked_flags for the diagnostics below
        if tr.status == "LOST":
            lost_rate = sum(tr.locked_flags) / n if n else 0.0
            log.info("athlete never locked by the ROI tracker -> reject")
            return {**base, "reject": True, "reason": tr.reason, "locked_id": locked_id,
                    "boxes": boxes_per_frame, "lock": lock, "detect_rate": lost_rate,
                    "coverage": coverage}
        for idx in range(n):
            kp = kpts_per_frame[idx]
            if kp is not None:
                coms[idx] = kp.mid_hip()
                body_heights[idx] = kp.body_height_px()
        detect_rate = sum(tr.locked_flags) / n if n else 0.0
    else:
        lock = run_lock(track_frames, locked_id, fingerprint, fw, fh, frames_bgr, cfg)
        if lock.status == "LOST":
            lost_rate = sum(lock.locked_flags) / n if n else 0.0
            log.info("athlete LOST during the rep -> reject (locked %.0f%% of frames before loss)",
                     lost_rate * 100)
            return {**base, "reject": True, "reason": lock.reason, "locked_id": locked_id,
                    "boxes": lock.boxes_per_frame, "lock": lock, "detect_rate": lost_rate,
                    "coverage": None}

        # --- 1c: pose + segmentation on the LOCKED boxes only ---
        log.info("pass 1c: pose + kinematics on the locked athlete ...")
        pose = make_pose_backend(cfg)
        seg = make_seg_backend(cfg)  # None when segmentation disabled (skips per-frame cost)
        boxes_per_frame = lock.boxes_per_frame
        kpts_per_frame = [None] * n
        masks_per_frame = [None] * n
        for idx in range(n):
            box = boxes_per_frame[idx]
            if box is not None:
                kp = pose.estimate(frames_bgr[idx], box)
                if kp is not None:
                    kpts_per_frame[idx] = kp
                    coms[idx] = kp.mid_hip()
                    body_heights[idx] = kp.body_height_px()
                if seg is not None:
                    masks_per_frame[idx] = seg.mask_for_box(frames_bgr[idx], box)
        detect_rate = sum(lock.locked_flags) / n if n else 0.0

    motion = compute_motion(coms, body_heights, timestamps, cfg)

    # Pose-continuity coverage (both backends): the honest "pose held through the run"
    # metric. The mediapipe_roi tracker already computed it; compute it for the YOLO
    # path here too, from its locked_flags. Config-gated (continuity.enabled).
    if coverage is None and cfg.get("continuity", {}).get("enabled", True):
        from drill_timing.core.continuity import verify_continuity
        coverage = verify_continuity(timestamps, list(lock.locked_flags), cfg)

    result = {
        **base, "reject": False, "locked_id": locked_id, "lock": lock,
        "boxes": boxes_per_frame, "kpts": kpts_per_frame, "masks": masks_per_frame,
        "motion": motion, "detect_rate": detect_rate, "coverage": coverage,
        "onset": None, "calibration": None,
    }
    if is_measurement:
        # Measurement drills (height): no movement onset, no yard-grid field.
        # The measurement is read off the in-frame tape in the drill's measure()
        # hook (Plans 4-5); ingest -> lock -> pose above is all the shared
        # perception it needs.
        return result

    # --- 1c-timing: movement onset (timing drills only) ---
    onset = detect_onset(motion.com_speed, motion.com_accel, motion.valid, cfg)

    # NOTE: yard-line detection + pixel->yard calibration was REMOVED from this engine. The
    # automatic, player-independent yard-line detector now lives in the browser tool
    # (frontend/drill-lab/shuttle-test/yardLines.js). The shared engine no longer measures the
    # field; `calibration` stays None so downstream/Pass-2 simply skip line drawing.
    result["onset"] = onset
    return result


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(
        prog="python -m drill_timing.run",
        description="Run the drill-lab pipeline on a clip and emit artifacts.",
    )
    parser.add_argument("--video", required=True, help="path to the video clip")
    parser.add_argument("--drill", default="shuttle_5_10_5",
                        help="drill name or alias (default: shuttle_5_10_5)")
    parser.add_argument("--config", help="path to a config.yaml (defaults to package config)")
    parser.add_argument("--out", help="output dir for artifacts (default: <repo>/debug_out)")
    parser.add_argument("--debug-signals", action="store_true",
                        help="print per-frame speed/accel detail")
    args = parser.parse_args(argv)

    cfg = load_config(args.config)

    try:
        drill = load_drill(args.drill)
    except KeyError as e:
        parser.error(str(e))
        return 2

    out_dir = _resolve_out_dir(args.out, drill.name)
    out_dir.mkdir(parents=True, exist_ok=True)

    clip = Path(args.video)
    stem = clip.stem
    from drill_timing.drills.base import KIND_MEASUREMENT
    is_measurement = drill.kind == KIND_MEASUREMENT
    max_touches = sum(1 for e in drill.expected_event_sequence() if e.kind == "reversal")
    min_detect_rate = float(cfg["detection"].get("min_detect_rate", 0.95))

    try:
        with VideoSource(str(clip), config=cfg) as src:
            info = src.info
            result = DrillResult.skeleton(str(clip), drill.name, cfg, max_touches=max_touches)
            result.fps_info = FpsInfo.from_clip_info(info)

            # ---- Pass 1: perception (track -> lock -> pose; ML runs once) ----
            p = _perceive(src, cfg, is_measurement=is_measurement)
            result.detection_rate = round(p["detect_rate"], 4) if p.get("detect_rate") is not None else 0.0
            result.athlete_track_id = p.get("locked_id")
            onset = p.get("onset")
            motion = p.get("motion")
            lock = p.get("lock")

            # pose-continuity coverage (the honest "pose held through the run" metric)
            cov = p.get("coverage")
            if cov is not None:
                result.pose_coverage.coverage_frac = cov.coverage_frac
                result.pose_coverage.run_from_s = cov.run_from_s
                result.pose_coverage.run_to_s = cov.run_to_s
                result.pose_coverage.n_gaps = len(cov.gaps)
                result.pose_coverage.worst_gap_s = cov.worst_gap_s
                result.pose_coverage.started = cov.started

            # ---- honest status mapping ----
            # The athlete-lock gates (selection failed / detection too low) are
            # SHARED — every drill needs the right person locked before it can do
            # anything. After that the path forks by drill kind.
            if p.get("reject"):
                # athlete selection/lock failed -> reject with the matching reason
                result.status = Status.REJECTED
                result.reason_code = p["reason"]
            elif p["detect_rate"] < min_detect_rate:
                result.status = Status.REJECTED
                result.reason_code = ReasonCode.ATHLETE_NOT_FOUND
            elif is_measurement:
                # --- MEASUREMENT path (height): no field/onset gates. Hand the
                # shared perception to the drill's measure() hook and fold the
                # result in. Plan 1: measure() returns a skeleton (all null) so the
                # clip flows end-to-end; Plans 4-5 make it a real reading or a
                # fail-loud reject (TAPE_UNREADABLE / HEAD_TOP_NOT_FOUND / ...).
                measurement = drill.measure(p, cfg)
                if measurement is not None:
                    result.height = measurement
                result.status = Status.DRAFT
                result.reason_code = ReasonCode.NONE
            elif onset is None:
                result.status = Status.REJECTED
                result.reason_code = ReasonCode.BAD_EVENT_SEQUENCE
            else:
                result.status = Status.DRAFT
                result.reason_code = ReasonCode.NONE
                result.predicted_events.start_frame = int(onset)
                result.predicted_events.start_time_s = round(src.timestamp_for_index(int(onset)), 4)

            log.info("locked_id=%s  detection_rate=%.3f  onset_frame=%s  status=%s",
                     p.get("locked_id"), p["detect_rate"], onset, result.status.value)
            if args.debug_signals and motion is not None:
                for idx in range(p["n"]):
                    mark = "  <-- ONSET" if onset is not None and idx == onset else ""
                    print(f"  f{idx:3d} t={src.timestamp_for_index(idx):.3f} "
                          f"speed={motion.com_speed[idx]:.3f} accel={motion.com_accel[idx]:.3f}{mark}")

            # ---- lock-events artifact (Rule-0-safe diagnostic) ----
            if lock is not None and lock.events:
                import json as _json
                ev_path = out_dir / f"{stem}_lock_events.jsonl"
                with open(ev_path, "w", encoding="utf-8") as ef:
                    for e in lock.events:
                        ef.write(_json.dumps({"frame": e.frame_index, "kind": e.kind,
                                              "track_id": e.track_id, "detail": e.detail}) + "\n")

            # per-frame locked flags + candidate (non-locked) boxes for annotation
            locked_flags = lock.locked_flags if lock is not None else [False] * p["n"]
            track_frames = p.get("track_frames")

            # ---- Pass 2: render (no ML) ----
            log.info("pass 2: rendering annotated video + CSV ...")
            video_path = csv_path = fourcc_used = None
            with AnnotatedVideoWriter(
                out_dir, f"{stem}_annotated", info.resolution, info.nominal_fps,
                status=result.status.value, reason=result.reason_code.value,
                total_frames=info.frame_count, render=cfg.get("render"),
            ) as vw, PerFrameCSVLogger(out_dir / f"{stem}_signals.csv") as csvlog:
                for idx, (i, frame, ts) in enumerate(p["frames"]):
                    box = p["boxes"][idx]
                    kp = p["kpts"][idx] if p.get("kpts") else None
                    # candidate (non-locked) person boxes this frame, for dim drawing
                    others = []
                    if track_frames is not None:
                        lid = box.track_id if box is not None else None
                        others = [b for b in track_frames[idx].boxes if b.track_id != lid]
                    markers = {"onset": onset is not None and idx == onset}
                    mask = p["masks"][idx] if p.get("masks") else None
                    vw.write(frame, i, ts, box=box, keypoints=kp,
                             event_markers=markers, other_boxes=others, mask=mask)
                    spd = motion.com_speed[idx] if motion is not None else float("nan")
                    acc = motion.com_accel[idx] if motion is not None else float("nan")
                    csvlog.log(
                        i, ts,
                        athlete_track_id=("" if box is None else getattr(box, "track_id", "")),
                        locked_flag=(1 if locked_flags[idx] else 0),
                        athlete_cx=("" if box is None else round(box.cx, 1)),
                        athlete_cy=("" if box is None else round(box.cy, 1)),
                        box_x=("" if box is None else round(box.x, 1)),
                        box_y=("" if box is None else round(box.y, 1)),
                        box_w=("" if box is None else round(box.w, 1)),
                        box_h=("" if box is None else round(box.h, 1)),
                        com_velocity=("" if not _finite(spd) else round(float(spd), 4)),
                        com_accel=("" if not _finite(acc) else round(float(acc), 4)),
                        onset_flag=(1 if (onset is not None and idx == onset) else 0),
                    )
                video_path = vw.path
                fourcc_used = vw.fourcc_used
                csv_path = csvlog.path
    except (FileNotFoundError, RuntimeError) as e:
        import sys
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    json_path = out_dir / f"{stem}_result.json"
    write_result_json(result, json_path)

    # Self-learning loop: any non-VERIFIED outcome logs a failure record so modes
    # can be clustered. Defensive — log_failure never raises, run.py still returns 0.
    if result.status != Status.VERIFIED:
        missing = []
        if is_measurement:
            # measurement drills: report which height components are still absent
            h = result.height
            if h.height_in is None:
                missing.append("height_in")
            if h.face_snapshot is None:
                missing.append("face_snapshot")
        else:
            pe = result.predicted_events
            if pe.start_frame is None:
                missing.append("start")
            if (not pe.touch_frames) or any(v is None for v in pe.touch_frames):
                missing.append("touches")
            if pe.finish_frame is None:
                missing.append("finish")
        fi = result.fps_info
        log_failure({
            "clip": result.clip_name,
            "drill": result.drill_name,
            "status": result.status.value,
            "reason_code": result.reason_code.value,
            "stage": "pipeline",
            "missing_events": missing,
            "fps_summary": {
                "nominal_fps": fi.nominal_fps if fi else None,
                "is_vfr": fi.is_vfr if fi else None,
                "frame_count": fi.frame_count if fi else None,
                "timestamp_source": fi.timestamp_source if fi else None,
            },
        }, path=out_dir / "failures.jsonl")  # per-drill: lives in the drill's debug_out

    print_clip_report(info, drill, {
        "mp4": video_path,
        "json": json_path,
        "csv": csv_path,
        "fourcc": fourcc_used,
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
