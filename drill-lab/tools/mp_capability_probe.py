"""MediaPipe Python-binding capability probe (Phase 1 gate for the ROI tracker).

The browser "40-test" tracker (built with the MediaPipe JS binding) relies on three
PoseLandmarker features the Python engine has NEVER exercised:
  1. running_mode = VIDEO  + detect_for_video(image, timestamp_ms)
  2. num_poses > 1         (several candidate people per call, so WE pick the runner)
  3. output_segmentation_masks = True, AND the mask reads back NONZERO on CPU
     (the JS GPU delegate returned all-zero masks via the callback form — verify the
     Python/CPU path is real before designing the tracker around it)

The Python `mediapipe==0.10.35` Tasks binding may or may not honor each of these. This
probe answers that empirically and prints a PASS/FAIL per capability plus a per-frame
CPU cost budget for the offline two-pass. It also reports which DOCUMENTED FALLBACK the
ROI tracker should take for any capability that fails (see PLATFORM-side plan).

It is a `tools/` DIAGNOSTIC: it never reads ground truth (Rule 0) and never raises —
every failure is captured as a note so a missing feature is REPORTED, not crashed
(Operating Principle 3: fail loud, never guess). Run it inside the project's Python
3.12 venv (mediapipe has no cp313 wheel):

    .venv\\Scripts\\python.exe tools\\mp_capability_probe.py
    # optional: point at a real clip for a realistic cost budget
    .venv\\Scripts\\python.exe tools\\mp_capability_probe.py --video path\\to\\clip.mp4
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

# Resolve the vendored .task bundle the same way core/model_assets.py does, without
# importing the drill_timing package (keep this tool import-light and standalone).
_REPO_ROOT = Path(__file__).resolve().parent.parent
_POSE_TASK = _REPO_ROOT / "models" / "pose_landmarker_full.task"
_POSE_URL = ("https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
             "pose_landmarker_full/float16/latest/pose_landmarker_full.task")


def _make_synthetic_two_people(w: int = 512, h: int = 512):
    """A plain BGR frame with two crude upright human-ish figures, so the multi-pose
    check has >=2 detectable people. Returns a uint8 (h, w, 3) BGR ndarray.

    We draw simple skin-toned blob figures (head + torso + legs); BlazePose does not
    need photorealism to return a pose, and two separated figures is what the
    num_poses>1 capability needs to demonstrate. If the model finds 0 or 1 here it is
    a model-input quirk, not proof multi-pose is unsupported — the probe says so.
    """
    import numpy as np

    img = np.full((h, w, 3), 60, dtype=np.uint8)  # dim background
    import cv2

    def person(cx, top):
        skin = (120, 160, 200)  # BGR-ish skin tone
        cv2.circle(img, (cx, top + 30), 26, skin, -1)              # head
        cv2.rectangle(img, (cx - 28, top + 56), (cx + 28, top + 170), skin, -1)  # torso
        cv2.rectangle(img, (cx - 26, top + 170), (cx - 6, top + 300), skin, -1)  # left leg
        cv2.rectangle(img, (cx + 6, top + 170), (cx + 26, top + 300), skin, -1)  # right leg
        cv2.rectangle(img, (cx - 50, top + 60), (cx - 28, top + 160), skin, -1)  # left arm
        cv2.rectangle(img, (cx + 28, top + 60), (cx + 50, top + 160), skin, -1)  # right arm

    person(int(w * 0.30), int(h * 0.18))
    person(int(w * 0.70), int(h * 0.18))
    return img


def _sample_real_frames(cv2, video: str, count: int = 10):
    """Read up to `count` frames spread evenly across the clip (not just the first
    few, which on a 40/shuttle clip are the static pre-start where the athlete is far
    and small). Returns a list of BGR ndarrays (possibly empty)."""
    frames = []
    cap = cv2.VideoCapture(video)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if total <= 0:
        # unknown length -> just grab the first `count`
        for _ in range(count):
            ok, fr = cap.read()
            if not ok:
                break
            frames.append(fr)
        cap.release()
        return frames
    step = max(1, total // count)
    idx = 0
    while len(frames) < count and idx < total:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, fr = cap.read()
        if ok:
            frames.append(fr)
        idx += step
    cap.release()
    return frames


def _frame_variants(cv2, frame_bgr, detect_max: int):
    """Yield (label, image) variants to test detection the way the tracker will:
    the full frame, and a downscaled-long-side<=detect_max copy (BlazePose sees
    256x256 internally, and the 40-test feeds a <=512px crop). A small/far subject
    that full-frame misses can resolve once it fills more of a downscaled input."""
    h, w = frame_bgr.shape[:2]
    yield ("full", frame_bgr)
    long_side = max(w, h)
    if long_side > detect_max:
        s = detect_max / float(long_side)
        small = cv2.resize(frame_bgr, (max(1, int(w * s)), max(1, int(h * s))),
                           interpolation=cv2.INTER_AREA)
        yield (f"down{detect_max}", small)
    # a center crop (square-ish ROI) — closer to the tracker's tight zoom; helps the
    # NORM_RECT-square path BlazePose prefers.
    side = min(w, h)
    cx, cy = w // 2, h // 2
    x1 = max(0, cx - side // 2); y1 = max(0, cy - side // 2)
    crop = frame_bgr[y1:y1 + side, x1:x1 + side]
    if crop.size:
        yield ("center_sq", crop)


def probe(task_path: Path, video: str | None, num_poses: int = 4) -> dict:
    """Run every capability check. Returns a results dict; never raises."""
    res = {
        "mp_version": None,
        "task_exists": task_path.is_file(),
        "video_mode_attr": False,      # vision.RunningMode.VIDEO exists
        "constructs_video_multi_seg": False,  # options build w/ VIDEO+num_poses+seg
        "detect_for_video_ok": False,  # detect_for_video returns a result
        "multi_pose": False,           # >1 pose returned on a 2-person frame
        "n_poses_returned": 0,
        "seg_masks_present": False,    # result.segmentation_masks populated
        "seg_nonzero": False,          # mask reads back with nonzero pixels
        "ms_per_frame": None,          # CPU cost budget
        "frames_timed": 0,
        "notes": [],
    }

    def note(m: str):
        res["notes"].append(m)

    # --- import mediapipe ---
    try:
        import mediapipe as mp  # noqa: F401
        res["mp_version"] = getattr(mp, "__version__", "unknown")
    except Exception as e:  # pragma: no cover - environment failure
        note(f"import mediapipe FAILED: {e!r}")
        return res

    if not res["task_exists"]:
        note(f"pose .task bundle MISSING at {task_path} — download: {_POSE_URL}")
        return res

    try:
        from mediapipe.tasks.python.core.base_options import BaseOptions
        from mediapipe.tasks.python import vision
    except Exception as e:
        note(f"import Tasks API FAILED: {e!r}")
        return res

    # --- 1. VIDEO running mode exists ---
    try:
        _ = vision.RunningMode.VIDEO
        res["video_mode_attr"] = True
    except Exception as e:
        note(f"vision.RunningMode.VIDEO missing: {e!r}")

    # --- 2. construct options with VIDEO + num_poses + seg masks ---
    landmarker = None
    if res["video_mode_attr"]:
        try:
            opts = vision.PoseLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=str(task_path)),
                running_mode=vision.RunningMode.VIDEO,
                num_poses=num_poses,
                output_segmentation_masks=True,
                min_pose_detection_confidence=0.3,
                min_pose_presence_confidence=0.3,
                min_tracking_confidence=0.3,
            )
            landmarker = vision.PoseLandmarker.create_from_options(opts)
            res["constructs_video_multi_seg"] = True
        except Exception as e:
            note(f"VIDEO+num_poses+seg options construct/create FAILED: {e!r}")

    if landmarker is None:
        note("could not create a VIDEO PoseLandmarker — see fallbacks.")
        _summarize(res)
        return res

    import mediapipe as mp
    import numpy as np
    try:
        import cv2
    except Exception as e:
        note(f"import cv2 FAILED: {e!r}")
        _summarize(res)
        return res

    # --- 3+4+5. detect_for_video on REAL frames (a synthetic blob is not a reliable
    # BlazePose subject). Sample frames across the --video clip and test each at full
    # frame AND downscaled-to-512 (how the ROI tracker actually feeds the model). The
    # FIRST frame that yields >=1 pose drives the multi-pose + seg-mask checks; we keep
    # the MAX pose count seen across all sampled frames so a multi-person frame counts.
    try:
        probe_frames = _sample_real_frames(cv2, video, count=10) if video else []
        if not probe_frames:
            probe_frames = [_make_synthetic_two_people()]
            note("no --video frames available; falling back to a synthetic frame "
                 "(BlazePose may not recognize it — pass --video for a real test).")

        t_ms = 0
        max_poses = 0
        best = None  # (result, frame_label) of the first frame with a pose
        for fi, fr in enumerate(probe_frames):
            for label, img in _frame_variants(cv2, fr, 512):
                t_ms += 33
                rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                result = landmarker.detect_for_video(
                    mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), t_ms)
                res["detect_for_video_ok"] = True
                lms = getattr(result, "pose_landmarks", None) or []
                if len(lms) > max_poses:
                    max_poses = len(lms)
                if lms and best is None:
                    best = (result, f"frame#{fi} {label}")
        res["n_poses_returned"] = max_poses
        res["multi_pose"] = max_poses > 1

        if best is not None:
            result, where = best
            masks = getattr(result, "segmentation_masks", None)
            if masks:
                res["seg_masks_present"] = True
                try:
                    arr = masks[0].numpy_view()
                    res["seg_nonzero"] = bool(np.count_nonzero(arr) > 0)
                except Exception as e:
                    note(f"seg mask present but readback FAILED: {e!r}")
            else:
                note(f"pose found ({where}) but segmentation_masks empty/None — "
                     "seg unsupported/empty in Python VIDEO mode.")
            note(f"pose first found on {where} (n={max_poses}).")
        else:
            note("0 poses on ALL sampled frames — the subject may be too small/far "
                 "for full-frame OR 512-crop detection on this clip; try a clip where "
                 "the person is larger, or confirm with the ROI tracker's tighter crop.")
    except Exception as e:
        note(f"detect_for_video FAILED: {e!r}")

    # --- 6. cost budget: time detect_for_video over real frames (downscaled to 512,
    # as the tracker feeds them) so the ms/frame budget reflects real per-frame cost.
    try:
        raw = _sample_real_frames(cv2, video, count=20) if video else []
        timed_frames = []
        for fr in raw:
            long_side = max(fr.shape[:2])
            if long_side > 512:
                s = 512 / float(long_side)
                fr = cv2.resize(fr, (int(fr.shape[1] * s), int(fr.shape[0] * s)),
                                interpolation=cv2.INTER_AREA)
            timed_frames.append(fr)
        if not timed_frames:
            note(f"--video '{video}' yielded no frames; timing synthetic instead."
                 if video else "no --video; timing synthetic frames.")
            timed_frames = [_make_synthetic_two_people() for _ in range(15)]

        # The shared landmarker's VIDEO clock already advanced in the capability loop;
        # detect_for_video requires STRICTLY INCREASING timestamps, so continue well
        # past it instead of resetting (which raised "must be monotonically increasing").
        t_ms = 10_000_000
        # warm up once (first call JITs/allocates), then time the rest.
        warm = cv2.cvtColor(timed_frames[0], cv2.COLOR_BGR2RGB)
        landmarker.detect_for_video(
            mp.Image(image_format=mp.ImageFormat.SRGB, data=warm), t_ms)
        t0 = time.perf_counter()
        n = 0
        for fr in timed_frames[1:]:
            t_ms += 33
            rgb = cv2.cvtColor(fr, cv2.COLOR_BGR2RGB)
            landmarker.detect_for_video(
                mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), t_ms)
            n += 1
        if n:
            res["ms_per_frame"] = round((time.perf_counter() - t0) * 1000.0 / n, 1)
            res["frames_timed"] = n
    except Exception as e:
        note(f"cost-budget timing FAILED: {e!r}")

    try:
        landmarker.close()
    except Exception:
        pass

    _summarize(res)
    return res


def _summarize(res: dict) -> None:
    """Append a human-readable PASS/FAIL block + the fallback the tracker should take."""
    lines = []
    P = lambda b: "PASS" if b else "FAIL"  # noqa: E731
    lines.append("")
    lines.append("=" * 64)
    lines.append("MEDIAPIPE PYTHON CAPABILITY PROBE")
    lines.append("=" * 64)
    lines.append(f"  mediapipe version           : {res['mp_version']}")
    lines.append(f"  pose .task vendored         : {P(res['task_exists'])}")
    lines.append(f"  [1] RunningMode.VIDEO       : {P(res['video_mode_attr'])}")
    lines.append(f"  [2] VIDEO+num_poses+seg ctor: {P(res['constructs_video_multi_seg'])}")
    lines.append(f"  [3] detect_for_video()      : {P(res['detect_for_video_ok'])}")
    lines.append(f"  [4] multi-pose (>1)         : {P(res['multi_pose'])}"
                 f"  (returned {res['n_poses_returned']})")
    lines.append(f"  [5] seg mask present        : {P(res['seg_masks_present'])}")
    lines.append(f"  [5] seg mask NONZERO readback: {P(res['seg_nonzero'])}")
    if res["ms_per_frame"] is not None:
        lines.append(f"  [6] cost budget             : {res['ms_per_frame']} ms/frame"
                     f"  (CPU, {res['frames_timed']} frames)")
    else:
        lines.append("  [6] cost budget             : n/a")
    lines.append("-" * 64)
    lines.append("  DECISION — tracker_mediapipe should use:")
    if res["video_mode_attr"] and res["detect_for_video_ok"]:
        lines.append("    * VIDEO mode + detect_for_video (real timestamps)")
    else:
        lines.append("    * FALLBACK: IMAGE mode per crop + our own velocity-lead crop")
    if res["multi_pose"]:
        lines.append("    * num_poses>1 (pick the runner among candidates)")
    else:
        lines.append("    * FALLBACK: num_poses=1 (ROI isolates the runner; anchor+lock "
                     "still apply) — UNCONFIRMED if only synthetic was tested")
    if res["seg_masks_present"] and res["seg_nonzero"]:
        lines.append("    * MediaPipe seg mask (emit_mask: true)")
    else:
        lines.append("    * FALLBACK: emit_mask: false -> reuse YoloSeg.mask_for_box")
    if res["notes"]:
        lines.append("-" * 64)
        lines.append("  NOTES:")
        for nmsg in res["notes"]:
            lines.append(f"    - {nmsg}")
    lines.append("=" * 64)
    print("\n".join(lines))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Probe MediaPipe Python binding capabilities.")
    ap.add_argument("--video", help="optional real clip for a realistic cost budget + "
                                    "a real multi-person confirmation")
    ap.add_argument("--num-poses", type=int, default=4)
    args = ap.parse_args(argv)
    res = probe(_POSE_TASK, args.video, num_poses=args.num_poses)
    # Exit 0 if the MediaPipe-first path is viable as-is; 1 if a fallback is forced.
    viable = (res["video_mode_attr"] and res["detect_for_video_ok"]
              and res["multi_pose"] and res["seg_masks_present"] and res["seg_nonzero"])
    return 0 if viable else 1


if __name__ == "__main__":
    sys.exit(main())
