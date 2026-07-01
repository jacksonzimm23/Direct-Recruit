"""Ground-truth labeler — a human-driven OpenCV frame-stepper.

Scrub a clip frame-by-frame and hand-record the TRUE event frames (start /
hand-touches / finish) into `ground_truth.json`. The human's eye IS the ground
truth — no ML here.

Governance Rule 0: this tool only WRITES ground_truth.json. The timing pipeline
must never read it. Keeping this under tools/ (outside the drill_timing package)
makes that structural.

Touch rule (locked): a touch is the frame where the athlete's HAND is at MAXIMUM
REACH toward the turn line (fingertips count; a foot at the line does NOT count).

Run (from repo root):
    python -m tools.label --video "clip.mp4"
    python tools/label.py --video "clip.mp4" --drill shuttle_5_10_5 --scale 2

Keys (letters are primary; arrow keys are best-effort on Windows):
    a / ,        prev frame          d / .        next frame
    [            jump back 10        ]            jump forward 10
    s            mark START          S            clear START
    t            mark TOUCH          T            clear last TOUCH
    f            mark FINISH         F            clear FINISH
    u            undo last action
    w / Enter    save (then terminal prompts for metadata)
    q / Esc      quit (warns if unsaved)
    h / ?        toggle help overlay
"""

from __future__ import annotations

# Run as a bare script as well as a module: put the repo root on sys.path.
if __package__ in (None, ""):
    import pathlib
    import sys
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import argparse
import json
import os
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional

import cv2

import drill_timing
from drill_timing.core.config import load_config
from drill_timing.core.video import VideoSource
from drill_timing.drills.base import load_drill

# The spec's clip-type tag vocabulary (Phase 0 + Section 8). 'partial' covers a
# clip with fewer events than the full drill (e.g. one touch, no finish).
CLIP_TYPES = (
    "clean", "crowded", "too-far", "too-close", "bad-pan", "left-open",
    "right-open", "invalid", "minimal-pan", "fidgety-stance",
    "worn-shadowed-lines", "partial",
)
DATASET_SPLITS = ("dev", "held-out")
SCHEMA_VERSION = 1


# --------------------------------------------------------------------------- #
# Ground-truth file location + merge-on-write (the ONLY write site)
# --------------------------------------------------------------------------- #
def ground_truth_path(drill_name: str = "shuttle_5_10_5") -> Path:
    """Per-drill sealed-exam ground truth: drills/<drill_name>/ground_truth.json."""
    from drill_timing.drills import drill_ground_truth_path
    return drill_ground_truth_path(drill_name)


def load_ground_truth(path: Path) -> dict:
    """Load the existing set, or a fresh empty structure. Fail loud on a file we
    don't understand rather than risk clobbering a real labeled set."""
    if not path.is_file():
        return {"schema_version": SCHEMA_VERSION, "clips": {}}
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict) or "clips" not in data or not isinstance(data["clips"], dict):
        raise ValueError(
            f"refusing to overwrite: {path} is not a recognized ground_truth.json "
            f"(expected a dict with a 'clips' mapping)."
        )
    if data.get("schema_version") != SCHEMA_VERSION:
        raise ValueError(
            f"refusing to overwrite: {path} has schema_version="
            f"{data.get('schema_version')!r}, this tool writes {SCHEMA_VERSION}."
        )
    return data


def save_ground_truth(path: Path, data: dict) -> None:
    """Atomic write (temp file + os.replace) so a crash can't corrupt the set."""
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


# --------------------------------------------------------------------------- #
# Drill helpers
# --------------------------------------------------------------------------- #
def max_touches_for_drill(drill) -> int:
    """Number of turn-line touches the drill expects (shuttle: 2 reversals).
    Read generically from the drill definition — never hardcoded."""
    return sum(1 for e in drill.expected_event_sequence() if e.kind == "reversal")


# --------------------------------------------------------------------------- #
# The labeling session (GUI)
# --------------------------------------------------------------------------- #
class LabelSession:
    _FONT = cv2.FONT_HERSHEY_SIMPLEX
    _WINDOW = "drill labeler — h for help"

    def __init__(self, video_path: str, drill, config: dict, scale: int = 2):
        self.video_path = video_path
        self.drill = drill
        self.scale = max(1, int(scale))

        self.src = VideoSource(video_path, config=config)
        self.info = self.src.info
        # Reuse VideoSource's in-memory decode: instant random-access scrubbing.
        self.frames = [f for _, f, _ in self.src.frames()]
        self.n = len(self.frames)

        self.idx = 0
        self.max_touches = max_touches_for_drill(drill)
        self.start_frame: Optional[int] = None
        self.touch_frames: list[Optional[int]] = [None] * self.max_touches
        self.finish_frame: Optional[int] = None

        self._undo_stack: list[tuple] = []   # (event, prev_value) for undo
        self._dirty = False
        self._show_help = False

    # ---- marking (with undo) -------------------------------------------- #
    def _next_touch_slot(self) -> Optional[int]:
        for i, v in enumerate(self.touch_frames):
            if v is None:
                return i
        return None

    def mark_start(self) -> None:
        self._undo_stack.append(("start", self.start_frame))
        self.start_frame = self.idx
        self._dirty = True

    def mark_touch(self) -> None:
        slot = self._next_touch_slot()
        if slot is None:
            print(f"[!] all {self.max_touches} touch slots filled; clear one (T) first.")
            return
        self._undo_stack.append((f"touch{slot}", self.touch_frames[slot]))
        self.touch_frames[slot] = self.idx
        self._dirty = True

    def mark_finish(self) -> None:
        self._undo_stack.append(("finish", self.finish_frame))
        self.finish_frame = self.idx
        self._dirty = True

    def clear_start(self) -> None:
        self._undo_stack.append(("start", self.start_frame))
        self.start_frame = None
        self._dirty = True

    def clear_last_touch(self) -> None:
        # clear the highest filled slot
        for i in range(len(self.touch_frames) - 1, -1, -1):
            if self.touch_frames[i] is not None:
                self._undo_stack.append((f"touch{i}", self.touch_frames[i]))
                self.touch_frames[i] = None
                self._dirty = True
                return

    def clear_finish(self) -> None:
        self._undo_stack.append(("finish", self.finish_frame))
        self.finish_frame = None
        self._dirty = True

    def undo(self) -> None:
        if not self._undo_stack:
            return
        event, prev = self._undo_stack.pop()
        if event == "start":
            self.start_frame = prev
        elif event == "finish":
            self.finish_frame = prev
        elif event.startswith("touch"):
            self.touch_frames[int(event[5:])] = prev
        self._dirty = True

    # ---- navigation ------------------------------------------------------ #
    def step(self, delta: int) -> None:
        self.idx = max(0, min(self.n - 1, self.idx + delta))

    # ---- rendering ------------------------------------------------------- #
    def _ts(self, frame_idx: Optional[int]) -> str:
        if frame_idx is None:
            return "—"
        return _fmt_clock(self.src.timestamp_for_index(frame_idx))

    def _render(self):
        frame = self.frames[self.idx].copy()
        if self.scale != 1:
            frame = cv2.resize(
                frame, (frame.shape[1] * self.scale, frame.shape[0] * self.scale),
                interpolation=cv2.INTER_NEAREST,
            )
        h, w = frame.shape[:2]
        fs = max(0.45, min(0.7, w / 900.0))

        # top banner
        self._band(frame, 0, int(0.16 * h))
        clock = _fmt_clock(self.src.timestamp_for_index(self.idx))
        self._text(frame, f"frame {self.idx}/{self.n - 1}   t={clock}   drill={self.drill.name}",
                   6, int(0.06 * h), fs)
        touches = ", ".join("—" if v is None else str(v) for v in self.touch_frames)
        self._text(frame,
                   f"START={self.start_frame if self.start_frame is not None else '—'}  "
                   f"TOUCH=[{touches}]  FINISH={self.finish_frame if self.finish_frame is not None else '—'}",
                   6, int(0.12 * h), fs)

        # bottom instruction (the locked touch rule)
        self._band(frame, h - int(0.10 * h), h)
        self._text(frame, "TOUCH = HAND at MAXIMUM REACH toward line (fingertips; NOT foot)",
                   6, h - int(0.035 * h), fs * 0.9)

        if self._show_help:
            self._draw_help(frame, fs)

        cv2.imshow(self._WINDOW, frame)

    def _band(self, frame, y0, y1):
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, y0), (frame.shape[1], y1), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)

    def _text(self, frame, s, x, y, fs):
        cv2.putText(frame, s, (x, y), self._FONT, fs, (0, 0, 0), 3, cv2.LINE_AA)
        cv2.putText(frame, s, (x, y), self._FONT, fs, (255, 255, 255), 1, cv2.LINE_AA)

    def _draw_help(self, frame, fs):
        lines = [
            "a/, prev   d/. next   [ -10   ] +10",
            "s START  t TOUCH  f FINISH",
            "S/T/F clear   u undo",
            "w/Enter save   q/Esc quit   h hide help",
        ]
        self._band(frame, int(0.20 * frame.shape[0]), int(0.20 * frame.shape[0]) + 22 * len(lines) + 10)
        for i, ln in enumerate(lines):
            self._text(frame, ln, 10, int(0.20 * frame.shape[0]) + 20 * (i + 1), fs * 0.85)

    # ---- the loop -------------------------------------------------------- #
    def run(self) -> bool:
        """Returns True if the user chose to save, False if they quit."""
        cv2.namedWindow(self._WINDOW, cv2.WINDOW_AUTOSIZE)
        self._render()
        while True:
            key = cv2.waitKey(20) & 0xFF
            # window closed via the X button?
            if cv2.getWindowProperty(self._WINDOW, cv2.WND_PROP_VISIBLE) < 1:
                if self._confirm_quit():
                    cv2.destroyAllWindows()
                    return False
                cv2.namedWindow(self._WINDOW, cv2.WINDOW_AUTOSIZE)

            if key == 255:  # no key
                continue

            if key in (ord("d"), ord("."), 83):       # 83 = Windows right arrow
                self.step(1)
            elif key in (ord("a"), ord(","), 81):     # 81 = left arrow
                self.step(-1)
            elif key == ord("]"):
                self.step(10)
            elif key == ord("["):
                self.step(-10)
            elif key == ord("s"):
                self.mark_start()
            elif key == ord("t"):
                self.mark_touch()
            elif key == ord("f"):
                self.mark_finish()
            elif key == ord("S"):
                self.clear_start()
            elif key == ord("T"):
                self.clear_last_touch()
            elif key == ord("F"):
                self.clear_finish()
            elif key == ord("u"):
                self.undo()
            elif key in (ord("h"), ord("?")):
                self._show_help = not self._show_help
            elif key in (ord("w"), 13):  # 13 = Enter
                cv2.destroyAllWindows()
                return True
            elif key in (ord("q"), 27):  # 27 = Esc
                if self._confirm_quit():
                    cv2.destroyAllWindows()
                    return False
            self._render()

    def _confirm_quit(self) -> bool:
        if not self._dirty:
            return True
        ans = input("Unsaved marks. Quit without saving? [y/N] ").strip().lower()
        return ans == "y"

    # ---- build the record ------------------------------------------------ #
    def build_record(self, meta: dict) -> dict:
        def t(fr):
            return None if fr is None else round(self.src.timestamp_for_index(fr), 4)
        return {
            "clip": Path(self.video_path).name,
            "start_frame": self.start_frame,
            "start_time_s": t(self.start_frame),
            "touch_frames": list(self.touch_frames),
            "touch_times_s": [t(fr) for fr in self.touch_frames],
            "finish_frame": self.finish_frame,
            "finish_time_s": t(self.finish_frame),
            "clip_type": meta["clip_type"],
            "athlete_id": meta["athlete_id"],
            "dataset_split": meta["dataset_split"],
            "golden": meta["golden"],
            "notes": meta["notes"],
            "frame_count": self.info.frame_count,
            "nominal_fps": round(self.info.nominal_fps, 3),
            "labeled_at": datetime.now().isoformat(timespec="seconds"),
            "labeler": "human",
            "tool_version": drill_timing.__version__,
        }

    def close(self):
        self.src.close()


def _fmt_clock(t_seconds: float) -> str:
    t = max(0.0, t_seconds)
    return f"{int(t // 60):02d}:{t - int(t // 60) * 60:06.3f}"


# --------------------------------------------------------------------------- #
# Metadata prompts (terminal)
# --------------------------------------------------------------------------- #
def _prompt_choice(label: str, choices) -> str:
    choices = list(choices)
    while True:
        print(f"{label} options: {choices}")
        v = input(f"{label}: ").strip()
        if v in choices:
            return v
        print(f"  '{v}' not valid.")


def prompt_metadata(default_clip_type: str = "partial") -> dict:
    print("\n--- clip metadata (Rule 3 + athlete diversity) ---")
    athlete = input("athlete_id (e.g. athlete_01): ").strip() or "unknown"
    print(f"clip_type [{default_clip_type}] options: {list(CLIP_TYPES)}")
    ct = input(f"clip_type [{default_clip_type}]: ").strip() or default_clip_type
    while ct not in CLIP_TYPES:
        ct = input(f"  invalid; choose from {list(CLIP_TYPES)}: ").strip()
    split = _prompt_choice("dataset_split", DATASET_SPLITS)
    golden = input("golden clip? [y/N]: ").strip().lower() == "y"
    notes = input("notes (e.g. onset confidence): ").strip()
    return {"athlete_id": athlete, "clip_type": ct, "dataset_split": split,
            "golden": golden, "notes": notes}


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m tools.label",
        description="Hand-label ground-truth event frames for a drill clip.",
    )
    parser.add_argument("--video", required=True, help="path to the clip")
    parser.add_argument("--drill", default="shuttle_5_10_5", help="drill name/alias")
    parser.add_argument("--scale", type=int, default=2, help="window upscale factor")
    parser.add_argument("--config", help="path to config.yaml")
    args = parser.parse_args(argv)

    cfg = load_config(args.config)
    try:
        drill = load_drill(args.drill)
    except KeyError as e:
        parser.error(str(e))

    session = LabelSession(args.video, drill, cfg, scale=args.scale)
    try:
        saved = session.run()
        if not saved:
            print("Quit without saving.")
            return 0

        # Recap, then metadata, then merge-write.
        print("\n--- marked frames ---")
        print(f"  START : {session.start_frame}")
        print(f"  TOUCH : {session.touch_frames}")
        print(f"  FINISH: {session.finish_frame}")

        default_type = "partial" if (session.finish_frame is None
                                     or any(v is None for v in session.touch_frames)) else "clean"
        meta = prompt_metadata(default_clip_type=default_type)
        record = session.build_record(meta)

        gt_path = ground_truth_path(drill.name)
        data = load_ground_truth(gt_path)
        name = record["clip"]
        if name in data["clips"] and data["clips"][name] != record:
            ans = input(f"\n'{name}' already labeled. Overwrite it? [y/N] ").strip().lower()
            if ans != "y":
                print("Not saved.")
                return 0
        data["clips"][name] = record
        save_ground_truth(gt_path, data)
        print(f"\nSaved ground truth for '{name}' -> {gt_path}")
        print(f"  ({len(data['clips'])} clip(s) total in the set)")
        return 0
    finally:
        session.close()


if __name__ == "__main__":
    raise SystemExit(main())
