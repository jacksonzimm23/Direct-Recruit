# Drill Analysis Platform — Build & Self-Improvement Spec (PLATFORM_SPEC)

> **This is now a MULTI-DRILL PLATFORM**, not a single tool. A shared perception
> engine powers many drills (5-10-5 shuttle timing, height measurement, and more
> to come). This file (`PLATFORM_SPEC.md`) is the **source of truth for the SHARED
> engine + governance + build flow that applies to EVERY drill.** Each drill also
> has its own folder + its own `SPEC.md`/`testing.md` for what's unique to it.
> See **Section A — Platform Architecture** below before anything else.

> **Read this entire file before writing or modifying any code.** It is a *living
> document*: every time a phase is validated or a failure is diagnosed, append what
> was learned to the **LEARNINGS** section of the relevant phase (shared learnings
> here; drill-specific learnings in that drill's folder). Future runs must read
> those learnings first and not repeat past mistakes.

> **GUIDING ETHOS — This is a self-improving system.** It is always thinking of
> ways to make itself better, trying them, and then **keeping what measurably
> helps and discarding what doesn’t** — judged against ground truth, never
> against a hunch. Every change is a hypothesis with a measured outcome. The
> model gets more accurate over time because it learns from its own logged
> successes and failures, not because anyone guesses.

> **NON-NEGOTIABLE — Ground truth is for scoring only.** The timing code must
> **never** read `ground_truth.json` while computing a time; only the separate
> scoring script reads it, and only *after* the pipeline has produced its result.
> Tune on the dev set, and **report held-out accuracy as the real number.** (Full
> detail in Governance Rules 0 and 3.)

-----

## A. PLATFORM ARCHITECTURE — how drills are organized & how the flow works

This is a **multi-drill platform**: one shared perception engine, many drills.

### A.1 Folder layout — one folder per drill

```
drill-testing/
  PLATFORM_SPEC.md            ← THIS FILE: shared engine + governance + phase plan
  tools/                      ← SHARED tools (label.py, score.py) — take --drill
  drill_timing/
    core/                     ← SHARED ENGINE (every drill reuses this; never duplicated)
      video  detect  track  athlete  pose  kinematics  events
      lines  calibration  report  result  config  failure_log
    run.py                    ← SHARED orchestrator (takes --drill)
    config.yaml               ← shared/default config
    drills/
      base.py                 ← shared DrillDefinition interface + registry + path helpers
      __init__.py             ← auto-discovers every drill sub-folder
      shuttle_5_10_5/         ◄── ONE DRILL = ONE FOLDER
        __init__.py           ← the DrillDefinition (self-registers via @register_drill)
        drill_config.yaml     ← this drill's threshold overrides (optional)
        ground_truth.json     ← this drill's sealed answer key (Rule 0)
        footage/  debug_out/  ← this drill's clips + outputs (+ per-drill failures.jsonl)
        SPEC.md  testing.md  CHANGELOG_TUNING.md   ← this drill's own docs
      height/                 ◄── NEXT DRILL (same shape; README/testing spec'd, not built)
```

**Rule:** the shared engine is written ONCE in `core/` and reused by every drill
(Operating Principle 8: one drill = one plugin; core is drill-agnostic). A drill
folder contains ONLY what's unique to that drill — its definition (the one piece of
drill-specific *code*), its config overrides, its data (footage/ground-truth), and
its own docs. **Adding a drill = create `drills/<name>/` + drop in an `__init__.py`;**
the registry auto-discovers it and you never touch core. Per-drill paths come from
`drill_dir()` / `drill_ground_truth_path()` / `drill_debug_out()` in `drills/base.py`.

### A.2 The shared recognition flow (every drill runs the same pipeline)

`run.py` drives the same two-pass pipeline for any drill; the drill definition only
says *what events/measurements to extract* and *what makes a rep valid*:

```
Pass 1 (perception, ML once):  ingest (true timestamps, VFR-safe)
                               → detect people (YOLO)
                               → track + LOCK the athlete (ByteTrack + fingerprint,
                                 never bounce to a bystander)
                               → pose on the locked athlete (constrained to the box)
                               → drill-specific extraction (timing drills: kinematics +
                                 events + field calibration; measurement drills: read the
                                 in-frame ruler at a pose keypoint)
Pass 2 (render, no ML):        annotated video (box, skeleton, lines/markers, verdict
                               banner) + per-frame CSV + JSON result
Verdict:                       VERIFIED / DRAFT / REJECTED + a machine-readable reason
                               code; never a fabricated number.
```

**Timing drills** (5-10-5, future agility/sprint drills) all follow this SAME video-
recognition flow — ingest → lock → pose → events → dual-method agreement → time. They
differ only in their `DrillDefinition` (expected event sequence, splits, reject rules)
and their own `testing.md`/learnings. **Measurement drills** (height) reuse ingest →
lock → pose, then swap the "events/timing" step for "read the in-frame ruler" — but the
same lock, pose, reporting, scoring, and governance apply.

### A.3 The verification & learning flow — IDENTICAL across all drills

Every drill, timing or measurement, obeys the same loop (this is the platform's
self-improvement engine; full detail in Section 1.5 Governance Rules 0-4):

1. **Produce blind.** The pipeline computes its result WITHOUT ever reading ground
   truth (Rule 0 — sealed exam). Each drill's `ground_truth.json` lives in its folder
   and is read ONLY by `tools/score.py`, only after the result exists.
2. **Fail loud, never guess.** If the athlete can't be locked, a ruler can't be read,
   or confidence is low → a structured REJECT with a reason code, not a made-up number.
3. **Log everything.** Annotated video + per-frame CSV + result JSON + a per-drill
   `failures.jsonl`. ALWAYS inspect the annotated video, not just the number — multiple
   real bugs (wrong-person lock, skeleton on a bystander, onset on noise) were only
   visible there, never in the score.
4. **Score against the sealed answer key.** `tools/score.py --drill <name>` compares
   the blind result to that drill's ground truth; report dev vs **held-out** accuracy
   separately (held-out is the honest number, Rule 3).
5. **Improve as governed hypotheses.** Read `failures.jsonl`, cluster by reason code,
   fix the most frequent first. Every change is a hypothesis measured against the full
   ground-truth set; it's kept only if accuracy doesn't regress (Rule 1), recorded in
   that drill's `CHANGELOG_TUNING.md` (Rule 2), and **Jackson approves what ships**.
6. **Never tune against the label.** Fix the LOGIC on principle, THEN score to see if it
   improved — fitting thresholds to one clip's quirks is overfitting and is forbidden.

Each drill keeps its **own** `testing.md` (the run → pass-criteria → failure-loop →
log runbook) and its own `CHANGELOG_TUNING.md` and learnings — so a drill's specific
lessons stay with it — while the cross-cutting engine lessons live in this file's
Global Learnings (Section 9). The flow itself does not change drill to drill.

-----

## HOW TO USE THIS DOC (Claude Code + operator)

- At the **start of every phase**, Claude Code must first read the
  **ASK THE OPERATOR** block for that phase and put those questions to the human
  (Jackson) before writing code. Do not assume answers.
- Each phase also lists **FOOTAGE / ASSETS YOU NEED** so the human can shoot or
  gather the right material in advance. Capture these on a phone exactly the way
  the real product will be used (handheld, panning from the start line).
- Each phase ends by producing **OUTPUTS THIS PHASE HANDS OFF** — the artifacts
  the next phase (or the human) depends on.

> **Footage shopping list (shoot these early so you’re never blocked):**
> See the consolidated list in Section 9. Short version: a handful of *clean*
> reps, a few *crowded* reps, a couple *too-close* and *too-far* reps, at least
> one *left-open* and one *right-open* rep, one *bad/no-pan* rep, and one
> *invalid* clip (warm-up / stop early). Film with a stopwatch visible or call
> out times so you can hand-label ground truth.

-----

## 0. Operating Principles (apply to ALL code, every drill)

These rules are non-negotiable and apply regardless of which drill is being run —
**timing drills (e.g. 5-10-5) OR measurement drills (e.g. height).** Where a rule
says "timing"/"time" below, read it as "the drill's produced result" (a time for
timing drills, a measurement for measurement drills); the principle is identical.

1. **Build in phases, not all at once.** Each phase below is independently
   buildable and testable. Do **not** start a phase until the previous phase
   passes its **Exit Criteria**. After each phase, print a short report of what
   passed/failed and stop for human review unless told to continue.
1. **Self-check before trusting any number.** Timing is produced by **two
   independent methods** that must agree within tolerance. If they disagree, the
   rep is **rejected** (see Phase 7). A wrong “verified” time is worse than no
   time.
1. **Fail loud, never guess.** If the athlete can’t be confidently identified,
   a line can’t be located, or confidence is low, output a structured
   `REJECTED` result with a machine-readable reason code — never a fabricated
   time.
1. **Deterministic timing math.** AI/ML is used only for *perception* (finding
   the athlete, finding lines, pose keypoints). All *timing* is plain math on
   those outputs (frame counts ÷ true FPS). No model “estimates” a duration.
1. **Everything is logged.** Every run writes a per-frame debug log + an
   annotated output video (skeleton, tracked box, detected lines, event
   markers, running clock). You cannot improve what you cannot see.
1. **Read true FPS from the file.** Never assume 30fps. Phone clips are often
   variable frame rate (VFR). Extract real per-frame timestamps; if VFR, time by
   timestamp deltas, not frame index. This is a top source of timing error.
1. **Config-driven, not hardcoded.** All thresholds (velocity onset, debounce
   frames, agreement tolerance, line-proximity, distance-gate bounds) live in a
   single `config.yaml`. Tuning = editing config, not code.
1. **One drill = one plugin.** Core pipeline (detect → track → pose → events) is
   drill-agnostic. Each drill supplies a small “drill definition” describing its
   expected event sequence. Adding a drill must not require touching core code.
1. **Athlete-agnostic by design.** Every athlete moves differently — different
   running styles, strides, heights, weights, top speeds, and acceleration
   profiles, and every drill time will differ. The system must **not** assume a
   “normal” gait, speed, or body size. It works off **relative motion** of *this*
   athlete (their own velocity reversals, their own onset, their own reach), not
   absolute thresholds calibrated to one body type. A 5’6” quick guard and a
   6’4” lineman, a heel-striker and a toe-runner, a 4.4 burner and a 5.2 grinder
   must all be timed correctly. Thresholds are expressed relative to the
   athlete’s own scale (e.g. body-height units, their own speed range) and
   validated across a deliberately **diverse** set of athletes (see ground-truth
   requirements). If accuracy varies by body type or running style, that’s a bug
   to fix, not an athlete to exclude.
1. **The CODE does the analysis — not a human, and not Claude (NON-NEGOTIABLE,
   applies to EVERY drill).** Every drill's result must be produced **end-to-end by
   the runnable pipeline** from the uploaded video alone. The shipping product is:
   **a player uploads a video → the code analyzes it → the code returns the output**
   (a time, a measurement, or a structured REJECT). There is **no human in the
   analysis loop** at runtime — no manual scrubbing, no eyeballing a frame, no Claude
   looking at the footage to figure out the answer.
   - **Hand-analysis during development is SCAFFOLDING ONLY.** When Claude (or a
     human) inspects footage by hand to work out the logic, that is allowed *as a way
     to design the code* — but the capability does not exist until it is **committed
     as code that runs without a human.** A trick that only works when someone looks
     at the clip is **not done.** None of that manual insight is present when a real
     player uploads a clip the system has never seen, so any step still done by hand
     is an **un-built step**, logged as such (see the height drill's "STILL-MANUAL
     WEAK LINKS TO AUTOMATE" list for the pattern).
   - **The annotated video + logs are for human INSPECTION, not human COMPUTATION.**
     "Always look at the annotated video" (§5.V) means verify *what the code did*; it
     never means a human supplies part of the result. The number is the code's.
   - This is the deployment contract behind §1 *Runtime* (local Python, free libs, no
     paid API). It must hold for the shuttle, height, and every future drill.

-----

## 1. Capture Assumptions (current, will expand)

- **Camera:** handheld phone, operator stands at the start line and **pans** to
  follow the athlete in the run direction. Athlete is kept roughly centered but
  **not guaranteed** centered.
- **Athlete isolation:** athlete is **alone at the start line at t=0**. Other
  people (sideline, background) may enter frame during the rep.
- **Start trigger:** **movement onset**, NOT first-pixel motion. Athletes try to
  stand still in a stance; micro-jitter (breathing, weight shift, hand twitch)
  must be ignored. The clock starts when the athlete makes a **committed,
  sustained acceleration** toward the first touch (see Phase 5).
- **Stop trigger:** fully automatic (motion/event based, see drill definition).
- **Disagreement policy:** reject the rep and ask for a re-record.
- **Runtime:** local Python (laptop/server). Free/open-source libs only in the
  data path. No paid API calls required to produce a time.
- **Deployment contract (the product shape, every drill):** the analysis runs as
  **code on an uploaded video** — **player uploads a video → the code analyzes it →
  the code returns the output** (time / measurement / structured REJECT). Fully
  automatic, no human in the loop at runtime (Operating Principle 11). Today the
  engine runs as a CLI (`python -m drill_timing.run --video <clip> --drill <name>`);
  in the app it becomes a server-side worker the backend calls with the player's
  uploaded clip. Either way the *same* pipeline produces the *same* result — nothing
  in the data path depends on a human watching the clip.

-----

## 1.5 SELF-IMPROVEMENT GOVERNANCE (how the model changes itself — safely)

The system is self-improving, but improvement is **governed**, not automatic.
The goal is that it gets steadily more accurate and **never silently gets
worse**. These rules wrap the LEARNINGS loop.

### The improvement loop (HUMAN-APPROVED — Jackson has the final call)

Changes are **proposed and measured**, but **only Jackson decides** what ships.
The loop:

1. **Detect:** either the code (via `failures.jsonl` clustering) or Jackson spots
   a problem or an opportunity to improve accuracy.
1. **Investigate both sides:** Claude Code investigates and Jackson reviews the
   same problem independently — looking at the annotated video, the per-frame
   logs, and the failure records.
1. **Report back:** both report findings to each other — what’s wrong, the
   proposed change, and its measured effect on the ground-truth set (below).
1. **Executive decision:** **Jackson makes the final call** on what to switch,
   change, keep, or discard. Nothing is auto-merged. Claude Code never silently
   alters thresholds, swaps models, or changes logic without Jackson’s sign-off.
1. **Record:** the decision and its rationale go into the change history (below)
   and the relevant LEARNINGS section.

> Every change is a hypothesis with a measured outcome — but a human approves the
> outcome before it becomes the new normal.

### Rule 0 — No answer leakage (the timing path must never see ground truth)

Ground truth (`ground_truth.json`) is for **scoring and threshold-tuning only**.
The **timing pipeline must never read it while computing a time.** Only the
separate scoring script may open it, and only **after** the pipeline has
independently produced its result. If the measurement code ever peeks at the
true answer, it will “match” the answer and look perfect while being worthless
on any real rep where no answer exists. Grade it like a sealed exam: the
algorithm answers blind, then the score is revealed by comparison. This rule is
non-negotiable — a number produced with any access to ground truth is invalid.

### Rule 1 — Regression gate (no change is kept if it makes things worse)

Before any proposed change is accepted, it is scored against the **entire**
labeled ground-truth set, not just the clip that motivated it. A change may be
adopted **only if**:

- aggregate accuracy improves (or is equal) on the full set, **AND**
- **no clip that previously passed now fails**, and no clip-type’s accuracy
  regresses, unless Jackson explicitly accepts that trade-off in writing.
  A fix that helps crowded clips but breaks clean clips is **not** an improvement —
  it’s a trade, and only Jackson may accept a trade, with the reason logged.

### Rule 2 — Change history (every change is versioned & reversible)

Maintain `CHANGELOG_TUNING.md`. Every accepted change records: date, what
changed (config keys / model / logic), **before/after accuracy numbers on the
full ground-truth set**, the rationale, and who approved it (Jackson). This makes
every change **reversible** — if a later problem traces to a change, roll it
back. Without this, “self-improving” becomes undocumented drift.

### Rule 3 — Held-out test set is sacred (never tune against it)

Split the labeled clips into a **dev set** (tune on these) and a **held-out
set** (never tuned against, never inspected for tuning). All threshold tuning,
model selection, and logic changes are measured on the dev set. The held-out set
is run **only** to report honest, unbiased accuracy. If the model is ever tuned
against the held-out clips, they are burned — retire them and cut a fresh
held-out set. This is the only way “it’s getting better” stays trustworthy.

**Overfitting diagnostic — always compare the two numbers:** after any tuning,
report accuracy on **both** sets side by side.

- Dev **high** AND held-out **high** → the *method* genuinely improved. Good.
- Dev **high** BUT held-out **noticeably worse** → **overfitting**: the dials
  were fitted to quirks of the specific dev clips (a shadow, one athlete’s gait)
  rather than to the real problem, so it won’t generalize to a new rep. The dev
  number is misleadingly good.
- **The honest accuracy is always the held-out number.** Report and trust that
  one; the dev number will always look better than reality because it was
  optimized against. A large dev-vs-held-out gap is a red flag to **back off the
  over-specific tuning** or **add more clip variety** so the method must
  generalize instead of memorize. Don’t chase a perfect dev score.

### Rule 4 — Times stay consistent to what the model measures (version lock)

A given clip must always produce the **same time** from the same model version.
Timing is deterministic (fixed seeds, pinned model weights, pinned library
versions). Therefore:

- **Any** change to model weights, library versions, or timing logic requires
  re-running the **full ground-truth suite** and a `CHANGELOG_TUNING.md` entry —
  treat a dependency bump exactly like a code change.
- Each result records the **engine version** that produced it, so a stored time
  is always traceable to the exact configuration that measured it. A time means
  “what this version of the model measured,” and that must never silently shift
  underneath previously recorded reps.

-----

## 2. Tech Stack (pin versions in requirements.txt)

- **Python 3.11+** (this build: 3.12 venv — MediaPipe has no cp313 wheel).
- **OpenCV** (`opencv-python`) — video I/O, line detection, drawing, geometry.
- **Pose estimation:** **MediaPipe Pose** (Tasks API, `pose_landmarker_full.task`)
  is the DEFAULT backend — 33 landmarks incl. **heels + forefoot** for the shared
  BLUEPRINT skeleton (§5.V) — plus **MediaPipe Hands** (`hand_landmarker.task`) for
  TRUE fingertips (the hand-touch anti-cheat rule needs them). Both behind the
  swappable `PoseBackend` interface; **YOLO-Pose** (`yolov8n-pose.pt`, COCO-17) is
  the deterministic rollback (`pose.backend: yolo_pose`). NOTE: the MediaPipe
  `.task` bundles do NOT auto-download — vendor them once into `<repo>/models/`
  (fail-loud if missing; URLs in `core/model_assets.py`). Offline thereafter.
- **Person detection + tracking:** **YOLOv8/YOLO11 (Ultralytics)** for person
  boxes + built-in **ByteTrack** for persistent track IDs across frames.
- **Person segmentation:** **YOLOv8-seg** (`yolov8n-seg.pt`, auto-downloads) for
  the per-pixel person mask behind the BLUEPRINT glow outline + translucent overlay
  (§5.V); constrained to the locked athlete box. Toggle via `segmentation.enabled`.
- **Numerics:** numpy, scipy (for smoothing/signal filtering).
- **Config:** pyyaml.
- **Optional later:** Roboflow-exported model for yard-line segmentation if
  classical line detection proves insufficient (see Phase 4 LEARNINGS).

> Keep perception backends swappable behind thin interfaces. We will A/B them
> and keep whatever the LEARNINGS show is most accurate.

-----

## 3. Project Structure

```
drill_timing/
  config.yaml                 # all thresholds & tunables
  requirements.txt
  run.py                      # CLI: python run.py --video clip.mp4 --drill shuttle
  core/
    video.py                  # frame + TRUE timestamp extraction (handles VFR)
    detect.py                 # YOLO person detection
    track.py                  # ByteTrack wrapper -> stable track IDs
    athlete.py                # athlete-selection logic (center-bias + early lock)
    pose.py                   # pose backend interface + MediaPipe impl
    lines.py                  # yard/field line detection in image space
    kinematics.py             # smoothed velocity/accel of athlete center & joints
    events.py                 # generic event primitives (line-cross, reversal, onset)
    timing.py                 # two independent timers + agreement check
    distance_gate.py          # red/green "too close/too far" pre-flight check
    report.py                 # JSON result + annotated debug video + per-frame log
  drills/
    base.py                   # DrillDefinition interface
    shuttle_5_10_5.py         # FIRST drill (this file)
  tests/
    ...                       # per-phase test harnesses + sample clips
  debug_out/                  # annotated videos + logs (gitignored)
```

-----

## 4. THE PHASES

Build in this order. Each phase: **Goal → Build → Exit Criteria → Failure
Diagnosis → LEARNINGS (append-only).**

-----

### PHASE -1 — Environment & dependency gate (do this FIRST)

**Goal:** Prove every library works in isolation before any pipeline code. This
is where builds most often silently die (version conflicts, GPU/CPU, codecs).
**Build:**

- Pin exact versions in `requirements.txt`. Create the venv.
- Three isolated smoke tests, each must pass alone:
  - YOLO detects a person in one still image.
  - MediaPipe returns keypoints on one still image.
  - OpenCV reads one frame and reports true FPS / timestamps from a phone clip.
- Set random seeds + pin model weights for reproducibility.
  **ASK THE OPERATOR:**
- What OS / machine will this run on, and is there a GPU or CPU-only?
- Can you send **one short raw phone clip** of the drill right now (any quality)
  just to test video I/O and codecs?
- Any install constraints (corporate machine, Python already installed, conda vs
  venv preference)?
  **FOOTAGE / ASSETS YOU NEED:**
- 1 throwaway phone clip of anything with a person in it (for the smoke tests).
- 1 real drill clip straight off the phone (untouched, to test codecs + FPS).
  **OUTPUTS THIS PHASE HANDS OFF:**
- Working venv + `requirements.txt`, three green smoke tests, confirmed codec
  path, and a note on whether clips are CFR or VFR.
  **Exit Criteria:** all three smoke tests pass; one real clip opens and reports
  sane FPS/timestamps.
  **Failure Diagnosis:** install errors ⇒ resolve before anything else; do not
  work around with hacks. Codec errors ⇒ confirm `ffmpeg` present.
  **LEARNINGS:**
- *(append)*
- **2026-06-23 (Plan 1):** Machine = Windows 11, AMD Ryzen 7 5825U, AMD integrated
  GPU → **CPU-only** (no CUDA). MediaPipe has **no cp313 wheel**, so the venv must be
  built from **Python 3.12** (`py -3.12`, here a Store build 3.12.10 — it did NOT leak;
  `sys.executable` correctly pointed inside `.venv`). Pin recipe that worked: install
  **CPU torch first** (`--index-url .../whl/cpu` → `torch==2.6.0+cpu`/`torchvision==0.21.0`,
  verified `cuda.is_available()=False`) BEFORE the rest, so ultralytics can't pull a CUDA
  build. Then `pip install -r requirements.txt` (mediapipe==0.10.35, opencv-python==4.11.0.86,
  numpy==2.1.1, scipy==1.14.1, pyyaml==6.0.2, imageio-ffmpeg==0.5.1, ultralytics==8.3.40).
  **Gotcha:** mediapipe pulls `opencv-contrib-python 4.13`, which wins the `cv2` import
  (so `cv2.__version__` is 4.13, not the pinned 4.11). Functionally fine; record the
  *actual* cv2 version per Governance Rule 4. **ffmpeg/ffprobe NOT installed** — `choco
  install` needs an **elevated** shell (non-admin fails with lock-file/`lib-bad` access
  denied). Not a blocker: `video.py` falls back to OpenCV timestamps. Run `choco install
  ffmpeg -y` in an admin PowerShell to add the precision cross-check.

-----

### PHASE 0 — Harness & ground truth

**Goal:** Be able to measure whether anything works at all, and build the
**labeled ground-truth set** that makes self-correction possible.
**Build:**

- CLI skeleton (`run.py`) that loads a video and writes an annotated copy.
- **Mandatory labeled ground-truth set (hard gate — no Phase 2 until done):**
  ~15-20 clips, each hand-labeled with the exact **start frame, each touch
  frame, finish frame**, plus a **clip-type tag** (clean / crowded / too-far /
  too-close / bad-pan / left-open / right-open / invalid). Store as
  `ground_truth.json`. Build a tiny frame-stepper helper so the human can scrub
  and record these frames quickly.
- **Athlete diversity is mandatory in this set.** Because the system must be
  athlete-agnostic (Principle 9), the ground-truth clips must span **different
  body sizes (height/build), running styles (smooth vs choppy, heel vs toe),
  and speed ranges (fast burners and slower athletes)**. Tag each clip with the
  athlete so accuracy can be checked **per athlete and per body type** — if the
  system is accurate on lean fast guys but off on bigger athletes, that must show
  up here, not in production. Aim for a handful of visibly different athletes.
- **Failure logging mechanism:** every run auto-appends a record to
  `failures.jsonl` (clip, phase that failed, reason code, the signal values at
  failure). Session rule: **read `failures.jsonl` first, cluster by reason code,
  fix the most frequent failure mode first.** This is the self-learning loop.
- Scoring script: predicted vs ground-truth per clip + aggregate (mean abs
  error, worst case, # rejected, accuracy by clip-type).
- **“One dumb clip end-to-end” directive:** before hardening anything, make the
  pipeline produce *a* time (even a bad one) on ONE perfect clip — best light,
  no crowd, minimal pan. One clip flowing start-to-finish beats nine perfect
  phases that never connect.
  **ASK THE OPERATOR:**
- Can you record/scrub the ground-truth frames yourself, or should Claude Code
  build a click-through labeler to make it fast?
- Which single clip is your “golden” cleanest rep to use as the first
  end-to-end test?
- What total-time error would you consider “good enough to trust” for v1
  (e.g. ±0.10s)? This sets the target.
  **FOOTAGE / ASSETS YOU NEED:**
- The full **15-20 clip labeled set** described above (this is the big shoot —
  see Section 9 for the exact breakdown).
- 1 designated **golden clip** (your cleanest rep) called out explicitly.
- For each clip, a known true time (stopwatch in frame or called out).
  **OUTPUTS THIS PHASE HANDS OFF:**
- `ground_truth.json`, the scoring script, `failures.jsonl` writer, and a
  baseline (bad) end-to-end time on the golden clip.
  **Exit Criteria:** can run end-to-end on the golden clip and emit a result +
  annotated video; scoring script runs against `ground_truth.json`.
  **Failure Diagnosis:** if I/O fails, confirm codecs (`ffmpeg`) installed.
  **LEARNINGS:**
- *(append findings here)*

-----

### PHASE 1 — True-time video ingest (VFR-safe)

**Goal:** Convert a phone clip into frames with **accurate real-world
timestamps**.
**Build:**

- `core/video.py`: yield `(frame_index, frame, timestamp_seconds)`.
- Detect VFR vs CFR. If timestamps available, use them; else fall back to
  index/FPS but **log a warning** that timing precision is reduced.
- Expose `nominal_fps`, `is_vfr`, and a function to convert frame spans → seconds
  by **timestamp**, not by assuming constant FPS.
  **Exit Criteria:** for a clip of known real duration, summed frame-deltas equal
  the true duration within ±1 frame.
  **Failure Diagnosis:** times off by a constant ratio ⇒ FPS assumption wrong ⇒
  you’re treating VFR as CFR. Switch to timestamp-based timing.
  **ASK THE OPERATOR:**
- What phone(s) and which camera app/setting will you film with in production?
  (Different apps produce CFR vs VFR — pin this down.)
- What frame rate are you filming at (30 / 60 / 240fps slow-mo)? Higher fps =
  better timing resolution; will you commit to one setting?
  **FOOTAGE / ASSETS YOU NEED:**
- 1 clip of **known exact duration** (film a stopwatch running for e.g. 10.00s)
  to verify timestamp math.
- 1 clip from each phone/setting you might use in production.
  **OUTPUTS THIS PHASE HANDS OFF:**
- A verified true-time ingest function + a documented note: are production clips
  CFR or VFR, and what’s the timing resolution at your chosen fps?
  **LEARNINGS:**
- *(append)*
- **2026-06-23 (Plan 1):** `core/video.py` ingest verified on the TikTok test clip
  (`v12044...mp4`): nominal 30.232fps, 99 frames, ~3.27s, **CFR**, 396×480. **Key cv2
  quirk learned:** `CAP_PROP_POS_MSEC` reports the FIRST frame's timestamp differently
  across OpenCV builds — cv2 4.11 gave frame0 ≈ −25ms; cv2 4.13 gives frame0 = 0.0 then a
  short 8ms second delta, after which every delta is a clean 33.333ms. So **always
  normalize timestamps (`ts -= ts[0]`) before VFR analysis** (done) — the offset must never
  flip a CFR clip to VFR. The single first-frame delta artifact inflates stdev slightly
  (2.55ms here) but stays under the 3.0ms VFR tolerance; a 60fps simulation of the same
  artifact gives only 0.87ms stdev, so no false-VFR risk. **Timing always uses real
  per-frame timestamps via `frames_to_seconds()`, never index×(1/fps).** ffprobe (not yet
  installed) will be the precision upgrade + independent VFR cross-check. Production clips:
  committed to **60fps** (≈17ms/frame floor) — still need a filmed-stopwatch known-duration
  clip to close the Phase 1 exit criterion (±1 frame on summed deltas).

-----

### PHASE 2 — Person detection

**Goal:** Find all people per frame as bounding boxes with confidence.
**Build:** `core/detect.py` using YOLO person class only. Configurable min
confidence + min box size (filters tiny distant bystanders).
**Exit Criteria:** on sample clips, the athlete is detected in ≥95% of frames
where they’re fully in view (verify visually on annotated output).
**Failure Diagnosis:**

- Athlete missed when blurred during fast motion ⇒ lower confidence threshold,
  consider a larger YOLO model, or motion-deblur preprocessing.
- Too many false people ⇒ raise min box-size / confidence.
  **ASK THE OPERATOR:**
- In your real filming locations, how many other people are typically in frame,
  and how close do they get to the athlete?
- Any control over what the athlete wears (solid distinct color helps a lot)?
  **FOOTAGE / ASSETS YOU NEED:**
- A clean clip (athlete only) AND a crowded clip (sideline people present) so
  detection can be checked in both.
- A clip with motion blur at the fast 10-yard segment (athlete at top speed).
  **OUTPUTS THIS PHASE HANDS OFF:**
- Per-frame person boxes for every clip + a note on detection rate at the
  fast/far segment (the known weak spot).
  **LEARNINGS:**
- *(append)*

-----

### PHASE 3 — Athlete identification & locking (THE KNOWN PAIN POINT)

**Goal:** Pick the athlete once, then **stay locked on that same individual for
the entire rep** — never bouncing to a background person who runs by, a car
driving past, another athlete waiting, or anything else. Once the system says
“**this is the guy**,” that decision is sticky: it tracks that specific person
and nothing else.

**CORE PRINCIPLE — STICKY LOCK, NEVER SILENTLY SWITCH:**

- The lock is **identity-bound**, not position-bound. The system tracks *a
  specific person’s identity*, not “whoever is currently centered.” Center/size
  are only used to *choose* the athlete at t=0 — after that, identity rules.
- The system would rather **briefly lose** the athlete (and coast on predicted
  position) than **hand the lock to a candidate that doesn’t match the locked
  identity**. Losing track for a few frames is recoverable; timing the wrong
  person is not.
- **Persons only.** Only YOLO **person-class** detections are ever eligible to
  hold the lock. Cars, equipment, bags, balls, etc. are never candidates —
  filter to person class before any selection logic runs.
- If the system cannot confidently confirm the locked identity through the timed
  window, it **rejects the rep** (`ATHLETE_LOST` / `IDENTITY_UNCERTAIN`) rather
  than report a time that might be the wrong person.

**Build:** `core/track.py` (ByteTrack → stable IDs) + `core/athlete.py`.

**Step 1 — Select the athlete at t=0 (who is “the guy”):** the athlete is alone
at the start line, so pick the person (person-class only) nearest the start
line / frame-center in the first valid frames. Combine weighted signals (config):

1. **Early lock:** nearest start line / center at t=0 → candidate athlete.
1. **Center bias:** operator pans to keep athlete centered.
1. **Motion saliency:** the athlete is the one who actually traverses;
   bystanders are comparatively static.
1. **Size/scale:** foreground athlete is the largest plausible person box.

**Step 2 — Capture an IDENTITY FINGERPRINT at lock time (the anti-bounce key):**
the instant the athlete is chosen, record an appearance signature for that
person — e.g. clothing **color histogram** over the torso/legs, and optionally a
lightweight **ReID embedding**. This fingerprint, plus the ByteTrack ID, *is*
the locked identity. Store it.

**Step 3 — Maintain the lock every frame:** prefer the locked ByteTrack ID. For
the held track (and any candidate considered during a re-bind), require an
**appearance match to the fingerprint** above a config threshold AND plausible
proximity to the predicted position (motion model). A candidate that is centered
but **doesn’t match the fingerprint is rejected** — this is exactly what stops
the bounce to a passerby.

**Step 4 — Re-acquisition rule (only when the locked track is truly lost):** hold
last-known position and predicted motion; re-bind **only** to a person-class
track that (a) matches the identity fingerprint and (b) falls within a small
predicted-position search radius. If nothing matches, stay lost (coast) rather
than grab a wrong person. Log every lock / loss / re-bind / rejected-candidate
event with the reason.

**Exit Criteria:**

- On crowded clips (people walking through, someone crossing between camera and
  athlete, a car driving past, another athlete nearby), the correct person is
  tracked in ≥98% of in-view frames with **zero identity swaps** to any other
  person or object during the timed window.
- In a clip where a bystander runs right through the frame, the lock **stays on
  the original athlete** (verify on annotated video — athlete box in a distinct
  color the entire rep, with rejected candidates optionally drawn in another).
- If the athlete is genuinely lost and not re-acquired, the rep is **rejected**,
  not timed on someone else.
  **Failure Diagnosis:**
- Swaps to a crossing bystander ⇒ fingerprint match threshold too loose, or
  fingerprint not discriminative (similar uniforms) ⇒ tighten threshold, add/
  upgrade the ReID embedding, shrink re-bind radius, raise continuity weight.
- Lock jumps to a car/object ⇒ person-class filter not applied before selection
  — fix immediately; objects must never be candidates.
- Lost during the cuts (athlete twists/bends at a touch) ⇒ YOLO may drop the box
  at extreme pose; bridge short gaps with last-known + pose continuity rather
  than re-binding to someone else.
- Two similar-looking athletes near the start ⇒ fingerprint alone may be weak;
  require the start region to contain exactly one person before accepting a
  start, and lean on the at-t=0 isolation.
  **ASK THE OPERATOR:**
- Can you guarantee the athlete is the only person in the central start area at
  t=0? If not, how should ties be broken?
- Is it acceptable to require the athlete wear a known color/bib? This makes the
  identity fingerprint far more discriminative and is the single biggest boost
  to never-bounce reliability — strongly recommended if you can enforce it.
- During a rep, do bystanders ever cross directly between camera and athlete,
  and are they sometimes in similar uniforms/colors? (Drives how strong the
  fingerprint must be.)
  **FOOTAGE / ASSETS YOU NEED:**
- The **crowded** clips are critical here: people walking through frame, someone
  crossing directly between camera and athlete, another athlete waiting nearby,
  and ideally a **car or moving object** passing in the background.
- One clip with the athlete in a distinct color and one in a color similar to
  bystanders, to test whether the fingerprint alone holds or a bib is needed.
- A clip where a second person **runs through** the frame mid-rep (the classic
  bounce trigger) to prove the lock stays put.
  **OUTPUTS THIS PHASE HANDS OFF:**
- A locked athlete identity (track ID + appearance fingerprint) per clip, a
  per-frame “is the athlete confidently locked?” flag, and a
  lock/loss/re-bind/rejected-candidate event log. The annotated video must show
  the athlete box in a distinct color for the whole rep.
  **LEARNINGS:**
- *(append — this section will likely grow the most)*
- **2026-06-23 — Phase 3 built & passing on the 2-person clip (right athlete locked, 0 swaps).**
  Built core/track.py (ByteTrack via `YOLO.track(persist=True)`; needs `lapx` dep) + core/
  athlete.py (drill-likeness select + HSV fingerprint + lock state machine). Two hard-won
  lessons:
  1. **Color-histogram fingerprint is NOT discriminative enough to GATE the lock.** Measured on
     this clip: athlete self-match dropped to 0.39 while sprinting; bystander cross-matched up to
     0.49 → **margin -0.09 (negative)** — no color threshold separates the two people. **Trust
     the ByteTrack ID as the primary lock** (Step 3 says exactly this); the fingerprint is only
     for re-bind/anti-bounce, NEVER a per-frame gate that rejects a present stable track. A too-
     strict fp gate makes the system "lose" the RIGHT person. ReID embedding is the real upgrade
     for crowds (use_reid_embedding) — color alone is weak.
  2. **Drill-likeness selection must be MOTION-dominant, not central/size-dominant.** First cut
     over-weighted centrality+size → a near-stationary CENTRAL bystander (peak speed 0.57, cx
     183-204) beat the real athlete who SWEEPS the frame (peak 3.49, cx 104-359). A person
     standing in the middle must NOT outscore someone actually sprinting the drill. Fix: peak-
     speed + horizontal traversal DOMINATE; central/size are weak tie-breakers; gate reversals on
     real motion (a stationary person's pixel jitter faked 9 "reversals"). After: 17.2 vs 6.9.
  Result: locks the right athlete, detection_rate 0.99, 89 reject_candidate events (bystander
  refused every frame), 1 same-id rebind, **0 identity swaps**; onset moved from -27 (wrong
  person) to -5 (right person; the residual is the SEPARATE onset-floor tuning). **Crowded
  robustness (≥98%, runner-through, car) is UNVALIDATED — needs the real clip set.** ALWAYS view
  the annotated video to confirm WHO is locked; a good detection_rate on the WRONG person looks
  fine in the numbers.

-----

## FIELD-LINE & TICK TRACKING — the adopted convention

> **This is the adopted convention for field-line tracking across every drill filmed on a lined field.** It marks, per frame, **where the real yard lines and 1-yard ticks are relative to the current camera view** — glued to the field, independent of the athlete. It obeys the same platform standards as the athlete tracker (two-pass, config-driven, honest-signal-vs-render, deterministic self-check), so any future drill that needs to know where the paint is reuses this shape rather than reinventing it.

> **GOVERNANCE NOTE — this was REMOVED from the Python engine and now lives browser-side.** The old engine yard-line code is **deleted**: `core/lines.py`, `core/calibration.py`, the `lines:` / `field_calibration:` config blocks, `report.draw_lines`, the `NOT_A_LINED_FIELD` / `CALIBRATION_FAILED` result codes, and the `run.py` pass-1d line step are **gone**. The Python engine no longer does any yard-line detection. Field-line tracking now lives entirely in the **browser tool** at `frontend/drill-lab/shuttle-test/`. **PHASE 4 below describes the *goal* (a real-world ruler + anti-cheat) that this convention now serves; treat the Phase-4 build bullets as SUPERSEDED by this section for how detection is actually done.**

### The goal

Put a mark on the true field lines and ticks **as seen through the camera**. The output is **player-independent**: the marks land on the real paint on the field, not on the athlete, and never on the sky or the surrounding track. This is the spatial backbone every lined-field drill builds on — the thing that will later let us convert pixels to yards and prove an athlete actually reached a line.

### The method in principle (per frame)

Everything runs in full-frame pixels, mapped up from a downscaled processing width (~360 px) for speed. **The overlay is a per-frame mask, not a tracked model** — the reference clip is near-static (total camera pan across the whole clip ≈ 86 px), so the field-gated white mask computed fresh each frame already sits on the paint, with no pan estimation or temporal tracker.

1. **Detect the field region.** `detectField()` samples the dominant surface hue/sat/val from a lower-center patch and keeps pixels near that surface hue, cutting the brighter sky (sky ceiling = surface-V + margin). It does **not assume green**. Then a **big morphological close** bridges the paint-line gaps into one solid field blob, `keepLargestComponent` drops the sky/track/bleacher blobs, and `fillHoles` (flood the background from the frame border; enclosed holes = field) turns the paint-line holes back into field. Result: a field mask that **contains the on-field paint** and **excludes the sky / far track / bleachers**.
2. **Find the white paint within it.** `whiteMask(imgData, fieldMask)` takes the white paint (low saturation, high value) **AND-ed with the field region**, then a light open for turf speckle. Two rejections for free: a bold **blue** soccer/lacrosse line and an **orange** mid-field line by **color**; the **sky / clouds / far track** (a big solid off-field white blob, ~9k px/frame) by the **field gate**. This mask is `det.whiteMask` — the whole overlay.
3. **Overlay = the white mask recolored.** `buildWhiteOverlayBitmap` recolors every `det.whiteMask` pixel **blue**, so the overlay exactly covers the real paint shape — it **hugs the paint, it is not drawn as straight line strokes**. A **debug** toggle (`buildDebugBitmap`) shows the field tint (green) + the white mask (magenta) for tuning; the blue overlay is literally that magenta mask recolored — blue is pink minus color.

### Why this is the right shape for the platform

- **It obeys the platform standards.** **Two-pass:** Pass 1 seeks every frame, runs `detectYardLines`, and caches the pre-rendered blue/debug `ImageBitmap`s; Pass 2 (Play) just blits the cached bitmaps, so playback is smooth (same discipline as the athlete tracker). **Config-driven, no magic numbers:** everything lives in `SHUTTLE_CONFIG.yardLines`. **Honest-signal-vs-render:** `det.whiteMask` is the real per-frame signal; the blue recolor is a 1:1 render stamp that never masquerades as detection. **Deterministic self-check:** `_selfCheck()` runs DOM-free in Node and asserts the field excludes sky, blue/orange are rejected by color, **white ⊆ field** (no off-field/sky pixel is ever lit), and the on-field lines/ticks are covered (the big-close + fillHoles gate doesn't eat real paint).
- **It generalizes.** Any drill filmed on a lined field reuses detect-field → white-within-field → recolor-overlay unchanged. The drill only decides what to *do* with the marked paint. (For a genuinely moving-camera clip, re-deriving the field region per frame keeps the overlay on the paint; a real pan would only need pan compensation re-introduced if per-frame detection ever proved too jittery — it did not here.)

### Where it lives

Browser tool only — `frontend/drill-lab/shuttle-test/`:
- `yardLines.js` — `detectField` / `whiteMask` / `detectYardLines` + `_selfCheck` (DOM-free; importable headless in Node on exported RGBA frames).
- `yardLinesRender.js` — `buildWhiteOverlayBitmap` (blue overlay) + `buildDebugBitmap` (debug view).
- `yardLinesController.js` — the two-pass controller for the "Yard Lines" subtab.
- `config.js` — the `SHUTTLE_CONFIG.yardLines` block.

### LEARNINGS — abandoned approaches (do NOT repeat these)

- **The "5-yard comb" (rejected).** Enforcing a family of evenly-spaced parallel lines assumed a clean multi-line grid. In real footage **only the center vertical line is boldly painted**, so the comb had nothing to lock onto. Abandoned.
- **Center + synthesized L/R via a pixels-per-yard ruler (rejected).** Detecting one vertical center line and synthesizing the neighbors at ±5 yd made **all lines slide together with the camera** instead of pinning to the field. Abandoned.
- **PCA segments + camera-pan estimate + pan-locked / de-panned accumulator (rejected).** Measured on the real clip: the segment path lost ~74% of the paint and the accumulator smeared ~59% of the overlay OFF the paint ("blue all over the screen," slightly-left, flashing); and the pan it relied on was ~0 (camera near-static, ~86 px total). The whole pan/segment/accumulator machinery was removed in favor of the direct field-gated per-frame mask. All the dead code (`Segment`, `componentToSegment`, `mergeCollinear`, `estimatePanShift`, `columnProfile`, `PanMaskAccumulator`, `rasterizeSegments`, `YardLineTracker`, `whiteMaskSkyCut`, and the older `classifySegments`/`enforceFiveComb`/`detectVerticalLines`/`pixelsPerYardFromTicks`/`labelAndPlaceLCR`) was **deleted**.

### What gets REBUILT on top of this later

Pixels-per-yard **calibration** (the real-world ruler) and the **anti-cheat touch/finish validation** (§4B — hand reaches the line within tolerance, torso crosses the finish, path totals ~20 yd) were part of the deleted engine code and are **not** rebuilt yet. They will be rebuilt **on top of these tracked, pan-locked lines** — the tracked segments are the substrate the ruler and the anti-cheat gates consume. Until then, this convention delivers only the tracked-line overlay, honestly, and nothing downstream should assume a calibrated yard scale exists.

### How to run / tune

Serve `frontend/` over `http://` (Live Server), open the 5-10-5 Testing screen → **"Yard Lines"** tab → **Analyze Lines** → **Play**. Toggle **"Debug masks"** to see field / white-mask and tune the knobs: `white.{max_sat, min_val, open_px}` and `field.{close_px, hue_tol, sky_val_margin, fill_holes}` (raise `close_px` / lower `hue_tol` if the sky or track leaks — both trade a little tick coverage for a cleaner off-field cut). **Headless:** `yardLines.js` is DOM-free — `import { detectYardLines, _selfCheck }` and run in Node on exported RGBA frames. Validated headless in Node over all **206 frames** of `Shuttle1.MOV` (1280×720 portrait-shot-sideways, ~30 fps, camera near-static): overlay strictly **⊆ field on every frame (0 off-field px)**, steady coverage (no flashing), the big sky blob removed; `_selfCheck()` ALL PASS. Visually on frames 40/120/200: sky gone, the blue distractor line stays bare, blue hugs the white paint.

-----

### PHASE 4 — Yard-grid calibration & drill-line identification

> **[DETECTION SUPERSEDED — see "FIELD-LINE & TICK TRACKING — the adopted convention" above.]** The pixel→yard *ruler* + *anti-cheat* GOALS below still stand and will be rebuilt on top of the browser-side pan-locked line tracker; the classical detection BUILD bullets (`core/lines.py`/`core/calibration.py`) are archived — that code was deleted.

**HARD PRODUCT CONSTRAINT:** All drills **must** be recorded on a **lined
football field**. The app refuses to time a rep otherwise. This is not a
nicety — it is the spatial backbone of the whole system. A standard field has
yard lines every **5 yards**, which gives us a **known real-world ruler in every
frame**. We use that ruler to (a) convert pixels → real yards, (b) identify which
lines are the drill’s touch/finish lines, and (c) **prove the athlete actually
reached each line and crossed the finish — i.e. catch cheating.**

This phase has two parts. Build **4A before 4B**.

-----

#### PHASE 4A — Yard-grid detection & pixel→yard calibration

**Goal:** Detect the field’s 5-yard line grid and establish, per frame, a mapping
from image pixels to **real yards**, robust to the panning handheld camera.
**Build (`core/lines.py` + `core/calibration.py`):**

- **Detect the yard-line set:** color/edge mask for painted field lines →
  Hough/contours → collect the family of (near-)parallel yard lines crossing the
  run direction. On a real field these recur at a regular spatial interval.
- **CONFIRM IT'S THE FOOTBALL 5-YARD GRID, not just "some lines" (multi-sport
  fields).** Many fields are multi-use turf with **other markings** — soccer
  touch/goal lines, lacrosse, hash marks, logos, sideline borders. The system must
  not treat any old painted line as a yard line. It must specifically recognize
  the **football yard-line pattern: a family of (near-)parallel lines, crossing
  the run direction, recurring at a REGULAR, EVENLY-SPACED interval that maps to
  5 yards.** How to disambiguate: (a) require ≥3 lines that are mutually parallel
  AND evenly spaced (constant pixel spacing after perspective correction) — soccer
  lines are NOT a regular 5-yard comb, they're a few isolated lines at irregular
  spacings; (b) reject lines whose orientation/spacing doesn't fit the recurring
  comb; (c) optionally confirm with yard-number markings ("30"/"40") if visible.
  Only a set that passes "evenly-spaced parallel comb consistent with 5 yards" is
  accepted as the yard grid — everything else (stray soccer/lax lines) is ignored.
  If no such regular 5-yard comb exists, return `NOT_A_LINED_FIELD` (it may be a
  field with markings, but not the football grid we can measure with).
- **Establish the 5-yard scale:** measure the spacing between adjacent detected
  yard lines. Because the real spacing is **known = 5 yards**, the median
  adjacent-line spacing in pixels defines the **pixels-per-yard scale** *at that
  depth in the image*. This is the “that is 5 yards” anchor you asked for — the
  system never guesses distance, it reads it off the field’s own markings.
- **Handle perspective:** the camera is at field level and angled, so yard
  lines are **not** evenly spaced in pixels — lines farther away are closer
  together. Build a perspective model: fit a homography (or a per-region
  pixels-per-yard function) using **3+ visible yard lines** so the system knows
  the real-yard scale at any point in frame, not just one global number.
  - Validation of the homography is free: it must reproduce **5-yard spacing**
    between known lines. If reconstructed spacings aren’t ~5 yd apart, the
    calibration is wrong — reject the rep with `CALIBRATION_FAILED` rather than
    trusting a bad ruler.
- **Track through panning:** as the phone pans, yard lines sweep across frame.
  Maintain the calibration frame-to-frame (re-fit as new lines enter / old lines
  leave), so pixels→yards stays valid the whole rep.
- **Field-validity gate:** if a clean 5-yard grid can’t be found, return
  `NOT_A_LINED_FIELD` and refuse to time. (Enforces the product constraint.)
  **Exit Criteria:**
- On real clips, reconstructed adjacent yard-line spacings are within a small
  tolerance of **5.0 yards** (e.g. ±0.3 yd) across the in-play region.
- A known real distance in the clip (e.g. measure something 10 yards across two
  lines) is recovered within tolerance from the calibration.
  **Failure Diagnosis:**
- Spacings come out uneven / wrong ⇒ perspective not modeled; you’re using one
  global pixels-per-yard instead of a homography. Fix the perspective model.
- Only 1-2 yard lines visible (camera too zoomed/close) ⇒ can’t fit perspective
  ⇒ this is also a **distance problem** (see Phase 8): the operator must be far
  enough back to see **at least 3 yard lines**. Feed this into the red/green gate.
- Grass wear / shadows break the mask ⇒ adaptive threshold, or escalate to a
  Roboflow-trained line-segmentation model.
  **ASK THE OPERATOR:**
- Confirm: every real rep is on a regulation 5-yard-lined field? Any chance of
  high-school vs other fields with different markings/hash patterns?
  > **OPERATOR NOTE (2026-06-24, Jackson):** fields may be **multi-sport turf with
  > OTHER lines present** (e.g. soccer/lacrosse markings). Phase 4 must specifically
  > recognize the **football 5-yard yard-line pattern** (an evenly-spaced parallel
  > comb mapping to 5 yd) and IGNORE stray non-football lines — see the "CONFIRM
  > IT'S THE FOOTBALL 5-YARD GRID" build bullet above.
- Roughly how many yard lines do you expect to be visible in frame at your
  intended filming distance? (Need ≥3 for perspective; more = better.)
- Are yard-number markings (the painted “30”, “40”) usually visible? They can
  disambiguate which physical line is which if needed.
  **FOOTAGE / ASSETS YOU NEED:**
- Clips framed so **at least 3-4 yard lines** are visible during the whole rep.
- A clip filmed too close (only 1-2 lines visible) to confirm the system rejects
  / flags it as too close.
- Clips on the different field types you’ll actually encounter.
  **OUTPUTS THIS PHASE HANDS OFF:**
- A per-frame pixels↔yards calibration (homography) validated against the known
  5-yard spacing, plus a field-validity flag.
  **LEARNINGS:**
- *(append)*
- **2026-06-24 — Phase 4A built; comb-recognition logic verified; the test clip is below the
  classical line-detection floor.** `core/lines.py` + `core/calibration.py` implemented. Key
  decisions/lessons: (1) **derive the yard-line orientation from the athlete's run axis** (PCA
  on the COM path) and look for lines PERPENDICULAR to it — never hardcode vertical/horizontal
  (this clip's run_axis came out -1.4°, lines ~vertical). (2) **A vertical-morphology +
  column-projection-profile path beats raw Hough for FAINT/BROKEN yard lines** — Hough latches
  onto the long horizontal horizon/wall edge; a tall-thin morphological OPEN isolates the
  run-perpendicular structure. Both paths are in lines.py. (3) **The comb recognizer is what
  enforces "football grid, not soccer lines"**: require ≥3 mutually-parallel lines, evenly
  spaced (raw CV low OR perspective-monotonic) — irregular markings fail. Self-check 6/6.
  (4) Calibration model is **1-D along the run axis** (the shuttle is 1-D); a full 2-D
  homography needs a lateral reference (yard numbers) and is deferred. (5) **HONEST OUTCOME on
  the only clip we have:** a 396×480 TikTok-compressed indoor clip — the yard lines are real but
  faint/short/broken, so detection yields NOT_A_LINED_FIELD (correct fail-loud, not a bug). The
  render still shows box/skeleton (debug visibility preserved on a reject). **Calibration
  ACCURACY is UNVALIDATED** until a higher-res clip with clearly visible lines + a known
  distance exists. If classical still struggles on real footage, escalate to a trained
  line-segmentation model (the documented fallback above). Lesson reinforced: low-res social
  clips are a poor substitute for the spec's "framed so ≥3 yard lines are visible" footage.

-----

#### PHASE 4B — Identify the drill lines & validate touches/finish (anti-cheat)

**Goal:** Of all the yard lines on the field, identify the **three that define
this drill** (start/center + two turn lines 5 yards each way), and use the
yard calibration to **verify the athlete legitimately touched each line and
crossed the finish** — so no one can shortcut the system.
**Build (`drills/*` + `core/events.py`):**

- **Pick the drill lines, not just any yard line.** Use the athlete, not the
  paint, to choose:
  - **Start/center line** = the yard line the athlete straddles at t=0 (from
    Phase 3 lock + Phase 5 onset).
  - **Turn lines** = the yard lines nearest the athlete’s two reversal points.
  - **Cross-check with calibration:** the two turn lines must sit ~**5 yards**
    either side of center (that’s the drill). If the nearest reversal lines
    aren’t ~5 yd out, the rep doesn’t match the drill ⇒ `BAD_GEOMETRY` reject.
    This is how the system ignores the dozen *other* yard lines in frame and locks
    onto the right three.
- **Touch validation (anti-cheat #1) — HAND ONLY, FINGERS COUNT:** at each
  reversal the athlete must **touch the turn line with a HAND**. A **foot at or on
  the line does NOT count** — if the athlete reaches the line with a foot but not a
  hand, the rep is **invalid** (`SHORT_TOUCH` — see foot-only note below). The
  **reach point** is the athlete’s **lowest hand/fingertip keypoint** from pose
  (config `touch_keypoint: hand`; fingertips count, so use the most-extended hand
  landmark — e.g. MediaPipe wrist + finger-tip landmarks, take the one nearest the
  line). Measure that reach point relative to the turn line in **real yards** via
  calibration. A touch is valid only if the **fingertip reaches the line** within
  `touch_tolerance_yd`. If the athlete turns **short** of the line with the hand
  (stops inside the tolerance), or touches with a foot only, flag `SHORT_TOUCH` and
  reject. **The shuttle requires a valid hand touch at BOTH turn lines (left and
  right); if either touch is foot-only or short, the drill does not count.** No more
  “close enough” — the field’s ruler decides, and only a hand counts.
  - *Note on the timer:* the hand touch is a **validity gate, not a timing event**.
    Total time is onset → finish-line cross only (the finish is a torso cross of C,
    not a hand touch). The hand touches must be *present and valid* for the rep to
    earn a Verified time, but their exact frame does not change the total.
  - *Foot-only touch:* per operator decision, a touch made with the foot but no hand
    reaching the line is rejected as **`SHORT_TOUCH`** (the drill is invalid).
- **Finish-cross validation (anti-cheat #2):** the clock stops only when the
  athlete’s **torso** fully **crosses** the center/finish line (not merely
  approaches it), measured in yards across the line. Partial/early stops →
  `NO_FINISH_CROSS` reject. Define crossing by the torso centroid passing the
  line, consistent between Method A and Method B (Phase 7).
- **Distance back-check (anti-cheat #3):** using calibration, the reconstructed
  path should total ~**20 yards** (5 + 10 + 5). If the measured geometry implies
  materially less, the rep is invalid (`DISTANCE_SHORT`). This catches a player
  who cuts the corners or a mis-detection that shortened the run.
  **Exit Criteria:**
- Correct three drill lines identified on every clean clip (verify on annotated
  video — drill lines highlighted distinctly from other yard lines).
- On a deliberately **short-touch** test clip, the system flags `SHORT_TOUCH`.
- On a **no-finish-cross** test clip, the system flags `NO_FINISH_CROSS`.
- On clean clips, measured total distance ≈ 20 yd within tolerance.
  **Failure Diagnosis:**
- Wrong yard line chosen as a turn line ⇒ tighten “nearest reversal line + must
  be ~5 yd from center” rule; use yard-number markings if available.
- Valid touches wrongly rejected ⇒ `touch_tolerance_yd` too tight, or pose
  reach-point noisy at the far/fast turn (the known weak spot) — widen tolerance
  or improve pose crop there.
- Cheating slips through ⇒ tighten tolerances; log the case to `failures.jsonl`
  and add to LEARNINGS.
  **ASK THE OPERATOR:**
- How strict should “touched the line” be? A real ref allows a hand on/near the
  line — what real-yard tolerance feels fair but uncheatable? (Sets
  `touch_tolerance_yd`.)
- Must the athlete cross the finish fully, or is reaching it enough by your
  rules? (Sets finish-cross definition.)
- Is touching with a **hand** required, or does a foot-on-line count? (Changes
  which keypoint defines the reach point.)
  > **ANSWERED (2026-06-23, Jackson):** A valid touch requires a **HAND** — the
  > lowest **fingertip** must reach the turn line within `touch_tolerance_yd`.
  > **Fingers count.** A **foot at/on the line does NOT count.** A foot-only touch
  > is rejected as `SHORT_TOUCH` (drill invalid). The shuttle needs a valid hand
  > touch at **both** turn lines. Reach point = hand/fingertip keypoint
  > (`touch_keypoint: hand`), never the foot.
  **FOOTAGE / ASSETS YOU NEED:**
- A clean rep with clearly legal touches and a full finish cross.
- A **cheat test** rep where the athlete deliberately turns ~1-2 yards **short**
  of a line (to prove `SHORT_TOUCH` fires).
- A **cheat test** rep where the athlete stops at/before the finish without
  crossing (to prove `NO_FINISH_CROSS` fires).
- A rep where the athlete cuts the run short overall (to test `DISTANCE_SHORT`).
  **OUTPUTS THIS PHASE HANDS OFF:**
- The three identified drill lines per clip (in pixel + yard space), per-touch
  validity verdicts, finish-cross verdict, and reconstructed total distance —
  all feeding the timing + reject logic in Phase 7.
  **LEARNINGS:**
- *(append)*
- **2026-06-23 (operator rule):** Touch = **HAND ONLY, fingertips count.** Reach
  point is the athlete's **lowest hand/fingertip keypoint** (MediaPipe wrist +
  finger landmarks — take the landmark nearest the turn line), NOT a foot. A foot
  at/on the line does **not** count → `SHORT_TOUCH`. A valid hand touch is required
  at **both** turn lines or the rep is invalid. The hand touch is a **validity
  gate, not a timing event** (total time = onset → finish-cross only). **When pose
  is drawn (Phase 5), the annotated video must highlight the HAND/fingertip as the
  touch point** (e.g. a marker on the reaching hand at the turn line) so a human can
  see the hand reach the line — the operator specifically wants to verify the hand,
  not the foot, on the annotated output. Config: `anti_cheat.touch_keypoint: hand`,
  `anti_cheat.require_hand_touch_both_lines: true`.

-----

### PHASE 5 — Pose, kinematics & MOVEMENT-ONSET start

**Goal:** Get smoothed athlete motion signals and detect the **true start** =
committed movement onset, not pixel jitter.
**Build:**

- `core/pose.py`: per-frame keypoints for the locked athlete (crop to athlete
  box for accuracy).
- `core/kinematics.py`: compute athlete **center-of-mass** (e.g. mid-hip) and key
  joints; velocity & acceleration via finite differences on **timestamps**, then
  smoothed (e.g. Savitzky-Golay). **Important:** because the camera pans,
  prefer signals that survive panning — see Phase 6 on world-vs-image motion.
- **Normalize to the athlete’s own scale (athlete-agnostic).** Express motion
  thresholds **relative to this athlete**, not in absolute pixels or one assumed
  speed. Two good references are available and should be used:
  - **Body scale:** use the athlete’s pixel height (or a stable segment like
    hip-to-shoulder) to normalize, so a tall and a short athlete are treated
    consistently regardless of how big they appear in frame.
  - **Yard scale:** once Phase 4 calibration exists, velocities can be expressed
    in **yards/second**, which is body-size-independent and physically real.
    This is what lets the same logic correctly time a small quick athlete and a
    large powerful one, a smooth strider and a choppy one — no per-athlete config.
- **Onset detector** (`core/events.py::detect_onset`): the clock starts when
  COM speed (in the chosen reference frame, **normalized to athlete/yard scale**)
  ramps past `onset_speed_floor` AND stays above it for `onset_debounce_frames`
  consecutive frames AND shows a positive acceleration spike. Sub-threshold
  flickers that settle back are ignored. This mimics a human reaction-timer: it
  fires on the *commit*, not the twitch. Because the floor is relative to the
  athlete’s own scale, it adapts to different running styles automatically.
  **Exit Criteria:** detected start frame matches human-judged “first explosive
  move” within ±2 frames on sample clips, and does **not** trigger on stance
  micro-movements.
  **Failure Diagnosis:**
- Early trigger on jitter ⇒ raise floor / increase debounce frames / require
  acceleration spike.
- Late trigger ⇒ lower floor / reduce debounce; check smoothing lag (heavy
  smoothing delays onset — compensate or use a lighter filter for onset only).
  **ASK THE OPERATOR:**
- For the labeled clips, can you mark the exact frame YOU consider the “true
  start” (first committed move)? Claude Code tunes the onset detector to match
  your judgment.
- How still do athletes realistically stand at the line — fidgety or locked-in?
  (Sets how aggressive the jitter rejection must be.)
- Do any athletes do a rocker/false-step before committing? (Could fool onset.)
  **FOOTAGE / ASSETS YOU NEED:**
- Clips where the athlete is deliberately fidgety in the stance (to prove the
  detector ignores jitter).
- Clips with a clean explosive start AND one with a hesitant/rocking start.
  **OUTPUTS THIS PHASE HANDS OFF:**
- A detected onset frame per clip, validated against your hand-marked start
  frames (±2 frame target), plus tuned onset config values.
  **LEARNINGS:**
- *(append)*

-----

### 5.V — VISUALIZATION / SKELETON BLUEPRINT (shared by ALL drills)

> **This is the ONE canonical person-tracking visual for every drill.** The
> operator's reference (built with Fable 5, 2026-06-26) is the blueprint: a
> glowing person **OUTLINE**, a translucent person **OVERLAY/fill**, and a
> **WHITE-line skeleton** with named joint dots. All of it is rendered by the
> shared `core/report.py` from the shared `core/pose.py` + `core/segment.py`
> outputs — no drill draws its own. Colors/sizes live in `config.yaml` `render:`
> (Operating Principle 7 — no hardcoded visuals). **ALWAYS inspect the annotated
> video**: it is the primary human-inspection surface, the way the wrong-person
> lock and the vanishing-touch skeleton were both first caught.

**Canonical joints (drawn as dots):** `head_center`, shoulders, elbows,
**hands/fingertips**, hips, knees, ankles, **heels**, **forefoot** (one per foot).
The white skeleton edges connect them head→shoulders→arms(→fingertip)→torso→
hips→legs→**ankle→heel→forefoot**. The **fingertip dots are accented** (a distinct
color) so the hand touch point — the thing the §4B hand-touch anti-cheat rule
measures — is visible on the video.

**HONESTY NOTES (trustworthy or nothing — we never draw a joint we can't locate):**
- **Foot = ankle → heel → ONE forefoot point.** The operator originally asked for
  separate "ball of foot" and "tip of toe" joints. No free/offline model gives two
  separable forefoot joints; MediaPipe gives the **heel** (29/30) and a single
  **forefoot/`foot_index`** (31/32, the ball-of-foot area). We draw those three
  REAL points and **do not invent a toe tip**. (A derived, distinctly-marked tip is
  a possible future option if the operator wants it; v1 stays honest.)
- **`head_center` is DERIVED**, native to no model: from the eye-line stepped up by
  a fraction of the eye→shoulder span (`render.head_center_offset_frac`), falling
  back to the nose. Marked as derived here; the seg-mask top is a future refinement.
- **Fingertips** come from **MediaPipe Hands** on a wrist crop (true tips). When
  Hands is gated off / finds nothing, the fingertip falls back to the **wrist
  position at reduced confidence** (it is the wrist proxy, not a measured tip).

**Outline + overlay** come from **per-pixel segmentation** (`yolov8n-seg.pt`)
constrained to the **locked athlete box** (the instance whose mask is most inside
the box, ≥`segmentation.min_mask_in_box`) — a bystander never gets a silhouette,
same anti-bystander spirit as the pose box-constraint (§Pose-fix learning).

**Backend-independent / graceful degrade.** Keypoints live in one dense array over
`BLUEPRINT_NAMES` (COCO-17 is the first-17 prefix). Each edge/dot draws only when
its endpoint(s) resolve, so the `yolo_pose` rollback (COCO-17 only) still renders
the silhouette + the 17-joint white skeleton — the heel/forefoot/fingertip dots
simply drop. `mid_hip()`/`body_height_px()` are unchanged, so kinematics/onset are
unaffected by the backend swap (exact COM numbers differ — a Rule-4 model swap).

**REMOVED (old shuttle visuals, replaced by the blueprint):** the green COCO
skeleton, the cyan athlete box, the dim-red candidate boxes, and the magenta
center-of-mass dot are gone from the video. `mid_hip()` is still computed for
kinematics — only the magenta dot is no longer drawn. (`render.debug_boxes: true`
can re-enable the raw boxes for debugging.)

-----

### PHASE 6 — Panning compensation (image motion ≠ real motion)

**Goal:** Because the phone rotates to follow the athlete, the athlete looks
centered while covering real yards. Separate **camera motion** from **athlete
motion** so events are real, not artifacts of panning.
**Build:**

- Estimate camera pan per frame from **background** motion (optical flow on
  static background features / homography of the field, excluding the athlete
  box).
- Produce athlete motion **relative to the field** (de-panned), so velocity
  reversals correspond to real direction changes at the touches, not to the
  operator swinging the phone.
  **Exit Criteria:** on a panning clip, the de-panned athlete horizontal-velocity
  trace shows the expected shuttle signature (two clean sign reversals); raw
  image-space trace does not.
  **Failure Diagnosis:**
- Reversals look noisy ⇒ improve background flow (mask athlete + other people
  before estimating pan), increase smoothing on the de-panned signal only.
- No reliable background texture (bare sky/grass) ⇒ fall back to line-crossing
  events from Phase 4 as primary; note this clip type in LEARNINGS.

> **Scope note:** this is the hardest CV in the project. For *getting it built*,
> stub this first — let Method B lean on raw pose reversals — and only harden
> full de-panning once the rest of the pipeline produces times end-to-end.

**ASK THE OPERATOR:**

- How much do you actually pan in a real rep — a small swivel or a big sweep?
  (More pan = more this phase matters.)
- Is there usually fixed background texture (fences, bleachers, field markings)
  the pan estimator can lock onto, or often just open grass/sky?
  **FOOTAGE / ASSETS YOU NEED:**
- A clip with an exaggerated big pan and one with minimal pan, same drill.
- A clip with rich background (bleachers/fence visible) and one with bare
  background, to test the pan estimator’s limits.
  **OUTPUTS THIS PHASE HANDS OFF:**
- A de-panned athlete velocity trace showing the clean two-reversal shuttle
  signature, plus a flag for clips where de-panning isn’t reliable.
  **LEARNINGS:**
- *(append)*

-----

### PHASE 7 — Dual-method timing & agreement gate

**Goal:** Produce the drill time from **two independent methods** and only
trust it when they agree.
**Build (`core/timing.py`):**

- **Method A — Line-crossing (world space):** time the discrete events of the
  athlete’s torso crossing the start line and reaching the turn lines, per the
  drill definition. Robust where lines are visible.
- **Method B — Kinematic reversal:** time from movement-onset → the two
  de-panned velocity-reversal points (the touches) → final crossing back through
  start. Robust where pose is good even if lines are weak.
- **Agreement gate:** if `|A_total − B_total| ≤ agreement_tolerance_s` (config),
  report the time (e.g. their average) with a **confidence score** and the
  per-segment splits. If they disagree, return **`REJECTED`** with reason
  `LOW_CONFIDENCE_DISAGREEMENT` and per-method values for debugging.
- Also reject on: athlete never confidently locked, start line never found for
  Method A while Method B also weak, identity swap detected during timed window,
  or athlete left frame during a touch.
- **Also reject on lost/uncertain identity (Phase 3):** `ATHLETE_LOST` (lock
  lost beyond `max_coast_frames` and not re-acquired to a fingerprint match) or
  `IDENTITY_UNCERTAIN` (cannot confirm the tracked person is the locked athlete
  through the timed window). Never time a rep on a person the system isn’t sure
  is the original athlete.
- **Also reject on the Phase 4 field/anti-cheat verdicts:** `NOT_A_LINED_FIELD`,
  `CALIBRATION_FAILED`, `BAD_GEOMETRY` (turn lines not ~5 yd from center),
  `SHORT_TOUCH` (didn’t reach a line), `NO_FINISH_CROSS`, or `DISTANCE_SHORT`
  (reconstructed path materially under 20 yd). These are the anti-cheat gates —
  a rep must be on a real field, calibrated, with legitimate touches and a full
  finish cross, or it does not get a Verified time.
  **Exit Criteria:** on good clips, A and B agree within tolerance and match ground
  truth within target error (set initial target in config, e.g. ±0.10s; tighten as
  LEARNINGS improve it). On deliberately bad clips, the system **rejects** rather
  than emitting a wrong time.
  **Failure Diagnosis:**
- A and B consistently differ by a fixed offset ⇒ one method has a
  boundary-definition bug (e.g. line-cross uses leading edge, reversal uses COM)
  — align definitions.
- Both wrong the same way ⇒ likely FPS/timestamp issue (back to Phase 1).
  **ASK THE OPERATOR:**
- How tight must agreement be before you’ll show a “Verified” time? (Sets
  `agreement_tolerance_s`.) Stricter = more rejects but more trust.
- Is a higher reject rate acceptable in exchange for never showing a wrong time?
  (You chose reject-and-re-record; confirm the trade-off threshold.)
  **FOOTAGE / ASSETS YOU NEED:**
- The deliberately **bad** clips (crowded, bad-pan, cut-short, invalid) — these
  prove the system rejects instead of guessing.
- A few near-identical good reps to confirm A and B agree consistently.
  **OUTPUTS THIS PHASE HANDS OFF:**
- Per clip: VERIFIED time + confidence + splits, OR REJECTED + reason code; an
  accuracy-vs-ground-truth report broken down by clip-type.
  **LEARNINGS:**
- *(append)*

-----

### PHASE 8 — Distance gate (red/green pre-flight)

**Goal:** Separate, lightweight check that tells the operator **before/while**
filming whether they’re too close or too far. **Not** part of the timing path.
**Build (`core/distance_gate.py`):** estimate athlete bounding-box height as a %
of frame height (and/or person-size vs expected). Below `min_fill` ⇒ too far
(red). Above `max_fill` ⇒ too close (red). In-band ⇒ green. Expose a simple
per-frame status the platform UI can color-overlay.

- **Tie to calibration (important):** “too close” must ALSO trigger when fewer
  than `require_min_yard_lines` (default 3) yard lines are visible — because
  without ≥3 lines the Phase 4 perspective calibration can’t establish the
  5-yard ruler. So the green state means BOTH: athlete well-sized AND enough
  yard lines in frame to measure real distance. This is what guarantees the
  “that is 5 yards” recognition works before they ever record.
  **Exit Criteria:** correctly flags hand-made too-close / too-far / good clips.
  **Failure Diagnosis:** athlete moves toward/away during run ⇒ judge on the
  **start-line stance window**, not the whole rep; allow brief out-of-band frames.
  **ASK THE OPERATOR:**
- What’s the ideal filming distance you want operators to stand at? (Calibrates
  the green band.)
- Should the gate also warn on bad angle/tilt, or only distance for now?
  **FOOTAGE / ASSETS YOU NEED:**
- Matched clips of the SAME rep filmed too close, just right, and too far.
- One clip where the operator drifts closer/farther mid-rep.
  **OUTPUTS THIS PHASE HANDS OFF:**
- A per-frame red/green status the platform UI can consume, validated on the
  too-close / good / too-far clips.
  **LEARNINGS:**
- *(append)*

-----

### PHASE 9 — Result, report & debug artifacts

**Goal:** Make every run inspectable so the system can be improved.
**Build (`core/report.py`):**

- JSON result: `status` (VERIFIED / REJECTED), `total_time`, `splits`,
  `confidence`, `reason_code`, method-A/method-B values, FPS info, athlete
  track id, distance-gate status, **`engine_version`** (model + lib + config
  version that produced this time, per Governance Rule 4), and the
  **calibration** result (pixels-per-yard fit + measured 5-yard spacing) plus the
  **anti-cheat verdicts** (per-touch reach in yards, finish-cross, total
  distance). A stored time must always be traceable to the exact version that
  measured it.
- Annotated MP4: the shared **BLUEPRINT** visualization (§5.V) — glowing person
  outline + translucent overlay + white-line skeleton with named joints (fingertip
  accented) — plus detected lines, onset marker, touch markers, final-cross marker,
  running clock, and a banner showing VERIFIED/REJECTED + reason. (The old box/
  green-skeleton/COM-dot visuals are removed; see §5.V.)
- Per-frame CSV log of all signals (for offline analysis & threshold tuning).
  **Exit Criteria:** from artifacts alone, a human can explain why any rep was
  verified or rejected.
  **ASK THE OPERATOR:**
- What fields does your platform need in the JSON result to display/store a rep?
- Do you want the annotated debug video saved for every rep, or only rejected
  ones (storage trade-off)?
  **FOOTAGE / ASSETS YOU NEED:**
- No new footage — reuses prior clips to confirm the artifacts are readable.
  **OUTPUTS THIS PHASE HANDS OFF:**
- Final JSON schema, annotated MP4, and per-frame CSV — the inspection layer the
  whole self-improvement loop depends on.
  **LEARNINGS:**
- *(append)*

-----

## 5. DRILL DEFINITIONS — one folder per drill (MOVED, 2026-06-26)

> **This is now a MULTI-DRILL platform.** Each drill lives in its own folder under
> `drill_timing/drills/<name>/`, holding its `DrillDefinition` (`__init__.py`,
> self-registered via `@register_drill`), plus its own `drill_config.yaml`,
> `ground_truth.json`, `footage/`, `debug_out/`, `SPEC.md`, `testing.md`, and
> `CHANGELOG_TUNING.md`. The shared engine in `core/` is reused by every drill
> (Principle 8: one drill = one plugin; core is drill-agnostic). Drills are
> auto-discovered by the registry in `drills/__init__.py`; per-drill data paths come
> from `drill_dir()` / `drill_ground_truth_path()` / `drill_debug_out()` there.

**Drills:**
- **`drills/shuttle_5_10_5/`** — the 5-10-5 Pro-Agility Shuttle (first drill). Full
  definition (layout, canonical sequence, hand-touch rule, splits, rejects) now lives
  in `drills/shuttle_5_10_5/SPEC.md`. *Status: paused pending higher-res footage.*
- **`drills/height/`** — verified height measurement (placeholder; not yet built —
  a static measurement, not a timed drill). See `drills/height/README.md`.

This `PLATFORM_SPEC.md` holds the SHARED engine that applies to every drill:
operating principles (Section 0), governance Rules 0-4 (Section 1.5), tech stack
(Section 2), project structure (Section 3), the phase build plan -1 → 9 (Section 4),
config schema (Section 6), and the global learnings log (Section 9).

-----

## 6. CONFIG (config.yaml — initial keys, tune via LEARNINGS)

```yaml
video:
  assume_cfr_if_no_timestamps: true
detection:
  min_confidence: 0.4
  min_box_frac_height: 0.05     # ignore tiny distant people
pose:                           # §5.V BLUEPRINT joints
  backend: mediapipe            # mediapipe (DEFAULT, rich joints) | yolo_pose (COCO-17 rollback)
  pose_task: models/pose_landmarker_full.task   # vendored, fail-loud if missing
  hands_task: models/hand_landmarker.task       # true fingertips for the hand-touch rule
  run_hands: true
  pad_frac: 0.15                # crop padding around the locked box
  min_frac_in_box: 0.5          # confident-keypoints-in-box gate (reject bystander in crop)
  hand_crop_frac: 0.18
  hands_lower_frame_only: true  # perf: run Hands only where a touch can happen
segmentation:                   # §5.V person silhouette (outline + overlay)
  enabled: true
  model: yolov8n-seg.pt         # auto-downloads ~6-7MB once
  proc_width: 640               # downscale for seg inference (perf); 0 = full res
  min_mask_in_box: 0.5          # mask-area-in-box gate (reject bystander silhouette)
render:                         # §5.V blueprint colors/sizes (BGR). Shared by ALL drills.
  silhouette_fill_color: [255, 180, 0]
  silhouette_alpha: 0.25
  outline_color: [255, 230, 150]
  glow_layers: 4
  glow_thickness: 9
  outline_thickness: 2
  skeleton_line_color: [255, 255, 255]   # WHITE connecting lines
  skeleton_line_thickness: 2
  joint_dot_color: [255, 255, 255]
  joint_dot_radius: 3
  fingertip_color: [0, 220, 255]         # accent the hand/fingertip touch point
  head_center_offset_frac: 0.30          # derived head_center: crown offset above eye-line
  debug_boxes: false                     # re-enable the old athlete/candidate boxes for debugging
athlete_lock:
  start_region_frac: 0.25       # central fraction treated as "start area" at t=0
  center_weight: 1.0
  continuity_weight: 2.0
  motion_weight: 1.5
  size_weight: 1.0
  fingerprint_match_threshold: 0.7   # min appearance match to keep/re-bind lock
  rebind_search_radius_frac: 0.15    # how far from predicted pos a re-bind may be
  use_reid_embedding: false          # start with color histogram; enable if needed
  max_coast_frames: 10               # frames to hold a lost lock before rejecting
onset:
  onset_speed_floor: null       # TUNE in Phase 5
  onset_debounce_frames: 3
  require_accel_spike: true
field_calibration:
  known_line_spacing_yd: 5.0     # football field yard lines are 5 yd apart
  min_visible_yard_lines: 3      # need >=3 to fit perspective / pixels->yards
  spacing_tolerance_yd: 0.3      # reconstructed 5-yd spacing must be within this
anti_cheat:
  touch_keypoint: hand           # HAND ONLY (fingertips count); foot does NOT count as a touch
  touch_tolerance_yd: 0.5        # how close the HAND/fingertip reach point must get to the line
  require_hand_touch_both_lines: true   # shuttle: a valid hand touch at BOTH turn lines or reject
  finish_requires_full_cross: true
  total_distance_yd: 20.0        # 5 + 10 + 5 for the shuttle
  distance_tolerance_yd: 1.0     # reject if reconstructed path is shorter than this under target
timing:
  agreement_tolerance_s: 0.12   # tighten as accuracy improves
  target_error_s: 0.10
distance_gate:
  min_fill: 0.20                # athlete box height frac of frame -> too far below
  max_fill: 0.75                # -> too close above
  require_min_yard_lines: 3     # too close if fewer than this many lines visible
smoothing:
  savgol_window: 7
  savgol_poly: 2
```

-----

## 7. HOW TO EXTEND TO MORE DRILLS (later)

- Add `drills/<name>.py` implementing the same `DrillDefinition` interface:
  expected line layout, expected event sequence (onsets / reversals / crossings),
  split definitions, and drill-specific reject rules.
- **Do not** modify core perception/timing to add a drill. If you find yourself
  needing to, that’s a signal the core abstraction is wrong — fix the
  abstraction and record why in LEARNINGS.

-----

## 8. CONSOLIDATED FOOTAGE SHOPPING LIST (shoot this once, up front)

Film everything handheld, panning from the start line, exactly like the real
product. For every clip, record a true time (stopwatch in frame or called out)
so it can be hand-labeled. Aim for **15-20 clips total** covering:

**Core labeled set (the ground truth):**

- 3-4 **clean** reps (athlete alone, good light, normal pan) — includes your
  one **golden** clip.
- 1 **left-open** rep and 1 **right-open** rep (athlete’s first move each
  direction).
- 2-3 **crowded** reps (sideline people; at least one with someone crossing
  between camera and athlete).
- 1-2 **too-close** and 1-2 **too-far** reps (ideally the same rep at different
  distances for the distance gate).
- 1 **bad-pan** rep (big sweep or jerky pan) and 1 **minimal-pan** rep.
- 1 **fidgety-stance** rep and 1 **clean explosive start** rep (for onset
  tuning).
- 1 **worn/shadowed-lines** or alternate-surface rep (turf/grass/indoor as
  relevant).
- 1 **invalid** clip (warm-up, or athlete stops early) — must be REJECTED.

**Calibration/utility clips (not part of the 15-20):**

- 1 stopwatch-only clip of known exact duration (Phase 1 timing check).
- 1 throwaway clip with any person (Phase -1 smoke tests).
- 1 clip per phone/camera setting you might use in production.

**Athlete diversity (spread across the set above):**

- Use **several visibly different athletes** — different heights/builds, running
  styles, and speeds (at least one bigger/heavier athlete, one small/quick one,
  one clearly faster and one slower). This is what proves the system is
  athlete-agnostic. Tag each clip with which athlete it is.
- **Repeatability:** film at least one athlete doing **3-5 honest-effort reps**,
  so you can later check the spread of times on the same person (consistency
  matters as much as accuracy for a “Verified” product).

**Dev vs held-out split (do this when labeling):**

- Split the labeled clips into a **dev set** (tuned on) and a **held-out set**
  (never tuned against — see Governance Rule 3). Keep a couple of clean reps and
  ideally one full athlete out of tuning entirely, so honest accuracy can be
  reported on footage the system never learned from.

-----

## 9. GLOBAL LEARNINGS LOG (cross-phase insights)

Append dated, concrete entries. Each entry: **what was tried → what happened →
what to do differently.** This is the project’s memory; read it before every
build session.

- *(start appending here)*
- **2026-06-23 — Plan 1 (env + VFR-safe ingest) shipped & passed.** Tried: full toolchain
  on CPU-only Windows + generic `core/video.py` ingest. Happened: all green; CPU torch
  pinned, `--probe` reports correct clip facts, `is_vfr=False` correctly, fail-loud on bad
  input. Do differently / remember: (1) **venv from Python 3.12, never 3.13** (mediapipe
  has no cp313 wheel); (2) **install CPU torch first** so ultralytics can't drag CUDA; (3)
  **cv2 ends up 4.13** (mediapipe's opencv-contrib wins) — record the real version per Rule
  4; (4) **ffmpeg/ffprobe needs an admin shell** (`choco install ffmpeg -y`) — deferred, not
  blocking; (5) **always normalize timestamps before VFR detection** (first-frame PTS varies
  by cv2 build). Next: Plan 2 (run.py end-to-end skeleton + annotated video) per testing.md.
- **2026-06-23 — Plan 2 (pipeline spine) shipped & passed.** Tried: build run.py +
  report.py + the result schema + drill-plugin interface as the REAL spine all later phases
  plug into (not a throwaway), then flow the clip end-to-end with no ML. Happened: green in
  8s; annotated mp4 (clock/frame#/banner) + JSON (all Phase 9 fields, engine_version per Rule
  4) + per-frame CSV all produced and verified by readback; `status=DRAFT_SKELETON` correctly
  (partial clip, no finish). Do differently / remember: (1) **codec `mp4v`/.mp4 works without
  system ffmpeg; avoid `avc1`** (OpenH264 1.8.0 DLL mismatch on this box) — fallback
  XVID/MJPG `.avi`; (2) the annotated-video **draw-hooks** (`draw_athlete_box/skeleton/lines/
  event_markers`) are no-op seams later phases fill — keep their signatures stable; (3)
  per-frame **CSV uses a fixed superset header** (DictWriter, restval="") so later phases add
  signal columns without breaking old readers; (4) **DrillDefinition registry** (Principle 8):
  drop a file in `drills/`, decorate with `@register_drill`, never touch core. Next: Plan 3
  (OpenCV frame-stepper labeler → ground_truth.json) per testing.md.
- **2026-06-23 — Plan 3 (ground-truth labeler) tool built & verified; awaiting human
  labeling.** Tried: build `tools/label.py` (OpenCV frame-stepper) to hand-record true event
  frames into `ground_truth.json`. Happened: all non-GUI logic verified green (frame cache,
  generic touch count from drill, partial-clip nulls, VFR-safe timestamps, undo, merge-on-write
  with no-clobber + fail-loud guards + atomic write); GUI render path confirmed via preview.
  Do differently / remember: (1) **labeler + scorer live in `tools/` OUTSIDE `drill_timing/`**
  — Rule 0 made structural (timing code can't import the ground-truth reader/writer); (2)
  `ground_truth.json` is a **dict keyed by clip filename** with `schema_version` — always MERGE
  (load -> upsert -> atomic write), never overwrite the set; (3) cv2 **GUI works (WIN32UI)**,
  use **letter keys primary** (Windows arrow keycodes unreliable); (4) touch frame = **hand at
  maximum reach** (on-screen instruction enforces hand-not-foot); (5) the JSON stores both
  frames AND derived `*_time_s` (via `timestamp_for_index`) so scoring compares true times. The
  actual labeling is a HUMAN step — the tool only enables it. Next: Plan 4 (scoring script +
  `failures.jsonl` writer), which reads ground_truth.json (the ONLY reader).
- **2026-06-23 — Plan 4 (scoring + failure logging) shipped & passed.** Tried: build the truth
  infrastructure — predicted_events block in DrillResult, `tools/score.py` (only ground-truth
  reader), `failures.jsonl` writer, all verified on the partial clip. Happened: all green —
  scorer reports "not scorable (no prediction yet)" honestly with truth shown, `--self-check`
  proves the delta/tolerance math (14/14 incl. boundary flip), failures.jsonl gets a real line
  per non-VERIFIED run, Rule-0 grep clean. Do differently / remember: (1) **score.py + label.py
  live in `tools/` (outside drill_timing/) and are the ONLY ground-truth readers/writers** —
  run a `grep drill_timing/ ground_truth|import score` guard each session (cardinal Rule-0
  sin if it ever hits); (2) **failures.jsonl logs any non-VERIFIED** (REJECTED + DRAFT*) so
  modes cluster; `failure_log.py` is Rule-0-safe (system output, never raises); (3) status/
  reason in result JSON are **plain strings** (str-enums) — scorer compares as strings, never
  reconstructs enums; (4) **dev/held-out reported as SEPARATE aggregate blocks (Rule 3)**,
  held-out is the honest number, empty buckets say "n/a (insufficient data)" — never invent a
  number from one clip; (5) the scorer is built but **dormant on accuracy until Plan 5** fills
  predicted_events with real frames. Next: Plan 5 (onset detection — first ML: detect+pose+
  kinematics+detect_onset) per testing.md; scoring lights up there.
- **2026-06-23 — Plan 5 (first ML: onset). MACHINERY SHIPPED, ACCURACY FAILED (honest).**
  Tried: detect.py + pose.py + kinematics.py + events.py::detect_onset + two-pass run.py;
  detect the start, grade vs the label (frame 9). Happened: pipeline works (detection 100%,
  scorer lit up, self-checks pass), BUT predicted onset = frame 36 vs label 9 = +27 frames
  (+0.9s), far outside the +/-2 target. **TRUE ROOT CAUSE (from the annotated video stills):
  the system LOCKED ONTO THE WRONG PERSON** -- the box+skeleton sat on a bystander standing
  upright on the FAR LEFT while the real drill athlete was on the RIGHT. COM motion was
  computed for the wrong person; "onset 36" was just when THAT person moved. This is the
  Phase 3 athlete-lock problem (spec's #1 pain point) biting early because the interim
  `_pick_athlete` (largest/central box + nearest-box continuity) grabbed the standing bystander.
  The onset-floor "peak-anchored" explanation was a SYMPTOM, not the cause -- re-tuning the
  floor is pointless until the lock is on the right athlete. Do differently /
  remember: (1) **MediaPipe 0.10.35 has no `solutions.pose`** -> used YOLO-Pose
  (yolov8n-pose.pt) behind the swappable PoseBackend; (2) **YOLO-Pose can emit a box with empty
  keypoints** -> guard for full COCO-17; (3) **Windows console is cp1252** -- never print
  Unicode (the delta glyph) in tool output, it crashes; (4) the onset **auto-relative floor
  anchored to peak is wrong for early-commit athletes** -- next: anchor to early-motion range /
  first sustained departure from rest, reduce stance pose jitter, consider vertical-hip/posture
  cues; (5) a pose/COM **glitch produced an impossible negative speed** (frame 35) -- add
  outlier rejection. **Tuning is deferred to Jackson's approval and needs more labeled clips
  (don't overfit to one).** The small-athlete 396x480 worry did NOT materialize (100%
  detection). **#1 NEXT ACTION: fix ATHLETE SELECTION** -- the interim picker grabs the
  largest/central STANDING person (a bystander), not the DRILL athlete who traverses. Bias the
  pick toward the start-line athlete / the box with the most MOTION across the clip, or build
  the real Phase 3 sticky-lock (ByteTrack + appearance fingerprint). Items (4)/(5) above are
  moot until the lock is on the right person. ALWAYS look at the ANNOTATED video, not just the
  scored number -- the wrong-person lock was only obvious visually.
- **2026-06-23 — Phase 3 (sticky athlete-lock) built & PASSING on the 2-person clip.** Tried:
  ByteTrack everyone + drill-likeness selection + fingerprint lock to fix the Plan-5 wrong-person
  bug. Happened: now locks the REAL drill athlete (track 1, drill_score 17.2 vs bystander 6.9),
  cyan box on the right person the whole clip, bystander drawn dim/red + rejected 89x, **0
  identity swaps**, detection_rate 0.99; onset moved from -27 frames (wrong person) to -5 (right
  person). Do differently / remember: (1) **color fingerprint can't separate two people here
  (margin -0.09) — trust the ByteTrack ID as primary, fingerprint only for re-bind/anti-bounce**,
  never a per-frame gate (it made us LOSE the right athlete); (2) **selection must be MOTION-
  dominant** (peak speed + traversal), NOT central/size — a stationary central bystander beat the
  real sprinter until fixed; gate reversals on real motion (jitter faked 9 reversals); (3) needed
  the **`lapx`** dep for ByteTrack (added to requirements); (4) the residual -5 onset is the
  SEPARATE onset-floor task, now legitimately attackable on the right person; (5) crowded
  robustness UNVALIDATED (no footage). Next: tune the onset floor on the correct athlete and/or
  gather the full labeled clip set.
- **2026-06-24 — Pose fix: skeleton must be constrained to the LOCKED box.** Operator caught on
  the annotated video that the skeleton vanished at the bent-over touch and sometimes latched
  onto the bystander, while the box stayed correct. Lesson: **don't pick the highest-confidence
  pose in the crop** — a bystander bleeding into the padded crop wins, and a hard pose drops out.
  Instead pick the pose whose keypoints fall MOST inside the locked box, require >=50% of
  confident keypoints inside it (rejects the other person), and retry pose at low conf (0.10) so
  bent-over touches still resolve. Closed the touch-region gap (0/7 -> 7/7 frames; 99/99
  overall) and verified the skeleton stays on the athlete even when the two people overlap (1px
  apart at f41). Reminder reinforced: the BOX (ByteTrack) and the SKELETON (pose-on-crop) are
  separate signals that can disagree — constrain pose to the box.
- **2026-06-24 — Phase 4A (yard-grid detection + calibration) built & integrated; this clip is
  below the classical detection floor.** Tried: detect the football 5-yard comb, calibrate
  pixels→yards, gate on field validity. Happened: comb-recognition logic verified (self-check
  6/6), run-axis PCA works (-1.4° on this clip), full integration + render-anyway works; BUT the
  396×480 compressed clip's yard lines are too faint/short/broken for reliable classical
  detection → honest NOT_A_LINED_FIELD. Do differently / remember: (1) **orientation from the
  run axis, not hardcoded**; (2) **vertical-morphology + column-profile beats Hough for faint
  broken lines** (Hough grabs the horizontal horizon edge); (3) the **comb recognizer**
  (≥3 parallel + evenly-spaced) is what rejects soccer/stray lines; (4) **1-D-along-run
  calibration** suffices for the shuttle (2-D homography deferred — needs a lateral ref);
  (5) **render box/skeleton even on a field reject** (debug visibility); (6) calibration
  ACCURACY is UNVALIDATED until higher-res footage with visible lines + a known distance —
  low-res social clips are a poor substitute for the spec's "≥3 visible yard lines" footage;
  escalate to a trained line model if classical can't get there on real footage. Next: validate
  4A on real footage; then Phase 4B (identify the 3 drill lines + hand-touch / finish-cross
  anti-cheat), and the deferred onset-floor tuning.
- **2026-06-24 — Onset tuning (operator: "timer starts early"): fixed the LOGIC, but exact
  accuracy needs cleaner footage.** Onset fired at frame 4 (label 9) on a NOISE burst (impossible
  negative + 21 b.h./s COM-speed spikes that collapsed). Fixes: (1) `kinematics.py` rejects
  physically-impossible COM speeds (pose jitter) + clamps smoothed speed >=0; (2) `detect_onset`
  requires a SUSTAINED commit (stay-above-floor confirm window) to reject collapsing transients
  (self-check 4/4). Recorded in `CHANGELOG_TUNING.md` (Rule 2). Onset 4->18, deterministic. KEY
  HONEST FINDING: cleaning the signal showed this 396x480 clip has **no clean onset** -- the
  small athlete's mid-hip jitters at ~1.7 b.h./s at REST, real accel only ~2.6, so there's no
  crisp commit. Tuning to hit frame 9 = overfitting to one clip's noise (Rule 0). Decision
  (Jackson): keep the principled fix, defer +/-2 onset accuracy to higher-res footage. **PATTERN:
  same as the yard lines -- the low-res TikTok clip is below the signal floor for PRECISE
  measurement (great for integration/logic, not for accuracy). The real 60fps higher-res shoot
  (spec Section 8) is now the gating need for validating onset, calibration, and total time.**
- **2026-06-26 — BLUEPRINT visualization shipped (shared §5.V) + pose upgraded to MediaPipe.**
  Operator built a Fable-5 reference (glowing outline + translucent overlay + WHITE skeleton with
  rich joints) and made it the ONE person-tracking visual for ALL drills. Tried: upgrade pose from
  YOLO-Pose (COCO-17) to **MediaPipe Pose** (Tasks API, `pose_landmarker_full.task`, 33 landmarks
  incl. heels + forefoot) + **MediaPipe Hands** (`hand_landmarker.task`) for true fingertips, add
  **YOLOv8-seg** (`yolov8n-seg.pt`) for the person silhouette, and rewrite `core/report.py` to draw
  the blueprint (removed the green skeleton / cyan box / dim-red boxes / magenta COM dot). Happened:
  all green on the dev clip — silhouette + white skeleton render on the LOCKED athlete only (bystander
  has none), fingertip dots accent the touch point, onset/COM pipeline unbroken (onset_frame produced;
  `yolo_pose` rollback gives the identical frame-18 onset as before, proving the COM path is
  untouched). Do differently / remember: (1) **MediaPipe needs a tight CROP** — on the full 396px
  frame it returns 0 poses; on the YOLO person crop it returns a full 33-landmark set with high
  visibility, so we run it on the padded locked-box crop (the crop IS the box constraint, plus the
  ported `_frac_in_box` gate). (2) **`.task` bundles do NOT auto-download** — vendored into
  `<repo>/models/`, fail-loud via `core/model_assets.py` (verified: missing bundle -> clean ERROR +
  exit 2, no stack trace). (3) **mediapipe 0.10.35 has NO `mp.solutions`** — use the Tasks API only;
  landmark indices hardcoded (nose 0, eyes 2/5, ears 7/8, shoulders 11/12, hips 23/24, ankles 27/28,
  heels 29/30, foot_index 31/32, wrists 15/16). (4) **HONESTY (locked with Jackson):** no free model
  gives separable "ball of foot" + "tip of toe" — we draw **ankle->heel->ONE forefoot** and do NOT
  invent a toe tip; `head_center` is DERIVED (eye-line + offset), not native. (5) Keypoints are one
  dense array over `BLUEPRINT_NAMES` (COCO-17 prefix) so every backend fits and the renderer degrades
  gracefully (missing joints' edges/dots just drop). (6) **All config-gated** (`pose.backend`,
  `segmentation.enabled`, `run_hands`, `proc_width`) — rollback is `pose.backend: yolo_pose`. (7) Perf
  is ~2-4x the old single-pass perception, **processing-time only (CPU, offline, free)**. Reinforced:
  ALWAYS inspect the annotated video — the blueprint is now the primary inspection surface. Height
  inherits this automatically (no skeleton of its own) and benefits from the new head/foot joints.
  [SUPERSEDED 2026-06-27: height no longer uses tippy-toe or pose head-top reads — it has no
  anti-cheat and reads the bottom edge of a RULER on the head; see drills/height/README.md §2.1.]
- **2026-06-29 — MediaPipe-first ROI tracker: capability probe PASSED; new shared tracking backbone
  underway.** Context: Jackson built a browser prototype (Fable 5, `Desktop\40-test\app.js`) that
  tracks a person markedly better than the engine's YOLO→ByteTrack→separate-pose path — via a
  digital-zoom ROI that follows the athlete with velocity-lead, per-frame multi-pose candidate
  selection + identity lock, real-timestamp VIDEO-mode MediaPipe, fade-hold, and pose-continuity
  verification. Decision (Jackson): port that METHOD into `core/` as a **config-swappable** backbone
  (`tracker.backend: mediapipe_roi | yolo_bytetrack`), MediaPipe-first, whole shared engine,
  accuracy-first/offline two-pass; old YOLO path stays as the deterministic rollback. **Make-or-break
  unknown was whether the Python `mediapipe==0.10.35` binding supports the three features the 40-test
  uses in JS.** Built `tools/mp_capability_probe.py` and ran it in a fresh **Python 3.12 venv** on a
  real clip (`IMG_4404.MOV`): **ALL PASS** — (1) `RunningMode.VIDEO` + `detect_for_video`; (2)
  `num_poses>1` actually returns multiple poses (returned 2 on a real frame); (3)
  `output_segmentation_masks=True` is populated AND **reads back NONZERO on CPU** (the JS GPU
  all-zero-mask bug does NOT affect the Python/CPU path — the key risk, resolved); cost budget ~48
  ms/frame at 512px with seg ON (CPU, offline — fine). **So NO fallbacks are forced; the
  MediaPipe-first design is viable as planned.** Do differently / remember: (1) a SYNTHETIC blob
  figure is not a reliable BlazePose subject — the probe returned 0 poses on drawn figures and on the
  far/low-res clip; only the CLOSE real clip proved multi-pose. Validate perception on REAL footage
  where the person is reasonably large. (2) `detect_for_video` requires **strictly increasing**
  timestamps and the landmarker carries VIDEO state — never reset the clock backward within one
  instance (the probe's cost loop had to continue the ts, not reset to 1). (3) Python walrus `:=`
  cannot assign to an attribute (`self.x := ...`) — caught by the roi self-check. Built + self-checked
  (no-ML, deterministic) so far: `core/roi.py` (9/9 — crop/velocity-lead/widen/probe-sweep/
  crop→full-frame map) and `core/continuity.py` (11/11 — media-time coverage, run-scoped, frame-rate
  independent). Next: `core/selection.py` (per-frame choose+lock+anchor), then `tracker_mediapipe.py`
  wiring MediaPipe VIDEO + roi + selection, then the `run.py::_perceive` branch. Validation on
  Jackson's NEW footage + A/B vs `yolo_bytetrack` + full regression gate before the default flips
  (Rules 1-3).
  **UPDATE (same day): full build shipped + `mediapipe_roi` ADOPTED as the default.** All 5 modules
  built & self-checked (roi 9/9, selection 9/9, continuity 11/11, tracker_mediapipe 4/4); wired into
  `run.py::_perceive` behind `tracker.backend`; `PoseCoverage` added to the result JSON. Both backends
  ran end-to-end on `IMG_4404.MOV` (`mediapipe_roi`: detection_rate 1.0, pose_coverage 1.0, 0 gaps;
  `yolo_bytetrack`: unchanged, no regression). **Jackson's call: adopt the Fable-5 method as THE
  person-tracking convention — `config.yaml` default flipped to `mediapipe_roi`; `yolo_bytetrack` kept
  ONLY as a one-line rollback, not for new work.** This is an early adopt-before-broad-A/B (only 1 clip
  tested so far) — so the dev/held-out A/B + full regression on Jackson's real shuttle footage is now
  the validation we still owe, but it runs as the default while we do it. Dev doc written:
  `drill_timing/TRACKING_AND_TIMING.md` (the coding standard + backbone how-to). Footage drop:
  `drill_timing/drills/<drill>/footage/` (gitignored). Working the 5-10-5 shuttle first.